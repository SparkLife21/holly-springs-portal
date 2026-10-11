# Holly Springs Baptist Church — Member Portal

Private member portal for [Holly Springs Baptist Church](https://hollyspringsbaptistharmony.org) in Harmony, North Carolina. Sunday worship is at 11:00 AM. The public website stays as it is. This app is the members-only site at `members.hollyspringsbaptistharmony.org`.

**Phase 1 is in this repository.** It covers sign-in, invites, households, people, and the directory. Phone-tree alerts, check-in, events, prayer, and chat are later phases. Do not start those until Phase 1 has been tried with the church.

The portal is a static Vite app on GitHub Pages. All private data lives in Supabase, behind Row Level Security. The anon key is the only key allowed in the browser.

## Folder structure

```
.github/workflows/          GitHub Pages deploy, and a daily keep-awake ping
public/                     Logo, favicon, and CNAME (copied into the build)
src/auth/                   Sign-in state, route guards, shared-tablet lock
src/components/             Header, navigation, buttons, dialogs
src/lib/                    Supabase client, CSV import, church details
src/pages/                  Home, directory, household, More
src/pages/admin/            Add and edit records, import, invites, roles
supabase/migrations/        Phase 1 SQL, including RLS
supabase/seed.sql           Fictional local households and logins
supabase/tests/             Role access checks (pgTAP)
supabase/functions/         invite-member Edge Function
supabase/sample-directory-import.csv
```

## Phase 1 migration plan

One migration: `supabase/migrations/20261011120000_phase1_foundation.sql`.

| Table | What it holds |
| --- | --- |
| `roles`, `person_roles` | The seven roles from the spec. A person may hold more than one. |
| `households` | Name, address, phone, and directory sharing flags. |
| `household_admin_notes` | Pastoral notes. Admins only. Not on the household row, so a family cannot read them through the API. |
| `people` | Directory fields, optional login (`user_id`), archive flag. |
| `contact_preferences` | Call, text, email, and push. Call is on by default. Text consent and STOP are stored here. |
| `invites` | Record of invitation emails. Supabase Auth sends the email. |
| `audit_log` | Role changes, imports, exports, archives, merges, invites. |

Directory browsing does not read the `people` table across households. The app calls `directory_households()`, which removes any phone, email, photo, or birthday the person has chosen to hide before the data leaves the database.

Later migrations, not in this phase:

1. **Phase 2 — Alerts:** `alerts`, `alert_deliveries`, and the `send-alert` Edge Function.
2. **Phase 3 — Check-in:** `children_profiles`, `child_guardians`, `emergency_contacts`, `classrooms`, `checkins`, `checkin_notes`.
3. **Phase 4 — Events and volunteers:** `events`, `volunteer_opportunities`, `volunteer_signups`, `volunteer_requests`.
4. **Phase 5 — Prayer:** `prayer_requests`, `prayer_responses`, `prayer_updates`, and the public prayer form endpoint.
5. **Phase 6 — Chat:** `chat_channels`, `chat_messages`, `chat_reports`.
6. **Phase 7 — PWA push:** `push_subscriptions`.
7. **Later:** giving and reimbursements. Do not store card or bank details.

The public website prayer form can keep posting to FormSubmit until Phase 5. That phase will add the Edge Function and the snippet to paste into the existing form.

## Decisions made for Phase 1

These stay inside the spec. Say if any of them should change before Phase 2.

- A linked church person can open the directory. The Member checkbox is recorded, but forgetting to check it does not lock someone out.
- Admins may assign Alert Sender, Proctor, Children's Ministry Lead, Treasurer, and Member. Only a Super Admin may grant or remove Admin and Super Admin. The last Super Admin cannot be removed.
- Households and people are archived, not deleted. An admin can restore them.
- Email links use the implicit sign-in flow so the link works on whichever phone or tablet opens the email.
- Invitation email is sent by Supabase Auth. For the whole church, set custom SMTP (Resend is a good fit) in the Supabase dashboard so messages do not land in spam. Voice and text are Phase 2. Toll-free verification can take days or weeks, and it is not required for this phase.
- Shared tablets lock after 10 minutes only when "This is a shared tablet" is checked on the sign-in screen.
- Photos are a web address for now. File upload waits until a private storage bucket is added, so member photos are not placed on a public link.
- There is no `supabase/config.toml` in the repo. `supabase init` writes a full file for your CLI version. Set `enable_signup = false` in that file and in the hosted project.

## Local setup

Requirements: Node 22, and the [Supabase CLI](https://supabase.com/docs/guides/local-development) with Docker.

```bash
npm install
cp .env.example .env.local
supabase init
```

In `supabase/config.toml`, set:

```toml
[auth]
enabled = true
site_url = "http://localhost:5173"
additional_redirect_urls = ["http://localhost:5173", "https://members.hollyspringsbaptistharmony.org"]
enable_signup = false

[auth.email]
enable_signup = true
enable_confirmations = false
```

`enable_signup = false` turns off public registration. Leave `[auth.email] enable_signup = true` so password and magic-link sign-in still work.

```bash
supabase start
supabase db reset
```

Copy the local API URL and anon key into `.env.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=the-anon-key-from-supabase-start
```

```bash
npm run dev
```

Open http://localhost:5173. Local invitation emails appear in Inbucket (the URL is printed by `supabase start`). For local invites, set the function secret `PORTAL_URL` to `http://localhost:5173` before calling `invite-member`.

### Sample logins

Password for every sample account: `LocalDev-1847`. These people are fictional. Do not load `seed.sql` into the live church project.

| Email | Role | What to notice |
| --- | --- | --- |
| james.shepherd@example.com | Super Admin | Can grant Admin |
| daniel.brooks@example.com | Admin | Directory tools, cannot grant Super Admin |
| grace.nguyen@example.com | Alert Sender | No directory editing |
| ruth.shepherd@example.com | Member | Own household only |
| helen.porter@example.com | Member | Mobile phone is hidden from other members |
| thomas.whitaker@example.com | Member | Eleanor Whitaker has no login and is still listed |
| hannah.brooks@example.com | Member | Two children, Lily and Caleb |

Maria Alvarez's household is marked private. Paul Nguyen and Eleanor Whitaker have no email and no login.

### Checks you can run locally

```bash
npm test          # spreadsheet parser
npm run lint
npm run build
supabase test db  # role access checks in supabase/tests
```

## Hosted Supabase

1. Create a Supabase project.
2. In Authentication → Providers → Email, leave email enabled.
3. In Authentication → Sign In / Up, turn **off** "Allow new users to sign up".
4. Add redirect URLs:
   - `https://members.hollyspringsbaptistharmony.org`
   - `https://members.hollyspringsbaptistharmony.org/reset-password`
   - `https://members.hollyspringsbaptistharmony.org/accept-invite`
   - `http://localhost:5173` while you are developing
5. Apply the migration (`supabase link` then `supabase db push`). Do not run `seed.sql` on the live project.
6. Create your own login under Authentication → Users.
7. In the SQL editor, run this once. It refuses to run again after a Super Admin exists.

```sql
select public.bootstrap_first_super_admin(
  'you@example.com',
  'YourFirst',
  'YourLast',
  'Your Household'
);
```

8. Deploy the invite function and set `PORTAL_URL`:

```bash
supabase functions deploy invite-member
supabase secrets set PORTAL_URL=https://members.hollyspringsbaptistharmony.org
```

Suggested invitation wording, under Authentication → Email templates → Invite user:

```
Subject: Your Holly Springs member sign-in

Hello,

A church admin created a member portal sign-in for you.

Open this link to choose a password:
{{ .ConfirmationURL }}

If you did not expect this, you can ignore this email.

Holly Springs Baptist Church
Harmony, NC
```

## Environment variables

Never commit `.env`, `.env.local`, or any secret. The repo may be public because GitHub Pages on the free plan requires a public repository.

**GitHub repository variables** (Settings → Secrets and variables → Actions → Variables). These are public in the built JavaScript. They are not secrets.

| Name | Where |
| --- | --- |
| `VITE_SUPABASE_URL` | GitHub variable, and `.env.local` |
| `VITE_SUPABASE_ANON_KEY` | GitHub variable, and `.env.local` |

**Supabase Edge Function secrets.** Supabase injects the first three. You set `PORTAL_URL`.

| Name | Where |
| --- | --- |
| `SUPABASE_URL` | Provided to Edge Functions |
| `SUPABASE_ANON_KEY` | Provided to Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Provided to Edge Functions. Never put this in the app or in GitHub. |
| `PORTAL_URL` | `https://members.hollyspringsbaptistharmony.org` |

Later phases will add Twilio, Resend, VAPID, and Stripe secrets in the same Edge Function settings. None of those belong in this repo.

## GitHub Pages and IONOS

1. Push this project to the GitHub repository that will serve the site.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Add the two repository variables above, then push to `main`. The workflow `.github/workflows/deploy.yml` builds the site and deploys it.
4. After the first deploy, Settings → Pages → Custom domain: `members.hollyspringsbaptistharmony.org`. Turn on **Enforce HTTPS**. The build writes a `CNAME` file so later deploys do not clear the domain.
5. In the GitHub account or organization settings, verify `hollyspringsbaptistharmony.org` so no other project can claim the subdomain.
6. At IONOS, add a **CNAME** record:
   - Host: `members`
   - Points to: `<github-account>.github.io`
   - Do not point `members` at an A record for the public website.

GitHub Pages serves files only. A link such as `/households/some-id` would otherwise 404. The build copies `index.html` to `404.html`, which GitHub Pages returns for unknown paths, and the app reads the address from there. Vite `base` is `/` because the app is the root of its own subdomain.

On the public website, add a **Member Login** link next to Home, Staff, Programs, Beliefs, and Connect. Point it at `https://members.hollyspringsbaptistharmony.org`.

## Keep the project awake

Free Supabase projects pause after about a week without traffic. A paused project cannot send an emergency alert later. `.github/workflows/keepalive.yml` requests the Auth health URL every day. It uses `VITE_SUPABASE_URL`. Supabase Pro is the more reliable choice if the phone tree becomes essential.

## What to try by hand before Phase 2

Use the sample logins locally, or your own Super Admin on the hosted project.

- [ ] Sign in with a password.
- [ ] Sign out, then use "Email me a sign-in link" and open it on a phone.
- [ ] Use Forgot password and set a new one. The screens should be readable without pinching.
- [ ] Check "This is a shared tablet", sign in, wait 10 minutes without touching it, and confirm it returns to the sign-in screen. You can shorten the wait in `src/components/AppShell.tsx` (`lockAfterMs`) while testing, then set it back to 10 minutes.
- [ ] As Ruth, open the directory. Helen's mobile number should be missing. The Alvarez household should be missing. Eleanor Whitaker should appear, with no email.
- [ ] As Ruth, open My household and turn off "Show our address". Sign in as Thomas and confirm the Shepherd address is hidden. Ruth should still see her own address.
- [ ] As Ruth, try to open an admin page by typing `/admin/import`. It should say the page is for admins.
- [ ] As Daniel (admin), add a household, add a person, archive them, and restore them from More → Archived records.
- [ ] As Daniel, try to give someone Super Admin. It should be refused. As James, grant Admin, then try to remove James's own Super Admin while he is the only one. It should be refused.
- [ ] As Daniel, import `supabase/sample-directory-import.csv`, then import it again. The second time, those people should be skipped.
- [ ] Download a backup spreadsheet and print the directory. Pastoral notes ("weekday afternoon") must not appear on the paper copy.
- [ ] Invite a person who has an email. Open the message, choose a password, and land on the home page.
- [ ] Confirm a person with no email is still listed, and that the invite screen asks you to add an email first.
- [ ] On a phone-sized window, check that type is large, buttons are easy to tap, and Home, Events, Prayer, Directory, and More are labeled with words.

Events and Prayer should say they are not ready yet. That is expected in Phase 1.
