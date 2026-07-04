import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Scale, Mail, Lock, Loader2, Heart, KeyRound } from "lucide-react";
import supabase from "../lib/supabase";

type Mode = "login" | "signup" | "forgot";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);
    // Trim + lowercase before hitting Supabase — GoTrue's email format
    // validator rejects stray whitespace (common from autofill/paste) with
    // the same "invalid format" error as a genuinely malformed address.
    const cleanEmail = email.trim().toLowerCase();
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        navigate("/");
      } else if (mode === "signup") {
        // Validate the company access code BEFORE creating the account.
        // validate-code is a public Edge Function (verify_jwt = false) — no session exists yet.
        const { data: vData, error: vErr } = await supabase.functions.invoke(
          "validate-code",
          { body: { code: accessCode.trim() } },
        );
        const vResult = vData as { valid?: boolean; error?: string } | null;
        if (vErr || !vResult?.valid) {
          setErr(vResult?.error || "Invalid access code");
          setBusy(false);
          return;
        }

        const { error } = await supabase.auth.signUp({ email: cleanEmail, password });
        if (error) throw error;
        // Try to redeem immediately if a session was returned (no email confirmation)
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session?.access_token) {
          // supabase.functions.invoke attaches the new session's JWT automatically.
          await supabase.functions.invoke("authorize", {
            method: "POST",
            body: { code: accessCode.trim() },
          });
          navigate("/");
          return;
        }
        setMsg(
          "Account created. Sign in to continue — your access code is verified.",
        );
        setMode("login");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMsg("Password reset link sent to your email.");
      }
    } catch (e) {
      setErr((e as Error).message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-lime-500/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-lime-500 flex items-center justify-center mb-3 shadow-lg">
            <Scale className="text-slate-950" size={34} />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Nexus <span className="text-lime-400">Weight</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Fast digital weight register
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <Mail
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              size={18}
            />
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-3 py-3 text-white placeholder-slate-500 focus:border-lime-500 outline-none"
            />
          </div>
          {mode !== "forgot" && (
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                size={18}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-3 py-3 text-white placeholder-slate-500 focus:border-lime-500 outline-none"
              />
            </div>
          )}
          {mode === "signup" && (
            <div className="relative">
              <KeyRound
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                size={18}
              />
              <input
                type="text"
                required
                placeholder="Company Access Code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-3 py-3 text-white placeholder-slate-500 focus:border-lime-500 outline-none tracking-wider font-semibold"
              />
            </div>
          )}
          {err && <p className="text-red-400 text-sm">{err}</p>}
          {msg && <p className="text-lime-400 text-sm">{msg}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-lime-500 text-slate-950 font-bold rounded-xl py-3 hover:bg-lime-400 transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy && <Loader2 className="animate-spin" size={18} />}
            {mode === "login"
              ? "Sign In"
              : mode === "signup"
                ? "Create Account"
                : "Send Reset Link"}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-slate-500 space-y-1">
          {mode === "login" && (
            <>
              <p>
                <button
                  onClick={() => setMode("forgot")}
                  className="hover:text-lime-400"
                >
                  Forgot password?
                </button>
              </p>
              <p>
                New here?{" "}
                <button
                  onClick={() => setMode("signup")}
                  className="text-lime-400 font-semibold"
                >
                  Sign up
                </button>
              </p>
            </>
          )}
          {mode === "signup" && (
            <p>
              Have an account?{" "}
              <button
                onClick={() => setMode("login")}
                className="text-lime-400 font-semibold"
              >
                Sign in
              </button>
            </p>
          )}
          {mode === "forgot" && (
            <p>
              <button
                onClick={() => setMode("login")}
                className="text-lime-400 font-semibold"
              >
                Back to sign in
              </button>
            </p>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          Developed with{" "}
          <Heart size={13} className="text-rose-500 fill-rose-500" /> by{" "}
          <span className="font-bold text-slate-300">ASZ Nexus</span>
        </div>
      </motion.div>
    </div>
  );
}
