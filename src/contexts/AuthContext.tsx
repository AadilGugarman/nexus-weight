import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';
import { useStore } from '../store/useStore';
import { AuthContext } from './authState';

async function fetchAuthorized(): Promise<boolean> {
  // supabase.functions.invoke attaches the current session's JWT automatically.
  try {
    const { data, error } = await supabase.functions.invoke('authorize', { method: 'GET' });
    if (error) return false;
    return !!(data as { authorized?: boolean } | null)?.authorized;
  } catch { return false; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuthz, setCheckingAuthz] = useState(true);
  const setUserId = useStore((s) => s.setUser);

  const runAuthzCheck = useCallback(async (s: Session | null) => {
    if (!s?.access_token) { setAuthorized(false); setCheckingAuthz(false); return; }
    setCheckingAuthz(true);
    const ok = await fetchAuthorized();
    setAuthorized(ok);
    setCheckingAuthz(false);
  }, []);

  const refreshAuthorization = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await runAuthzCheck(data.session);
  }, [runAuthzCheck]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setUserId(session?.user?.id ?? null);
      setLoading(false);
      void runAuthzCheck(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setUserId(session?.user?.id ?? null);
      setLoading(false);
      void runAuthzCheck(session);
    });
    return () => subscription.unsubscribe();
  }, [setUserId, runAuthzCheck]);

  return (
    <AuthContext.Provider value={{ user, session, loading, authorized, checkingAuthz, refreshAuthorization }}>
      {children}
    </AuthContext.Provider>
  );
}
