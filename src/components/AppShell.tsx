import { useEffect } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider.tsx"
import { church } from "../lib/church.ts"
import { isSharedTablet, supabase } from "../lib/supabase.ts"

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/events", label: "Events", end: false },
  { to: "/prayer", label: "Prayer", end: false },
  { to: "/directory", label: "Directory", end: false },
  { to: "/more", label: "More", end: false },
]

const lockAfterMs = 10 * 60 * 1000

export function AppShell() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isSharedTablet()) return

    let timer = window.setTimeout(() => {
      void lock()
    }, lockAfterMs)

    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void lock()
      }, lockAfterMs)
    }

    const events = ["pointerdown", "keydown", "scroll"] as const
    events.forEach((eventName) => window.addEventListener(eventName, reset, { passive: true }))

    return () => {
      window.clearTimeout(timer)
      events.forEach((eventName) => window.removeEventListener(eventName, reset))
    }

    async function lock() {
      await supabase?.auth.signOut({ scope: "local" })
      await signOut()
      navigate("/login", { replace: true, state: { locked: true } })
    }
  }, [navigate, signOut])

  return (
    <div className="min-h-screen pb-24 lg:pb-10">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-3 no-underline">
            <img
              src="/images/holly-springs-logo-blk.png"
              alt="Holly Springs Baptist Church"
              className="h-14 w-auto"
            />
            <span className="hidden font-serif text-lg font-bold tracking-wide text-navy sm:block">
              {church.portalName}
            </span>
          </NavLink>
          <nav className="hidden gap-1 lg:flex" aria-label="Primary">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `inline-flex min-h-12 items-center rounded-xl px-3 font-bold no-underline ${
                    isActive ? "text-brick" : "text-navy"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Primary">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end}>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
