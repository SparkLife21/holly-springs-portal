import { BrowserRouter, Route, Routes } from "react-router-dom"
import { AuthProvider } from "./auth/AuthProvider.tsx"
import { RequireAdmin, RequireAuth } from "./auth/RequireAuth.tsx"
import { AppShell } from "./components/AppShell.tsx"
import { church } from "./lib/church.ts"
import { isSupabaseConfigured } from "./lib/supabase.ts"
import { ArchivedPage, ImportPage, InvitesPage, RolesPage } from "./pages/admin/OfficePages.tsx"
import { HouseholdFormPage } from "./pages/admin/HouseholdFormPage.tsx"
import { PersonFormPage } from "./pages/admin/PersonFormPage.tsx"
import { AcceptInvitePage, ForgotPasswordPage, LoginPage, ResetPasswordPage } from "./pages/authPages.tsx"
import { DirectoryPage, HouseholdPage, PrintDirectoryPage } from "./pages/DirectoryPages.tsx"
import { HomePage } from "./pages/HomePage.tsx"
import { ComingSoonPage, MorePage, MyHouseholdPage, NotFoundPage } from "./pages/MorePages.tsx"

export function App() {
  if (!isSupabaseConfigured) return <SetupPage />

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route element={<RequireAuth />}>
            <Route path="/directory/print" element={<PrintDirectoryPage />} />
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="directory" element={<DirectoryPage />} />
              <Route path="households/:id" element={<HouseholdPage />} />
              <Route
                path="events"
                element={
                  <ComingSoonPage
                    title="Events"
                    body="The church calendar is coming in a later update. Sunday worship is at 11:00 AM."
                  />
                }
              />
              <Route
                path="prayer"
                element={
                  <ComingSoonPage
                    title="Prayer"
                    body="Prayer requests in the portal are coming in a later update. Until then, use the prayer form on the church website or tell a pastor on Sunday."
                  />
                }
              />
              <Route path="more" element={<MorePage />} />
              <Route path="more/household" element={<MyHouseholdPage />} />
              <Route element={<RequireAdmin />}>
                <Route path="admin/households/new" element={<HouseholdFormPage />} />
                <Route path="admin/households/:id" element={<HouseholdFormPage />} />
                <Route path="admin/people/new" element={<PersonFormPage />} />
                <Route path="admin/people/:id" element={<PersonFormPage />} />
                <Route path="admin/import" element={<ImportPage />} />
                <Route path="admin/invites" element={<InvitesPage />} />
                <Route path="admin/roles" element={<RolesPage />} />
                <Route path="admin/archived" element={<ArchivedPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

function SetupPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <img
        src="/images/holly-springs-logo-blk.png"
        alt="Holly Springs Baptist Church"
        className="mb-4 h-20 w-auto"
      />
      <h1 className="mb-3 text-4xl">The member portal is not connected yet</h1>
      <p>
        An administrator needs to add the Supabase address and public key before {church.name} members can
        sign in. The setup steps are in the project README.
      </p>
    </main>
  )
}
