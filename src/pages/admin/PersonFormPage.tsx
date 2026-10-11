import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Banner, Button, ConfirmDialog, PageHeader } from "../../components/ui.tsx"
import { Check, SharingChecks } from "../MorePages.tsx"
import { friendlyError } from "../../lib/errors.ts"
import { requireClient } from "../../lib/supabase.ts"
import { emptySharing, type ContactPreferences, type DirectorySharing } from "../../lib/types.ts"

const defaultPrefs: ContactPreferences = {
  alert_by_call: true,
  alert_by_text: false,
  alert_by_email: false,
  alert_by_push: false,
  sms_consent_at: null,
  sms_opted_out_at: null,
}

export function PersonFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isNew = !id
  const householdFromQuery = searchParams.get("household") ?? ""
  const [householdId, setHouseholdId] = useState(householdFromQuery)
  const [householdName, setHouseholdName] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [preferredName, setPreferredName] = useState("")
  const [email, setEmail] = useState("")
  const [mobilePhone, setMobilePhone] = useState("")
  const [homePhone, setHomePhone] = useState("")
  const [photoUrl, setPhotoUrl] = useState("")
  const [birthdate, setBirthdate] = useState("")
  const [isChild, setIsChild] = useState(false)
  const [directoryVisible, setDirectoryVisible] = useState(true)
  const [sharing, setSharing] = useState<DirectorySharing>(emptySharing)
  const [prefs, setPrefs] = useState<ContactPreferences>(defaultPrefs)
  const [textAgreed, setTextAgreed] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    if (!id) {
      if (!householdFromQuery) return
      requireClient()
        .from("households")
        .select("name")
        .eq("id", householdFromQuery)
        .single()
        .then(({ data }) => {
          if (data) setHouseholdName(data.name)
        })
      return
    }

    const client = requireClient()
    let alive = true
    client
      .from("people")
      .select(
        "household_id, first_name, last_name, preferred_name, email, mobile_phone, home_phone, photo_url, birthdate, is_child, directory_visible, directory_fields_visible, households(name), contact_preferences(alert_by_call, alert_by_text, alert_by_email, alert_by_push, sms_consent_at, sms_opted_out_at)",
      )
      .eq("id", id)
      .single()
      .then(({ data, error: loadError }) => {
        if (!alive) return
        if (loadError || !data) {
          setError(friendlyError(loadError ?? "That person could not be found."))
          setLoading(false)
          return
        }
        const preference = one(data.contact_preferences) ?? defaultPrefs
        const household = one(data.households)
        setHouseholdId(data.household_id)
        setHouseholdName(household?.name ?? "")
        setFirstName(data.first_name)
        setLastName(data.last_name)
        setPreferredName(data.preferred_name ?? "")
        setEmail(data.email ?? "")
        setMobilePhone(data.mobile_phone ?? "")
        setHomePhone(data.home_phone ?? "")
        setPhotoUrl(data.photo_url ?? "")
        setBirthdate(data.birthdate ?? "")
        setIsChild(data.is_child)
        setDirectoryVisible(data.directory_visible)
        setSharing({ ...emptySharing, ...(data.directory_fields_visible ?? {}) })
        setPrefs(preference)
        setTextAgreed(Boolean(preference.sms_consent_at))
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [householdFromQuery, id])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter a first and last name.")
      return
    }
    if (!householdId) {
      setError("Choose a household first.")
      return
    }
    if (prefs.alert_by_text && !textAgreed && !prefs.sms_consent_at) {
      setError("Texts stay off until this person has agreed to receive them.")
      return
    }
    if (prefs.alert_by_text && prefs.sms_opted_out_at) {
      setError("This person opted out by texting STOP. Texts stay off until they text START.")
      return
    }

    setPending(true)
    setError("")
    setNotice("")
    try {
      const client = requireClient()
      const payload = {
        household_id: householdId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        preferred_name: preferredName.trim() || null,
        email: email.trim() || null,
        mobile_phone: mobilePhone.trim() || null,
        home_phone: homePhone.trim() || null,
        photo_url: photoUrl.trim() || null,
        birthdate: birthdate || null,
        is_child: isChild,
        directory_visible: directoryVisible,
        directory_fields_visible: sharing,
      }
      let personId = id
      if (isNew) {
        const { data, error: insertError } = await client.from("people").insert(payload).select("id").single()
        if (insertError) throw insertError
        personId = data.id
      } else {
        const { error: updateError } = await client.from("people").update(payload).eq("id", id)
        if (updateError) throw updateError
      }

      const { error: prefError } = await client
        .from("contact_preferences")
        .update({
          alert_by_call: prefs.alert_by_call,
          alert_by_text: prefs.alert_by_text,
          alert_by_email: prefs.alert_by_email,
          alert_by_push: prefs.alert_by_push,
        })
        .eq("person_id", personId)
      if (prefError) throw prefError

      if (isChild && personId) {
        const { error: shareError } = await client
          .from("people")
          .update({ directory_fields_visible: sharing })
          .eq("id", personId)
        if (shareError) throw shareError
      }

      if (isNew && personId) {
        navigate(`/admin/people/${personId}`, { replace: true })
        return
      }
      setNotice("Saved.")
    } catch (saveError) {
      setError(friendlyError(saveError))
    } finally {
      setPending(false)
    }
  }

  async function archive() {
    if (!id) return
    setPending(true)
    const { error: archiveError } = await requireClient().rpc("archive_person", { target: id })
    setPending(false)
    if (archiveError) {
      setError(friendlyError(archiveError))
      setConfirmArchive(false)
      return
    }
    navigate(householdId ? `/admin/households/${householdId}` : "/directory")
  }

  if (isNew && !householdFromQuery) {
    return (
      <div>
        <PageHeader title="Add a person" />
        <p>Open a household first, then choose Add a person.</p>
        <Link to="/directory">Back to the directory</Link>
      </div>
    )
  }

  if (loading) return <p role="status">Loading…</p>

  return (
    <form className="grid max-w-3xl gap-4" onSubmit={onSubmit}>
      <PageHeader
        title={isNew ? "Add a person" : `${firstName} ${lastName}`}
        lede={householdName ? `Household: ${householdName}` : undefined}
      />
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      <label className="field">
        <span>First name</span>
        <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
      </label>
      <label className="field">
        <span>Last name</span>
        <input value={lastName} onChange={(event) => setLastName(event.target.value)} required />
      </label>
      <label className="field">
        <span>Name they go by</span>
        <input value={preferredName} onChange={(event) => setPreferredName(event.target.value)} />
      </label>
      <Check checked={isChild} onChange={setIsChild} label="This person is a child" />
      <label className="field">
        <span>Birthday</span>
        <input type="date" value={birthdate} onChange={(event) => setBirthdate(event.target.value)} />
        <p className="hint">Optional. Birthdays stay hidden unless you choose to show them.</p>
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
      </label>
      <label className="field">
        <span>Mobile phone</span>
        <input value={mobilePhone} onChange={(event) => setMobilePhone(event.target.value)} inputMode="tel" />
      </label>
      <label className="field">
        <span>Home phone</span>
        <input value={homePhone} onChange={(event) => setHomePhone(event.target.value)} inputMode="tel" />
      </label>
      <label className="field">
        <span>Photo web address</span>
        <input value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)} />
        <p className="hint">Optional. Uploading a photo from this tablet comes in a later update.</p>
      </label>
      <Check checked={directoryVisible} onChange={setDirectoryVisible} label="List this person in the directory" />
      <SharingChecks value={sharing} onChange={setSharing} />
      <fieldset className="card grid gap-2">
        <legend className="font-bold text-navy">Alert preferences</legend>
        <p className="hint">Phone call is the usual choice when nothing else is set.</p>
        <Check
          checked={prefs.alert_by_call}
          onChange={(checked) => setPrefs({ ...prefs, alert_by_call: checked })}
          label="Phone call"
        />
        <Check
          checked={prefs.alert_by_text}
          disabled={Boolean(prefs.sms_opted_out_at)}
          onChange={(checked) => setPrefs({ ...prefs, alert_by_text: checked })}
          label="Text message"
        />
        {prefs.sms_opted_out_at ? (
          <p className="hint">This person replied STOP. Texts stay off until they text START.</p>
        ) : (
          <Check
            checked={textAgreed || Boolean(prefs.sms_consent_at)}
            onChange={setTextAgreed}
            label="This person has agreed to receive texts"
          />
        )}
        <Check
          checked={prefs.alert_by_email}
          onChange={(checked) => setPrefs({ ...prefs, alert_by_email: checked })}
          label="Email"
        />
        <Check
          checked={prefs.alert_by_push}
          onChange={(checked) => setPrefs({ ...prefs, alert_by_push: checked })}
          label="Phone notification, when that is added"
        />
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save person"}
      </Button>
      {!isNew ? (
        <Button type="button" variant="danger" onClick={() => setConfirmArchive(true)}>
          Archive this person
        </Button>
      ) : null}
      {householdId ? <Link to={`/admin/households/${householdId}`}>Back to the household</Link> : null}
      {confirmArchive ? (
        <ConfirmDialog
          title="Archive this person?"
          body="They leave the directory. If they have a sign-in, it will stop working until an admin restores them."
          confirmLabel="Archive person"
          pending={pending}
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => {
            void archive()
          }}
        />
      ) : null}
    </form>
  )
}

function one<T>(value: T | T[] | null) {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}
