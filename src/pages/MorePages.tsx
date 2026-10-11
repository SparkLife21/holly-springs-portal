import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider.tsx"
import { Banner, Button, ButtonLink, ConfirmDialog, EmptyState, PageHeader } from "../components/ui.tsx"
import { downloadText, toCsv } from "../lib/csv.ts"
import { friendlyError } from "../lib/errors.ts"
import { isAdminProfile } from "../lib/roles.ts"
import { requireClient } from "../lib/supabase.ts"
import { church } from "../lib/church.ts"
import {
  emptySharing,
  type ContactPreferences,
  type DirectorySharing,
} from "../lib/types.ts"

export function MorePage() {
  const { profile, signOut } = useAuth()
  const admin = isAdminProfile(profile)
  const [confirmExport, setConfirmExport] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function exportDirectory() {
    setPending(true)
    setError("")
    try {
      const client = requireClient()
      const { error: auditError } = await client.rpc("record_directory_export")
      if (auditError) throw auditError

      const { data: households, error: householdError } = await client
        .from("households")
        .select("id, name, address, primary_phone, directory_visible, show_address, show_primary_phone")
        .is("archived_at", null)
      if (householdError) throw householdError

      const { data: people, error: peopleError } = await client
        .from("people")
        .select(
          "household_id, first_name, last_name, preferred_name, email, mobile_phone, home_phone, birthdate, is_child, directory_visible, directory_fields_visible",
        )
        .is("archived_at", null)
      if (peopleError) throw peopleError

      const byHousehold = new Map((households ?? []).map((household) => [household.id, household]))
      const rows = [
        [
          "household_name",
          "address",
          "primary_phone",
          "first_name",
          "last_name",
          "preferred_name",
          "email",
          "mobile_phone",
          "home_phone",
          "birthdate",
          "is_child",
        ],
        ...(people ?? []).map((person) => {
          const household = byHousehold.get(person.household_id)
          return [
            household?.name ?? "",
            household?.address ?? "",
            household?.primary_phone ?? "",
            person.first_name,
            person.last_name,
            person.preferred_name ?? "",
            person.email ?? "",
            person.mobile_phone ?? "",
            person.home_phone ?? "",
            person.birthdate ?? "",
            person.is_child ? "yes" : "no",
          ]
        }),
      ]
      downloadText("holly-springs-directory.csv", toCsv(rows))
      setConfirmExport(false)
    } catch (exportError) {
      setError(friendlyError(exportError))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader title="More" lede="Your household, paper directory, and sign out." />
      {profile?.linked ? (
        <ButtonLink to="/more/household" block>
          My household
        </ButtonLink>
      ) : null}
      <ButtonLink to="/directory/print" variant="secondary" block>
        Print a paper directory
      </ButtonLink>
      {admin ? (
        <section className="card grid gap-3" aria-labelledby="admin-tools">
          <h2 id="admin-tools" className="mb-0 text-2xl">
            Admin tools
          </h2>
          <ButtonLink to="/admin/households/new" variant="quiet">
            Add a household
          </ButtonLink>
          <ButtonLink to="/admin/import" variant="quiet">
            Import a spreadsheet
          </ButtonLink>
          <ButtonLink to="/admin/invites" variant="quiet">
            Invite a member
          </ButtonLink>
          <ButtonLink to="/admin/roles" variant="quiet">
            Manage roles
          </ButtonLink>
          <ButtonLink to="/admin/archived" variant="quiet">
            Archived records
          </ButtonLink>
          <Button variant="quiet" onClick={() => setConfirmExport(true)}>
            Download a backup spreadsheet
          </Button>
        </section>
      ) : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button
        variant="secondary"
        onClick={() => {
          void signOut()
        }}
      >
        Sign out
      </Button>
      <p className="hint">
        {church.name}
        <br />
        {church.addressOneLine}
      </p>
      {confirmExport ? (
        <ConfirmDialog
          title="Download the directory?"
          body="This file includes names, phone numbers, and emails. The download is recorded."
          confirmLabel="Download"
          tone="primary"
          pending={pending}
          onCancel={() => setConfirmExport(false)}
          onConfirm={() => {
            void exportDirectory()
          }}
        />
      ) : null}
    </div>
  )
}

type HouseholdDraft = {
  id: string
  name: string
  address: string
  primary_phone: string
  directory_visible: boolean
  show_address: boolean
  show_primary_phone: boolean
}

type PersonDraft = {
  id: string
  first_name: string
  last_name: string
  preferred_name: string
  email: string
  mobile_phone: string
  home_phone: string
  is_child: boolean
  directory_visible: boolean
  directory_fields_visible: DirectorySharing
  contact_preferences: ContactPreferences
}

export function MyHouseholdPage() {
  const { profile, refreshProfile } = useAuth()
  const [household, setHousehold] = useState<HouseholdDraft | null>(null)
  const [people, setPeople] = useState<PersonDraft[]>([])
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!profile?.linked) return
    const client = requireClient()
    let alive = true
    Promise.all([
      client
        .from("households")
        .select("id, name, address, primary_phone, directory_visible, show_address, show_primary_phone")
        .eq("id", profile.household_id)
        .single(),
      client
        .from("people")
        .select(
          "id, first_name, last_name, preferred_name, email, mobile_phone, home_phone, is_child, directory_visible, directory_fields_visible, contact_preferences(alert_by_call, alert_by_text, alert_by_email, alert_by_push, sms_consent_at, sms_opted_out_at)",
        )
        .eq("household_id", profile.household_id)
        .is("archived_at", null)
        .order("last_name"),
    ]).then(([householdResult, peopleResult]) => {
      if (!alive) return
      if (householdResult.error || peopleResult.error) {
        setError(friendlyError(householdResult.error ?? peopleResult.error))
        return
      }
      const row = householdResult.data
      setHousehold({
        id: row.id,
        name: row.name,
        address: row.address ?? "",
        primary_phone: row.primary_phone ?? "",
        directory_visible: row.directory_visible,
        show_address: row.show_address,
        show_primary_phone: row.show_primary_phone,
      })
      setPeople(
        (peopleResult.data ?? []).map((person) => {
          const prefs = one(person.contact_preferences)
          return {
            id: person.id,
            first_name: person.first_name,
            last_name: person.last_name,
            preferred_name: person.preferred_name ?? "",
            email: person.email ?? "",
            mobile_phone: person.mobile_phone ?? "",
            home_phone: person.home_phone ?? "",
            is_child: person.is_child,
            directory_visible: person.directory_visible,
            directory_fields_visible: { ...emptySharing, ...(person.directory_fields_visible ?? {}) },
            contact_preferences: prefs ?? {
              alert_by_call: true,
              alert_by_text: false,
              alert_by_email: false,
              alert_by_push: false,
              sms_consent_at: null,
              sms_opted_out_at: null,
            },
          }
        }),
      )
    })
    return () => {
      alive = false
    }
  }, [profile])

  if (!profile?.linked) {
    return (
      <EmptyState
        title="Your login is not connected yet"
        body="Ask an admin to invite the same email address you use to sign in."
      />
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!household || !profile?.linked) return
    setPending(true)
    setError("")
    setNotice("")
    try {
      const client = requireClient()
      const { error: householdError } = await client
        .from("households")
        .update({
          address: household.address.trim() || null,
          primary_phone: household.primary_phone.trim() || null,
          directory_visible: household.directory_visible,
          show_address: household.show_address,
          show_primary_phone: household.show_primary_phone,
        })
        .eq("id", household.id)
      if (householdError) throw householdError

      for (const person of people) {
        const { error: personError } = await client
          .from("people")
          .update({
            preferred_name: person.preferred_name.trim() || null,
            email: person.email.trim() || null,
            mobile_phone: person.mobile_phone.trim() || null,
            home_phone: person.home_phone.trim() || null,
            directory_visible: person.directory_visible,
            directory_fields_visible: person.directory_fields_visible,
          })
          .eq("id", person.id)
        if (personError) throw personError

        const { error: prefError } = await client
          .from("contact_preferences")
          .update({
            alert_by_call: person.contact_preferences.alert_by_call,
            alert_by_text: person.contact_preferences.alert_by_text,
            alert_by_email: person.contact_preferences.alert_by_email,
            alert_by_push: person.contact_preferences.alert_by_push,
          })
          .eq("person_id", person.id)
        if (prefError) throw prefError
      }

      await refreshProfile()
      setNotice("Saved.")
    } catch (saveError) {
      setError(friendlyError(saveError))
    } finally {
      setPending(false)
    }
  }

  if (!household) {
    return error ? <Banner tone="error">{error}</Banner> : <p role="status">Loading your household…</p>
  }

  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <PageHeader
        title={household.name}
        lede="Update phone numbers and choose what other members can see. To correct a name, ask an admin."
      />
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      <section className="card grid gap-4">
        <h2 className="mb-0 text-2xl">Household</h2>
        <label className="field">
          <span>Address</span>
          <textarea
            value={household.address}
            onChange={(event) => setHousehold({ ...household, address: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Household phone</span>
          <input
            value={household.primary_phone}
            onChange={(event) => setHousehold({ ...household, primary_phone: event.target.value })}
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
        <Check
          checked={household.directory_visible}
          onChange={(checked) => setHousehold({ ...household, directory_visible: checked })}
          label="Show this household in the directory"
        />
        <Check
          checked={household.show_address}
          onChange={(checked) => setHousehold({ ...household, show_address: checked })}
          label="Show our address"
        />
        <Check
          checked={household.show_primary_phone}
          onChange={(checked) => setHousehold({ ...household, show_primary_phone: checked })}
          label="Show the household phone"
        />
      </section>
      {people.map((person, index) => (
        <section key={person.id} className="card grid gap-4">
          <h2 className="mb-0 text-2xl">
            {person.first_name} {person.last_name}
          </h2>
          <label className="field">
            <span>Name you go by</span>
            <input
              value={person.preferred_name}
              onChange={(event) => updatePerson(index, { preferred_name: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={person.email}
              onChange={(event) => updatePerson(index, { email: event.target.value })}
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>Mobile phone</span>
            <input
              value={person.mobile_phone}
              onChange={(event) => updatePerson(index, { mobile_phone: event.target.value })}
              inputMode="tel"
            />
          </label>
          <label className="field">
            <span>Home phone</span>
            <input
              value={person.home_phone}
              onChange={(event) => updatePerson(index, { home_phone: event.target.value })}
              inputMode="tel"
            />
          </label>
          <Check
            checked={person.directory_visible}
            onChange={(checked) => updatePerson(index, { directory_visible: checked })}
            label="List this person in the directory"
          />
          <SharingChecks
            value={person.directory_fields_visible}
            onChange={(directory_fields_visible) => updatePerson(index, { directory_fields_visible })}
          />
          <fieldset className="grid gap-2">
            <legend className="font-bold text-navy">How should we reach them in an alert?</legend>
            <p className="hint">Phone call is the usual choice. Texts require a clear yes.</p>
            <Check
              checked={person.contact_preferences.alert_by_call}
              onChange={(checked) => updatePref(index, { alert_by_call: checked })}
              label="Phone call"
            />
            <Check
              checked={person.contact_preferences.alert_by_text}
              disabled={
                Boolean(person.contact_preferences.sms_opted_out_at) ||
                (person.id !== profile.person_id && !person.contact_preferences.sms_consent_at)
              }
              onChange={(checked) => updatePref(index, { alert_by_text: checked })}
              label="Text message"
            />
            {person.contact_preferences.sms_opted_out_at ? (
              <p className="hint">This person replied STOP. Texts stay off until they text START.</p>
            ) : null}
            {person.id !== profile.person_id &&
            !person.contact_preferences.sms_consent_at &&
            !person.contact_preferences.sms_opted_out_at ? (
              <p className="hint">Texts stay off until this person agrees. They can turn it on from their own login.</p>
            ) : null}
            <Check
              checked={person.contact_preferences.alert_by_email}
              onChange={(checked) => updatePref(index, { alert_by_email: checked })}
              label="Email"
            />
            <Check
              checked={person.contact_preferences.alert_by_push}
              onChange={(checked) => updatePref(index, { alert_by_push: checked })}
              label="Phone notification, when that is added"
            />
          </fieldset>
        </section>
      ))}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save household"}
      </Button>
      <p>
        <Link to="/more">Back to More</Link>
      </p>
    </form>
  )

  function updatePerson(index: number, patch: Partial<PersonDraft>) {
    setPeople((current) => current.map((person, personIndex) => (personIndex === index ? { ...person, ...patch } : person)))
  }

  function updatePref(index: number, patch: Partial<ContactPreferences>) {
    setPeople((current) =>
      current.map((person, personIndex) =>
        personIndex === index
          ? { ...person, contact_preferences: { ...person.contact_preferences, ...patch } }
          : person,
      ),
    )
  }
}

export function ComingSoonPage({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState title="Not ready yet" body={body} />
    </div>
  )
}

export function NotFoundPage() {
  return (
    <div>
      <PageHeader title="That page is not here" />
      <ButtonLink to="/">Go to the home page</ButtonLink>
    </div>
  )
}

export function Check({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <label className="choice">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

export function SharingChecks({
  value,
  onChange,
}: {
  value: DirectorySharing
  onChange: (value: DirectorySharing) => void
}) {
  const items = [
    ["email", "Show email"],
    ["mobile_phone", "Show mobile phone"],
    ["home_phone", "Show home phone"],
    ["photo", "Show photo"],
    ["birthdate", "Show birthday"],
  ] as const

  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 font-bold text-navy">What others can see</legend>
      {items.map(([key, label]) => (
        <Check
          key={key}
          checked={Boolean(value[key])}
          label={label}
          onChange={(checked) => onChange({ ...value, [key]: checked })}
        />
      ))}
    </fieldset>
  )
}

function one<T>(value: T | T[] | null) {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}
