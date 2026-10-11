import { useState, type FormEvent, type ReactNode } from "react"
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom"
import { church } from "../lib/church.ts"
import { friendlyError } from "../lib/errors.ts"
import { safeNextPath } from "../lib/format.ts"
import { markSharedTablet, supabase } from "../lib/supabase.ts"
import { useAuth } from "../auth/AuthProvider.tsx"
import { Banner, Button, Field } from "../components/ui.tsx"

export function LoginPage() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const locked = Boolean((location.state as { locked?: boolean } | null)?.locked)
  const next = safeNextPath((location.state as { from?: string } | null)?.from)
  const [mode, setMode] = useState<"password" | "link">("password")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [sharedTablet, setSharedTablet] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [pending, setPending] = useState(false)

  if (loading) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <p role="status">Checking your sign-in…</p>
      </main>
    )
  }

  if (session) return <Navigate to={next} replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setError("")
    setNotice("")
    setPending(true)
    markSharedTablet(sharedTablet)

    if (mode === "link") {
      const { error: linkError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/`,
        },
      })
      setPending(false)
      if (linkError) {
        console.error(linkError)
      }
      setNotice("If that email has an account, a sign-in link is on its way. Check your inbox.")
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setPending(false)
    if (signInError) {
      setError(friendlyError(signInError))
      return
    }
    navigate(next, { replace: true })
  }

  return (
    <AuthLayout>
      {locked ? (
        <Banner tone="info">This tablet was locked after 10 minutes of no use. Please sign in again.</Banner>
      ) : null}
      <form className="grid gap-4" onSubmit={onSubmit}>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        {mode === "password" ? (
          <Field label="Password" htmlFor="password">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
        ) : null}
        <label className="choice">
          <input
            type="checkbox"
            checked={sharedTablet}
            onChange={(event) => setSharedTablet(event.target.checked)}
          />
          <span>This is a shared tablet. Sign me out after 10 minutes of no use.</span>
        </label>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {notice ? <Banner tone="success">{notice}</Banner> : null}
        <Button type="submit" block disabled={pending}>
          {pending ? "Please wait…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
        </Button>
        <button
          type="button"
          className="btn btn-quiet btn-block"
          onClick={() => {
            setMode(mode === "password" ? "link" : "password")
            setError("")
            setNotice("")
          }}
        >
          {mode === "password" ? "Email me a sign-in link instead" : "Use a password instead"}
        </button>
      </form>
      <p className="mt-4">
        <Link to="/forgot-password">Forgot password</Link>
      </p>
      <p className="hint">
        Need an account? Ask a church admin to invite you. There is no public sign-up.
      </p>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [notice, setNotice] = useState("")
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setPending(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setPending(false)
    if (error) console.error(error)
    setNotice("If that email has an account, a reset link is on its way. Check your inbox.")
  }

  return (
    <AuthLayout title="Reset your password">
      <form className="grid gap-4" onSubmit={onSubmit}>
        <Field label="Email" htmlFor="email" hint="We will email you a link to choose a new password.">
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        {notice ? <Banner tone="success">{notice}</Banner> : null}
        <Button type="submit" block disabled={pending}>
          {pending ? "Sending…" : "Email me a reset link"}
        </Button>
      </form>
      <p className="mt-4">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    if (password.length < 8) {
      setError("Use at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Those passwords do not match.")
      return
    }
    setPending(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setPending(false)
    if (updateError) {
      setError(friendlyError(updateError))
      return
    }
    navigate("/", { replace: true })
  }

  return (
    <AuthLayout title="Choose a new password">
      {loading ? <p role="status">Checking your link…</p> : null}
      {!loading && !session ? (
        <Banner tone="info">
          Open the reset link in your email, or <Link to="/forgot-password">ask for a new one</Link>.
        </Banner>
      ) : null}
      {session ? (
        <form className="grid gap-4" onSubmit={onSubmit}>
          <Field label="New password" htmlFor="password" hint="Use at least 8 characters.">
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label="Type it again" htmlFor="confirm">
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          {error ? <Banner tone="error">{error}</Banner> : null}
          <Button type="submit" block disabled={pending}>
            {pending ? "Saving…" : "Save password"}
          </Button>
        </form>
      ) : null}
    </AuthLayout>
  )
}

export function AcceptInvitePage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    if (password.length < 8) {
      setError("Use at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Those passwords do not match.")
      return
    }
    setPending(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setPending(false)
    if (updateError) {
      setError(friendlyError(updateError))
      return
    }
    navigate("/", { replace: true })
  }

  return (
    <AuthLayout title="Welcome">
      {loading ? <p role="status">Opening your invitation…</p> : null}
      {!loading && !session ? (
        <Banner tone="info">
          This invitation link is missing or has expired. Ask an admin to send a new one.
        </Banner>
      ) : null}
      {session ? (
        <>
          <p>Choose a password you can remember. You can also use an email sign-in link later.</p>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <Field label="Password" htmlFor="password" hint="Use at least 8 characters.">
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field label="Type it again" htmlFor="confirm">
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </Field>
            {error ? <Banner tone="error">{error}</Banner> : null}
            <Button type="submit" block disabled={pending}>
              {pending ? "Saving…" : "Save password"}
            </Button>
            <button type="button" className="btn btn-quiet btn-block" onClick={() => navigate("/")}>
              Continue without a password
            </button>
          </form>
        </>
      ) : null}
    </AuthLayout>
  )
}

function AuthLayout({ title = "Member sign-in", children }: { title?: string; children: ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <img
        src="/images/holly-springs-logo-blk.png"
        alt="Holly Springs Baptist Church"
        className="mx-auto mb-4 h-20 w-auto"
      />
      <p className="mb-1 text-center font-serif text-sm font-bold tracking-[0.18em] text-navy uppercase">
        {church.name}
      </p>
      <h1 className="mb-6 text-center text-4xl">{title}</h1>
      <div className="card">{children}</div>
      <p className="mt-6 text-center">
        Need help? Email <a href={`mailto:${church.email}`}>{church.email}</a>
      </p>
    </main>
  )
}
