import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Banner, Button, ButtonLink, EmptyState, PageHeader } from "../../components/ui.tsx"
import { blankDirectoryCsv, downloadText, planDirectoryImport, type ImportPerson } from "../../lib/csv.ts"
import { friendlyError } from "../../lib/errors.ts"
import { displayName } from "../../lib/format.ts"
import { isSuperAdminProfile } from "../../lib/roles.ts"
import { requireClient } from "../../lib/supabase.ts"
import { ROLE_DETAILS } from "../../lib/types.ts"
import { useAuth } from "../../auth/AuthProvider.tsx"

export function ImportPage() {
  const [fileName, setFileName] = useState("")
  const [people, setPeople] = useState<ImportPerson[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState("")
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)

  const households = useMemo(() => {
    const names = new Set(people.map((person) => person.householdName.trim().toLowerCase()))
    return names.size
  }, [people])

  async function onFile(file: File | undefined) {
    setNotice("")
    setMessage("")
    if (!file) return
    setFileName(file.name)
    try {
      const plan = planDirectoryImport(await file.text())
      setPeople(plan.people)
      setErrors(plan.errors)
    } catch (error) {
      setPeople([])
      setErrors([friendlyError(error)])
    }
  }

  async function runImport() {
    setPending(true)
    setMessage("")
    setNotice("")
    try {
      const client = requireClient()
      const { data: existingHouseholds, error: householdError } = await client
        .from("households")
        .select("id, name")
        .is("archived_at", null)
      if (householdError) throw householdError
      const { data: existingPeople, error: peopleError } = await client
        .from("people")
        .select("id, household_id, first_name, last_name, email")
        .is("archived_at", null)
      if (peopleError) throw peopleError

      const householdIds = new Map(
        (existingHouseholds ?? []).map((household) => [household.name.trim().toLowerCase(), household.id]),
      )
      const knownEmails = new Set(
        (existingPeople ?? []).map((person) => person.email).filter((email): email is string => Boolean(email)),
      )
      const knownPeople = [...(existingPeople ?? [])]
      let insertedHouseholds = 0
      let insertedPeople = 0
      let skipped = 0

      const groups = new Map<string, ImportPerson[]>()
      for (const person of people) {
        const key = person.householdName.trim().toLowerCase()
        groups.set(key, [...(groups.get(key) ?? []), person])
      }

      for (const [key, members] of groups) {
        let householdId = householdIds.get(key)
        if (!householdId) {
          const first = members[0]
          const { data, error } = await client
            .from("households")
            .insert({
              name: first.householdName.trim(),
              address: first.address || null,
              primary_phone: first.primaryPhone || null,
            })
            .select("id")
            .single()
          if (error) throw error
          householdId = data.id
          householdIds.set(key, householdId)
          insertedHouseholds += 1
        }

        for (const person of members) {
          const duplicateEmail = person.email && knownEmails.has(person.email)
          const duplicateName = knownPeople.some(
            (existing) =>
              existing.household_id === householdId &&
              existing.first_name.toLowerCase() === person.firstName.toLowerCase() &&
              existing.last_name.toLowerCase() === person.lastName.toLowerCase(),
          )
          if (duplicateEmail || duplicateName) {
            skipped += 1
            continue
          }
          const { error } = await client.from("people").insert({
            household_id: householdId,
            first_name: person.firstName,
            last_name: person.lastName,
            preferred_name: person.preferredName || null,
            email: person.email || null,
            mobile_phone: person.mobilePhone || null,
            home_phone: person.homePhone || null,
            birthdate: person.birthdate || null,
            is_child: person.isChild,
          })
          if (error) throw error
          if (person.email) knownEmails.add(person.email)
          knownPeople.push({
            id: "new",
            household_id: householdId,
            first_name: person.firstName,
            last_name: person.lastName,
            email: person.email || null,
          })
          insertedPeople += 1
        }
      }

      const { error: auditError } = await client.rpc("record_directory_import", {
        inserted_households: insertedHouseholds,
        inserted_people: insertedPeople,
      })
      if (auditError) throw auditError
      setNotice(`Added ${insertedPeople} ${insertedPeople === 1 ? "person" : "people"}. Skipped ${skipped} already in the directory.`)
      setPeople([])
    } catch (error) {
      setMessage(friendlyError(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <PageHeader
        title="Import a spreadsheet"
        lede="Use this for the first directory load. People already listed, by email or by the same name in the same household, are skipped."
      />
      <Button
        variant="quiet"
        onClick={() => downloadText("directory-template.csv", blankDirectoryCsv())}
      >
        Download a blank spreadsheet
      </Button>
      <label className="field">
        <span>Choose a CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            void onFile(event.target.files?.[0])
          }}
        />
      </label>
      {fileName ? <p className="hint">{fileName}</p> : null}
      {errors.map((error) => (
        <Banner key={error} tone="error">
          {error}
        </Banner>
      ))}
      {message ? <Banner tone="error">{message}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {people.length > 0 && errors.length === 0 ? (
        <div className="card">
          <p>
            Ready to add {people.length} {people.length === 1 ? "person" : "people"} in {households}{" "}
            {households === 1 ? "household" : "households"}.
          </p>
          <Button onClick={() => void runImport()} disabled={pending}>
            {pending ? "Adding people…" : "Add these people"}
          </Button>
        </div>
      ) : null}
      <Link to="/more">Back to More</Link>
    </div>
  )
}

type InvitePerson = {
  id: string
  first_name: string
  last_name: string
  preferred_name: string | null
  email: string | null
  user_id: string | null
  households: { name: string } | { name: string }[] | null
}

export function InvitesPage() {
  const [people, setPeople] = useState<InvitePerson[]>([])
  const [invites, setInvites] = useState<{ id: string; email: string; created_at: string; accepted_at: string | null }[]>([])
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [pendingId, setPendingId] = useState("")

  async function load() {
    const client = requireClient()
    const [peopleResult, inviteResult] = await Promise.all([
      client
        .from("people")
        .select("id, first_name, last_name, preferred_name, email, user_id, households(name)")
        .is("archived_at", null)
        .order("last_name"),
      client.from("invites").select("id, email, created_at, accepted_at").order("created_at", { ascending: false }).limit(20),
    ])
    if (peopleResult.error || inviteResult.error) {
      setError(friendlyError(peopleResult.error ?? inviteResult.error))
      return
    }
    setPeople(peopleResult.data ?? [])
    setInvites(inviteResult.data ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function send(personId: string) {
    setPendingId(personId)
    setError("")
    setNotice("")
    try {
      const client = requireClient()
      const { data, error: invokeError } = await client.functions.invoke("invite-member", {
        body: { person_id: personId },
      })
      if (invokeError) {
        let message = invokeError.message
        const response = (invokeError as { context?: Response }).context
        if (response && typeof response.json === "function") {
          const body = await response.json().catch(() => null)
          if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
            message = body.error
          }
        }
        throw new Error(message)
      }
      if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
        throw new Error(data.error)
      }
      const email = data && typeof data === "object" && "email" in data ? String(data.email) : "them"
      setNotice(`Invitation sent to ${email}. They can choose a password from that email.`)
      await load()
    } catch (sendError) {
      setError(friendlyError(sendError))
    } finally {
      setPendingId("")
    }
  }

  const waiting = people.filter((person) => !person.user_id)

  return (
    <div className="grid max-w-3xl gap-4">
      <PageHeader
        title="Invite a member"
        lede="An invitation email lets them choose a password. People without an email can still be in the directory and receive phone calls."
      />
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {waiting.length === 0 ? (
        <EmptyState title="Everyone with a record has a sign-in, or the directory is empty" body="Add a person with an email address, then come back here." />
      ) : null}
      <ul className="m-0 grid list-none gap-3 p-0">
        {waiting.map((person) => {
          const household = one(person.households)
          return (
            <li key={person.id} className="card">
              <h2 className="mb-1 text-2xl">{displayName(person)}</h2>
              <p className="mb-2 hint">{household?.name ?? "Household"}</p>
              {person.email ? (
                <Button disabled={pendingId === person.id} onClick={() => void send(person.id)}>
                  {pendingId === person.id ? "Sending…" : `Email an invitation to ${person.email}`}
                </Button>
              ) : (
                <p>
                  Add an email address first. <Link to={`/admin/people/${person.id}`}>Edit {person.first_name}</Link>
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {invites.length > 0 ? (
        <section>
          <h2 className="text-2xl">Recent invitations</h2>
          <ul>
            {invites.map((invite) => (
              <li key={invite.id}>
                {invite.email} — {invite.accepted_at ? "accepted" : "waiting"} —{" "}
                {new Date(invite.created_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ButtonLink to="/more" variant="quiet">
        Back to More
      </ButtonLink>
    </div>
  )
}

type RolePerson = {
  id: string
  first_name: string
  last_name: string
  preferred_name: string | null
  person_roles: { roles: { key: string } | { key: string }[] | null }[] | null
}

export function RolesPage() {
  const { profile } = useAuth()
  const superAdmin = isSuperAdminProfile(profile)
  const [people, setPeople] = useState<RolePerson[]>([])
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [pendingId, setPendingId] = useState("")
  const [query, setQuery] = useState("")

  useEffect(() => {
    requireClient()
      .from("people")
      .select("id, first_name, last_name, preferred_name, person_roles(roles(key))")
      .is("archived_at", null)
      .order("last_name")
      .then(({ data, error: loadError }) => {
        if (loadError) {
          setError(friendlyError(loadError))
          return
        }
        const rows = (data ?? []) as RolePerson[]
        setPeople(rows)
        const next: Record<string, string[]> = {}
        for (const person of rows) next[person.id] = roleKeys(person)
        setSelected(next)
      })
  }, [])

  const visible = people.filter((person) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return displayName(person).toLowerCase().includes(needle)
  })

  async function save(personId: string) {
    setPendingId(personId)
    setError("")
    setNotice("")
    const { error: saveError } = await requireClient().rpc("set_person_roles", {
      target_person: personId,
      role_keys: selected[personId] ?? [],
    })
    setPendingId("")
    if (saveError) setError(friendlyError(saveError))
    else setNotice("Roles saved.")
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <PageHeader
        title="Roles"
        lede="A person can hold more than one role. Only a super admin can grant Admin or Super Admin."
      />
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      <label className="field">
        <span>Find a person</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {visible.map((person) => {
        const keys = selected[person.id] ?? []
        const elevated = keys.includes("admin") || keys.includes("super_admin")
        const locked = elevated && !superAdmin
        return (
          <section key={person.id} className="card grid gap-2">
            <h2 className="mb-0 text-2xl">{displayName(person)}</h2>
            {locked ? <p className="hint">Only a super admin can change roles for an admin.</p> : null}
            {ROLE_DETAILS.map((role) => {
              const protectedRole = role.key === "admin" || role.key === "super_admin"
              return (
                <label key={role.key} className="choice">
                  <input
                    type="checkbox"
                    checked={keys.includes(role.key)}
                    disabled={locked || (protectedRole && !superAdmin)}
                    onChange={(event) => {
                      setSelected((current) => {
                        const currentKeys = current[person.id] ?? []
                        const nextKeys = event.target.checked
                          ? [...currentKeys, role.key]
                          : currentKeys.filter((key) => key !== role.key)
                        return { ...current, [person.id]: nextKeys }
                      })
                      setNotice("")
                    }}
                  />
                  <span>
                    {role.label}
                    <span className="mt-1 block font-normal text-muted">{role.description}</span>
                  </span>
                </label>
              )
            })}
            <Button disabled={locked || pendingId === person.id} onClick={() => void save(person.id)}>
              {pendingId === person.id ? "Saving…" : "Save roles"}
            </Button>
          </section>
        )
      })}
      <ButtonLink to="/more" variant="quiet">
        Back to More
      </ButtonLink>
    </div>
  )
}

export function ArchivedPage() {
  const [households, setHouseholds] = useState<{ id: string; name: string }[]>([])
  const [people, setPeople] = useState<{ id: string; first_name: string; last_name: string; preferred_name: string | null }[]>([])
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function load() {
    const client = requireClient()
    const [householdResult, peopleResult] = await Promise.all([
      client.from("households").select("id, name").not("archived_at", "is", null).order("name"),
      client
        .from("people")
        .select("id, first_name, last_name, preferred_name")
        .not("archived_at", "is", null)
        .order("last_name"),
    ])
    if (householdResult.error || peopleResult.error) {
      setError(friendlyError(householdResult.error ?? peopleResult.error))
      return
    }
    setHouseholds(householdResult.data ?? [])
    setPeople(peopleResult.data ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function restoreHousehold(id: string) {
    const { error: restoreError } = await requireClient().rpc("restore_household", { target: id })
    if (restoreError) setError(friendlyError(restoreError))
    else {
      setNotice("Household restored.")
      await load()
    }
  }

  async function restorePerson(id: string) {
    const { error: restoreError } = await requireClient().rpc("restore_person", { target: id })
    if (restoreError) setError(friendlyError(restoreError))
    else {
      setNotice("Person restored.")
      await load()
    }
  }

  const empty = households.length === 0 && people.length === 0

  return (
    <div className="grid max-w-3xl gap-4">
      <PageHeader title="Archived records" lede="Restoring a record puts it back in the directory." />
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {empty ? <EmptyState title="Nothing is archived" body="Archived households and people will show up here." /> : null}
      {households.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="text-2xl">Households</h2>
          {households.map((household) => (
            <div key={household.id} className="card flex flex-wrap items-center justify-between gap-3">
              <strong>{household.name}</strong>
              <Button onClick={() => void restoreHousehold(household.id)}>Restore household</Button>
            </div>
          ))}
        </section>
      ) : null}
      {people.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="text-2xl">People</h2>
          {people.map((person) => (
            <div key={person.id} className="card flex flex-wrap items-center justify-between gap-3">
              <strong>{displayName(person)}</strong>
              <Button onClick={() => void restorePerson(person.id)}>Restore person</Button>
            </div>
          ))}
        </section>
      ) : null}
      <ButtonLink to="/more" variant="quiet">
        Back to More
      </ButtonLink>
    </div>
  )
}

function roleKeys(person: RolePerson) {
  const keys: string[] = []
  for (const entry of person.person_roles ?? []) {
    const role = Array.isArray(entry.roles) ? entry.roles[0] : entry.roles
    if (role?.key) keys.push(role.key)
  }
  return keys
}

function one<T>(value: T | T[] | null) {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}
