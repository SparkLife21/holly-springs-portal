import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "./AuthProvider.tsx"
import { isAdminProfile } from "../lib/roles.ts"

export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p role="status">Checking your sign-in…</p>
      </main>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

export function RequireAdmin() {
  const { profile, loading } = useAuth()

  if (loading) {
    return <p role="status">Loading…</p>
  }

  if (!isAdminProfile(profile)) {
    return (
      <div>
        <h1 className="mb-3 text-4xl">This page is for admins</h1>
        <p>Ask a super admin if you need to manage the directory.</p>
      </div>
    )
  }

  return <Outlet />
}
