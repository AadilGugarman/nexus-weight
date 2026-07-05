import { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, Loader2, ShieldCheck, LogOut } from 'lucide-react';
import supabase from '../lib/supabase';
import { useAuth } from '../contexts/authState';

export default function AccessGate() {
  const { user, refreshAuthorization } = useAuth();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      // supabase.functions.invoke attaches the current session's JWT automatically.
      const { data, error } = await supabase.functions.invoke('authorize', {
        method: 'POST',
        body: { code: code.trim() },
      });
      const result = data as { authorized?: boolean; error?: string } | null;
      if (!error && result?.authorized) {
        await refreshAuthorization();
      } else {
        setErr(result?.error || 'Invalid access code');
      }
    } catch {
      setErr('Something went wrong. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-lime-500/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-lime-500 flex items-center justify-center mb-3 shadow-lg">
            <ShieldCheck className="text-slate-950" size={34} />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">Company Access Required</h1>
          <p className="text-slate-500 text-sm mt-1.5">Enter your company access code to activate your Nexus Weight account.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter your company access code"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-3 py-3 text-white placeholder-slate-500 focus:border-lime-500 outline-none tracking-wider font-semibold"
            />
          </div>
          {err && <p className="text-red-400 text-sm text-center">{err}</p>}
          <button type="submit" disabled={busy || !code.trim()}
            className="w-full bg-lime-500 text-slate-950 font-bold rounded-xl py-3 hover:bg-lime-400 transition flex items-center justify-center gap-2 disabled:opacity-60">
            {busy && <Loader2 className="animate-spin" size={18} />} Activate Account
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span className="truncate">{user?.email}</span>
          <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-1 text-slate-400 hover:text-white shrink-0">
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </motion.div>
    </div>
  );
}
