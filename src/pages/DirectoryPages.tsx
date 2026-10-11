import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider.tsx"
import { PhoneLink } from "../components/PhoneLink.tsx"
import { Banner, ButtonLink, EmptyState, PageHeader } from "../components/ui.tsx"
import { friendlyError } from "../lib/errors.ts"
import { displayName, formatBirthdate } from "../lib/format.ts"
import { isAdminProfile } from "../lib/roles.ts"
import { requireClient } from "../lib/supabase.ts"
import type { DirectoryHousehold, DirectoryMember } from "../lib/types.ts"

export function DirectoryPage() {
  const { profile } = useAuth()
  const { households, error } = useDirectory()
  const [search, setSearch] = useState("")
  const admin = isAdminProfile(profile)

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!households) return []
    if (!needle) return households
    return households.filter((household) => {
      const names = household.members
        .map((member) => `${member.first_name} ${member.last_name} ${member.preferred_name ?? ""}`)
        .join(" ")
      return `${household.name} ${names}`.toLowerCase().includes(needle)
    })
  }, [households, search])

  if (!profile?.linked) return <Unlinked />

  return (
    <div>
      <PageHeader
        title="Directory"
        lede="Search by a first name, last name, or household."
        action={
          <ButtonLink to="/directory/print" variant="quiet" className="no-print">
            Print a paper copy
          </ButtonLink>
        }
      />
      <div className="field mb-4 max-w-xl">
        <label htmlFor="directory-search">Search</label>
        <input
          id="directory-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name"
        />
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {!households && !error ? <p role="status">Loading the directory…</p> : null}
      {households ? (
        <p role="status" className="hint">
          {visible.length === 1 ? "1 household" : `${visible.length} households`}
        </p>
      ) : null}
      {households && visible.length === 0 ? (
        <EmptyState
          title="No one matches that search"
          body="Try a first or last name. If someone is missing, they may have asked to stay out of the directory."
        />
      ) : null}
      <div className="grid gap-4">
        {visible.map((household) => (
          <HouseholdCard key={household.id} household={household} admin={admin} />
        ))}
      </div>
      {admin ? (
        <div className="no-print mt-6 flex flex-wrap gap-3">
          <ButtonLink to="/admin/households/new">Add a household</ButtonLink>
          <ButtonLink to="/admin/import" variant="secondary">
            Import a spreadsheet
          </ButtonLink>
        </div>
      ) : null}
    </div>
  )
}

export function HouseholdPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const { households, error } = useDirectory()
  const admin = isAdminProfile(profile)
  const household = households?.find((item) => item.id === id)

  if (!profile?.linked) return <Unlinked />

  return (
    <div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {!households && !error ? <p role="status">Loading…</p> : null}
      {households && !household ? (
        <EmptyState
          title="This household is not in the directory"
          body="It may be private, archived, or the link may be out of date."
        />
      ) : null}
      {household ? (
        <>
          <PageHeader title={`${household.name} household`} />
          {!household.in_directory && admin ? <p className="badge mb-4">Not shown in the directory</p> : null}
          <HouseholdDetails household={household} admin={admin} />
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink to="/directory" variant="quiet">
              Back to the directory
            </ButtonLink>
            {household.is_own_household ? (
              <ButtonLink to="/more/household" variant="secondary">
                Update our listing
              </ButtonLink>
            ) : null}
            {admin ? (
              <ButtonLink to={`/admin/households/${household.id}`}>Edit household</ButtonLink>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

export function PrintDirectoryPage() {
  const { profile } = useAuth()
  const { households, error } = useDirectory()
  const [printedOn] = useState(() =>
    new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  )

  if (!profile?.linked) return <Unlinked />

  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-6">
      <div className="no-print mb-4">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>{" "}
        <Link to="/directory">Back</Link>
      </div>
      <header className="mb-6">
        <p className="mb-1 font-bold">Holly Springs Baptist Church</p>
        <h1 className="mb-1 text-4xl">Member directory</h1>
        <p className="hint">Printed {printedOn}. Phone numbers appear only when a household has chosen to share them.</p>
      </header>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {!households && !error ? <p role="status">Loading…</p> : null}
      <div className="grid gap-4">
        {households?.map((household) => (
          <article key={household.id} className="card">
            <h2 className="mb-1 text-2xl">{household.name}</h2>
            {household.address ? <p className="mb-1">{household.address}</p> : null}
            {household.primary_phone ? <p className="mb-2">{household.primary_phone}</p> : null}
            <ul className="m-0 list-none p-0">
              {household.members.map((member) => (
                <li key={member.id} className="mb-2">
                  <strong>{displayName(member)}</strong>
                  {member.is_child ? " (child)" : ""}
                  <MemberLines member={member} />
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </main>
  )
}

function HouseholdCard({ household, admin }: { household: DirectoryHousehold; admin: boolean }) {
  return (
    <article className="card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mb-0 text-3xl">
          <Link to={`/households/${household.id}`}>{household.name}</Link>
        </h2>
        {admin && !household.in_directory ? <span className="badge">Not in the directory</span> : null}
      </div>
      <HouseholdDetails household={household} admin={admin} />
      <div className="mt-4">
        <ButtonLink to={`/households/${household.id}`} variant="quiet">
          View household
        </ButtonLink>
      </div>
    </article>
  )
}

function HouseholdDetails({ household, admin }: { household: DirectoryHousehold; admin: boolean }) {
  return (
    <div>
      {household.address ? <p className="mb-1">{household.address}</p> : null}
      {household.primary_phone ? (
        <p className="mb-3">
          <PhoneLink phone={household.primary_phone} kind="tel" label="Call" />
        </p>
      ) : null}
      <ul className="m-0 grid list-none gap-4 p-0">
        {household.members.map((member) => (
          <li key={member.id}>
            <p className="mb-1 text-xl font-bold text-navy">
              {displayName(member)}
              {member.is_child ? <span className="ml-2 badge">Child</span> : null}
              {admin && !member.in_directory ? (
                <span className="ml-2 badge">Not in the directory</span>
              ) : null}
            </p>
            <MemberLines member={member} admin={admin} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function MemberLines({ member, admin = false }: { member: DirectoryMember; admin?: boolean }) {
  const birthday = formatBirthdate(member.birthdate)
  return (
    <div className="grid gap-2">
      {member.mobile_phone ? (
        <p className="mb-0 flex flex-wrap items-center gap-2">
          <PhoneLink phone={member.mobile_phone} kind="tel" label="Call mobile" />
          <PhoneLink phone={member.mobile_phone} kind="sms" label="Text" />
          {admin && member.sharing && !member.sharing.mobile_phone ? (
            <span className="badge">Hidden from the directory</span>
          ) : null}
        </p>
      ) : null}
      {member.home_phone ? (
        <p className="mb-0 flex flex-wrap items-center gap-2">
          <PhoneLink phone={member.home_phone} kind="tel" label="Call home" />
          {admin && member.sharing && !member.sharing.home_phone ? (
            <span className="badge">Hidden from the directory</span>
          ) : null}
        </p>
      ) : null}
      {member.email ? (
        <p className="mb-0">
          <a href={`mailto:${member.email}`}>{member.email}</a>
          {admin && member.sharing && !member.sharing.email ? (
            <span className="ml-2 badge">Hidden from the directory</span>
          ) : null}
        </p>
      ) : null}
      {birthday ? <p className="mb-0">Birthday: {birthday}</p> : null}
    </div>
  )
}

function useDirectory() {
  const [households, setHouseholds] = useState<DirectoryHousehold[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const client = requireClient()
    let alive = true
    client.rpc("directory_households", { search: "" }).then(({ data, error: rpcError }) => {
      if (!alive) return
      if (rpcError) setError(friendlyError(rpcError))
      else setHouseholds((data ?? []) as DirectoryHousehold[])
    })
    return () => {
      alive = false
    }
  }, [])

  return { households, error }
}

function Unlinked() {
  return (
    <EmptyState
      title="Your login is not connected yet"
      body="Ask an admin to invite the same email address you use to sign in."
    />
  )
}
