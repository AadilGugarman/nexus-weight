// Supabase Edge Function: validate-code
//
// Public: validate a company access code WITHOUT redeeming it (called before
// signup, when no session exists yet — so this must accept unauthenticated
// requests). auth: 'none' — verify_jwt is disabled for this function in
// supabase/config.toml, and no sensitive data or side effects are exposed:
// the response is only { valid, error?, codeId? }, never the raw code row.
//
// access_codes has a deny-all RLS policy, so the lookup goes through
// ctx.supabaseAdmin (secret key, bypasses RLS).
//
// Deploy: supabase functions deploy validate-code --no-verify-jwt

import { withSupabase } from "npm:@supabase/server";

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

    try {
      const body = await req.json().catch(() => ({}));
      const raw = (body?.code || "").trim();
      if (!raw) return Response.json({ valid: false, error: "Access code required" }, { status: 400 });

      const { data, error } = await ctx.supabaseAdmin
        .from("access_codes")
        .select("*")
        .ilike("code", raw)
        .eq("is_active", true)
        .limit(1);
      if (error) throw error;

      const code = data?.[0];
      if (!code) return Response.json({ valid: false, error: "Invalid access code" });
      if (code.expires_at && new Date(code.expires_at) < new Date()) {
        return Response.json({ valid: false, error: "This access code has expired" });
      }
      if (code.max_uses != null && code.use_count >= code.max_uses) {
        return Response.json({ valid: false, error: "This access code has reached its usage limit" });
      }
      return Response.json({ valid: true, codeId: code.id });
    } catch (err) {
      console.error("validate-code error:", err);
      return Response.json({ valid: false, error: (err as Error).message }, { status: 500 });
    }
  }),
};
