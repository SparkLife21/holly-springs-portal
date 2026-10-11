import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ error: "This address only accepts invitations." }, 405)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return json({ error: "Please sign in again." }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const portalUrl = Deno.env.get("PORTAL_URL")?.replace(/\/$/, "")

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Invitations are not configured yet." }, 500)
  }

  if (!portalUrl) {
    return json(
      {
        error:
          "Email invitations are not turned on yet. Add PORTAL_URL in the Supabase function settings, then try again.",
      },
      500,
    )
  }

  let personId = ""
  try {
    const body = await req.json()
    personId = typeof body?.person_id === "string" ? body.person_id : ""
  } catch {
    personId = ""
  }

  if (!personId) {
    return json({ error: "Choose a person to invite." }, 400)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: allowed, error: roleError } = await userClient.rpc("is_admin")
  if (roleError || allowed !== true) {
    return json({ error: "Only an admin can send invitations." }, 403)
  }

  const { data: actorId } = await userClient.rpc("current_person_id")
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: person, error: personError } = await admin
    .from("people")
    .select("id, email, user_id, first_name, archived_at")
    .eq("id", personId)
    .maybeSingle()

  if (personError || !person) {
    return json({ error: "That person is not in the directory." }, 404)
  }

  if (person.archived_at) {
    return json({ error: "Restore this person before sending an invitation." }, 400)
  }

  if (!person.email) {
    return json({ error: "Add an email address before sending an invitation." }, 400)
  }

  if (person.user_id) {
    return json(
      {
        error:
          "This person already has a sign-in. Ask them to use “Email me a sign-in link” or “Forgot password.”",
      },
      400,
    )
  }

  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { count: recentCount } = await admin
    .from("invites")
    .select("id", { count: "exact", head: true })
    .eq("person_id", person.id)
    .is("accepted_at", null)
    .gt("created_at", twoMinutesAgo)

  if ((recentCount ?? 0) > 0) {
    return json(
      { error: "An invitation was just sent. Please wait a couple of minutes before sending another." },
      429,
    )
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(person.email, {
    redirectTo: `${portalUrl}/accept-invite`,
  })

  if (inviteError) {
    const already =
      /already|registered|exists/i.test(inviteError.message)
    if (already) {
      return json(
        {
          error:
            "This person already has a sign-in. Ask them to use “Email me a sign-in link” or “Forgot password.”",
        },
        400,
      )
    }
    console.error(inviteError)
    return json(
      { error: "The invitation email could not be sent. Please try again in a few minutes." },
      502,
    )
  }

  const { error: rowError } = await admin.from("invites").insert({
    email: person.email,
    person_id: person.id,
    invited_by: actorId,
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  })

  if (rowError) console.error(rowError)

  await admin.from("audit_log").insert({
    actor_id: actorId,
    action: "member_invited",
    target_table: "people",
    target_id: person.id,
    metadata: { email: person.email },
  })

  return json({ ok: true, email: person.email })
})
