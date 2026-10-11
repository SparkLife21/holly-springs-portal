import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Banner, Button, ButtonLink, ConfirmDialog, PageHeader } from "../../components/ui.tsx"
import { Check } from "../MorePages.tsx"
import { friendlyError } from "../../lib/errors.ts"
import { displayName } from "../../lib/format.ts"
import { requireClient } from "../../lib/supabase.ts"

type HouseholdOption = { id: string; name: string }

export function HouseholdFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [primaryPhone, setPrimaryPhone] = useState("")
  const [directoryVisible, setDirectoryVisible] = useState(true)
  const [showAddress, setShowAddress] = useState(true)
  const [showPrimaryPhone, setShowPrimaryPhone] = useState(true)
  const [notes, setNotes] = useState("")
  const [people, setPeople] = useState<{ id: string; first_name: string; last_name: string; preferred_name: string | null; is_child: boolean }[]>([])
  const [others, setOthers] = useState<HouseholdOption[]>([])
  const [mergeId, setMergeId] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [pending, setPending] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmMerge, setConfirmMerge] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    const client = requireClient()
    let alive = true
    client
      .from("households")
      .select("id, name")
      .is("archived_at", null)
      .order("name")
      .then(({ data, error: listError }) => {
        if (!alive) return
        if (listError) setError(friendlyError(listError))
        else setOthers((data ?? []).filter((household) => household.id !== id))
      })

    if (!id) return () => {
      alive = false
    }

    Promise.all([
      client
        .from("households")
        .select("name, address, primary_phone, directory_visible, show_address, show_primary_phone")
        .eq("id", id)
        .single(),
      client.from("household_admin_notes").select("notes").eq("household_id", id).maybeSingle(),
      client
        .from("people")
        .select("id, first_name, last_name, preferred_name, is_child")
        .eq("household_id", id)
        .is("archived_at", null)
        .order("last_name"),
    ]).then(([householdResult, notesResult, peopleResult]) => {
      if (!alive) return
      if (householdResult.error) {
        setError(friendlyError(householdResult.error))
        setLoading(false)
        return
      }
      const row = householdResult.data
      setName(row.name)
      setAddress(row.address ?? "")
      setPrimaryPhone(row.primary_phone ?? "")
      setDirectoryVisible(row.directory_visible)
      setShowAddress(row.show_address)
      setShowPrimaryPhone(row.show_primary_phone)
      setNotes(notesResult.data?.notes ?? "")
      setPeople(peopleResult.data ?? [])
      setLoading(false)
    })

    return () => {
      alive = false
    }
  }, [id])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError("The household needs a name.")
      return
    }
    setPending(true)
    setError("")
    setNotice("")
    try {
      const client = requireClient()
      const payload = {
        name: name.trim(),
        address: address.trim() || null,
        primary_phone: primaryPhone.trim() || null,
        directory_visible: directoryVisible,
        show_address: showAddress,
        show_primary_phone: showPrimaryPhone,
      }
      if (isNew) {
        const { data, error: insertError } = await client.from("households").insert(payload).select("id").single()
        if (insertError) throw insertError
        if (notes.trim()) {
          const { error: notesError } = await client
            .from("household_admin_notes")
            .insert({ household_id: data.id, notes: notes.trim() })
          if (notesError) throw notesError
        }
        navigate(`/admin/households/${data.id}`, { replace: true })
        return
      }
      const { error: updateError } = await client.from("households").update(payload).eq("id", id)
      if (updateError) throw updateError
      const { error: notesError } = await client
        .from("household_admin_notes")
        .upsert({ household_id: id, notes: notes.trim() })
      if (notesError) throw notesError
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
    const { error: archiveError } = await requireClient().rpc("archive_household", { target: id })
    setPending(false)
    if (archiveError) {
      setError(friendlyError(archiveError))
      setConfirmArchive(false)
      return
    }
    navigate("/directory")
  }

  async function merge() {
    if (!id || !mergeId) return
    setPending(true)
    const { error: mergeError } = await requireClient().rpc("merge_households", {
      keep_id: id,
      drop_id: mergeId,
    })
    setPending(false)
    if (mergeError) {
      setError(friendlyError(mergeError))
      setConfirmMerge(false)
      return
    }
    window.location.assign(`/admin/households/${id}`)
  }

  if (loading) return <p role="status">Loading household…</p>

  const mergeName = others.find((household) => household.id === mergeId)?.name

  return (
    <form className="grid max-w-3xl gap-4" onSubmit={onSubmit}>
      <PageHeader
        title={isNew ? "Add a household" : name || "Household"}
        lede="A household is the family or home that shares an address."
      />
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      <label className="field">
        <span>Household name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label className="field">
        <span>Address</span>
        <textarea value={address} onChange={(event) => setAddress(event.target.value)} />
      </label>
      <label className="field">
        <span>Household phone</span>
        <input value={primaryPhone} onChange={(event) => setPrimaryPhone(event.target.value)} inputMode="tel" />
      </label>
      <Check checked={directoryVisible} onChange={setDirectoryVisible} label="Show this household in the directory" />
      <Check checked={showAddress} onChange={setShowAddress} label="Show the address" />
      <Check checked={showPrimaryPhone} onChange={setShowPrimaryPhone} label="Show the household phone" />
      <label className="field">
        <span>Pastoral notes</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        <p className="hint">Only admins can read this. It is not printed in the directory.</p>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save household"}
      </Button>

      {!isNew ? (
        <section className="card grid gap-3">
          <h2 className="mb-0 text-2xl">People</h2>
          {people.length === 0 ? <p>No one is listed yet.</p> : null}
          <ul className="m-0 grid list-none gap-2 p-0">
            {people.map((person) => (
              <li key={person.id}>
                <Link to={`/admin/people/${person.id}`}>
                  {displayName(person)}
                  {person.is_child ? " (child)" : ""}
                </Link>
              </li>
            ))}
          </ul>
          <ButtonLink to={`/admin/people/new?household=${id}`} variant="secondary">
            Add a person
          </ButtonLink>
        </section>
      ) : null}

      {!isNew ? (
        <section className="card grid gap-3">
          <h2 className="mb-0 text-2xl">Combine with another household</h2>
          <p>People move into this household. The other household is archived.</p>
          <label className="field">
            <span>Other household</span>
            <select value={mergeId} onChange={(event) => setMergeId(event.target.value)}>
              <option value="">Choose a household</option>
              {others.map((household) => (
                <option key={household.id} value={household.id}>
                  {household.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="quiet" disabled={!mergeId} onClick={() => setConfirmMerge(true)}>
            Combine households
          </Button>
          <Button type="button" variant="danger" onClick={() => setConfirmArchive(true)}>
            Archive this household
          </Button>
        </section>
      ) : null}

      {confirmArchive ? (
        <ConfirmDialog
          title="Archive this household?"
          body="It leaves the directory. People stay on the record, and an admin can restore it later."
          confirmLabel="Archive household"
          pending={pending}
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => {
            void archive()
          }}
        />
      ) : null}
      {confirmMerge && mergeName ? (
        <ConfirmDialog
          title={`Combine ${mergeName} into ${name}?`}
          body={`${mergeName} will be archived. Everyone in that household will be listed under ${name}.`}
          confirmLabel="Combine households"
          pending={pending}
          onCancel={() => setConfirmMerge(false)}
          onConfirm={() => {
            void merge()
          }}
        />
      ) : null}
    </form>
  )
}
