import { Link } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider.tsx"
import { ButtonLink } from "../components/ui.tsx"
import { church } from "../lib/church.ts"
import { greetingName, isAdminProfile } from "../lib/roles.ts"

export function HomePage() {
  const { profile } = useAuth()
  const name = greetingName(profile)
  const admin = isAdminProfile(profile)

  return (
    <div className="grid gap-5">
      <header>
        <p className="mb-1 font-serif text-sm font-bold tracking-[0.16em] text-brick uppercase">
          {church.name}
        </p>
        <h1 className="mb-2 text-4xl leading-tight">{name ? `Hello, ${name}` : "Welcome"}</h1>
        <p className="max-w-3xl text-lg">
          {church.verse} <span className="font-bold">{church.verseRef}</span>
        </p>
      </header>

      {!profile?.linked ? (
        <div className="card">
          <h2 className="mb-2 text-2xl">
            {profile?.reason === "archived" ? "This record is archived" : "Your login is not connected yet"}
          </h2>
          <p className="mb-0">
            {profile?.reason === "archived"
              ? "An admin archived this household or person. Ask them if this is a mistake."
              : "Ask an admin to invite the same email address you use to sign in. You can still read the worship time below."}
          </p>
        </div>
      ) : null}

      <section className="card" aria-labelledby="worship-heading">
        <h2 id="worship-heading" className="mb-2 text-3xl">
          Sunday worship
        </h2>
        <p className="mb-1 text-2xl font-bold text-navy">{church.worship}</p>
        <p className="mb-4">
          {church.addressLines[0]}
          <br />
          {church.addressLines[1]}
        </p>
        <a className="btn btn-secondary" href={church.mapsUrl}>
          Open the address in maps
        </a>
      </section>

      {profile?.linked ? (
        <section className="grid gap-3 sm:grid-cols-2" aria-label="Shortcuts">
          <ButtonLink to="/directory" variant="primary">
            Open the directory
          </ButtonLink>
          <ButtonLink to="/more/household" variant="secondary">
            My household
          </ButtonLink>
        </section>
      ) : null}

      {admin ? (
        <section className="card" aria-labelledby="office-heading">
          <h2 id="office-heading" className="mb-3 text-2xl">
            Church office
          </h2>
          <div className="grid gap-3">
            <ButtonLink to="/admin/households/new">Add a household</ButtonLink>
            <ButtonLink to="/admin/invites" variant="secondary">
              Invite a member
            </ButtonLink>
            <p className="hint mb-0">
              Phone-tree alerts, events, and prayer requests are in later updates.{" "}
              <Link to="/more">More tools</Link>
            </p>
          </div>
        </section>
      ) : null}
    </div>
  )
}
