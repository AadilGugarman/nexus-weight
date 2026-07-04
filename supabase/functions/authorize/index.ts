// Supabase Edge Function: authorize
//
// Redeems / checks a company access code for the calling (authenticated) user.
//   GET  -> { authorized: boolean }
//   POST { code } -> redeems a code (idempotent) -> { authorized: boolean, error?: string }
//
// Built on @supabase/server's withSupabase auth wrapper: it verifies the JWT
// against the project's JWKS, exposes the caller's identity as ctx.userClaims
// (no extra network round-trip), and handles CORS/OPTIONS automatically.
// auth: 'user' keeps the platform-level JWT check enabled (supabase/config.toml).
//
// access_codes has a deny-all RLS policy and authorized_users has no INSERT
// policy for regular users, so every query below goes through
// ctx.supabaseAdmin (secret key, bypasses RLS) rather than ctx.supabase.
//
// Deploy: supabase functions deploy authorize

import { withSupabase } from "npm:@supabase/server";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims!.id;
    const email = ctx.userClaims!.email;

    try {
      if (req.method === "GET") {
        const { data } = await ctx.supabaseAdmin
          .from("authorized_users").select("user_id").eq("user_id", userId).limit(1);
        return Response.json({ authorized: !!(data && data.length) });
      }

      if (req.method === "POST") {
        // already authorized? no code needed again
        const { data: existing } = await ctx.supabaseAdmin
          .from("authorized_users").select("user_id").eq("user_id", userId).limit(1);
        if (existing && existing.length) return Response.json({ authorized: true });

        const body = await req.json().catch(() => ({}));
        const raw = (body?.code || "").trim();
        if (!raw) return Response.json({ authorized: false, error: "Access code required" }, { status: 400 });

        const { data: codes, error: cErr } = await ctx.supabaseAdmin
          .from("access_codes").select("*").ilike("code", raw).eq("is_active", true).limit(1);
        if (cErr) throw cErr;
        const code = codes?.[0];
        if (!code) return Response.json({ authorized: false, error: "Invalid access code" }, { status: 403 });
        if (code.expires_at && new Date(code.expires_at) < new Date())
          return Response.json({ authorized: false, error: "This access code has expired" }, { status: 403 });
        if (code.max_uses != null && code.use_count >= code.max_uses)
          return Response.json({ authorized: false, error: "This access code has reached its usage limit" }, { status: 403 });

        const { error: insErr } = await ctx.supabaseAdmin.from("authorized_users").insert({
          user_id: userId, email, access_code_id: code.id,
        });
        if (insErr) throw insErr;

        await ctx.supabaseAdmin.from("access_codes")
          .update({ use_count: (code.use_count || 0) + 1 }).eq("id", code.id);
        return Response.json({ authorized: true });
      }

      return Response.json({ error: "Method not allowed" }, { status: 405 });
    } catch (err) {
      console.error("authorize error:", err);
      return Response.json({ authorized: false, error: (err as Error).message }, { status: 500 });
    }
  }),
};
