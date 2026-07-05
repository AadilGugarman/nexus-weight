import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Scale, Lock, Loader2, Heart, CheckCircle2 } from "lucide-react";
import supabase from "../lib/supabase";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validToken, setValidToken] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we have a valid recovery session
    const checkRecoveryToken = async () => {
      const hash = window.location.hash;
      
      // Check if this is a recovery link
      if (!hash || !hash.includes('type=recovery')) {
        setValidToken(false);
        setErr('Invalid or expired reset link. Please request a new one.');
        return;
      }

      // Give Supabase a moment to process the hash and set up the session
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if we have a valid session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setValidToken(false);
        setErr('Invalid or expired reset link. Please request a new one.');
      } else {
        setValidToken(true);
      }
    };

    void checkRecoveryToken();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (password.length < 6) {
      setErr("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setErr("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });
      
      if (error) throw error;

      setSuccess(true);
      setMsg("Password updated successfully! Redirecting to login...");
      
      // Sign out the recovery session and redirect to login
      await supabase.auth.signOut();
      
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (e) {
      setErr((e as Error).message || "Failed to update password");
    } finally {
      setBusy(false);
    }
  };

  // Show loading state while checking token
  if (validToken === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Loader2 size={40} className="animate-spin text-lime-400" />
      </div>
    );
  }

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
            {success ? (
              <CheckCircle2 className="text-slate-950" size={34} />
            ) : (
              <Scale className="text-slate-950" size={34} />
            )}
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {success ? "All Set!" : "Reset Password"}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {success ? "Your password has been updated" : "Enter your new password"}
          </p>
        </div>

        {!validToken ? (
          <div className="space-y-4">
            <p className="text-red-400 text-sm text-center">{err}</p>
            <button
              onClick={() => navigate("/login")}
              className="w-full bg-slate-800 border border-slate-700 text-white font-bold rounded-xl py-3 hover:bg-slate-700 transition"
            >
              Back to Login
            </button>
          </div>
        ) : !success ? (
          <form onSubmit={submit} className="space-y-3">
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                size={18}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-3 py-3 text-white placeholder-slate-500 focus:border-lime-500 outline-none"
              />
            </div>
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                size={18}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-3 py-3 text-white placeholder-slate-500 focus:border-lime-500 outline-none"
              />
            </div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            {msg && <p className="text-lime-400 text-sm">{msg}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-lime-500 text-slate-950 font-bold rounded-xl py-3 hover:bg-lime-400 transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy && <Loader2 className="animate-spin" size={18} />}
              Update Password
            </button>
          </form>
        ) : (
          <div className="text-center">
            <p className="text-lime-400 font-semibold mb-4">{msg}</p>
          </div>
        )}

        <div className="mt-5 text-center text-sm text-slate-500">
          <p>
            <button
              onClick={() => navigate("/login")}
              className="text-lime-400 font-semibold hover:underline"
            >
              Back to sign in
            </button>
          </p>
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
