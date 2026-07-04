import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authorized: boolean;
  checkingAuthz: boolean;
  refreshAuthorization: () => Promise<void>;
}

export const AuthContext = createContext<AuthCtx>({
  user: null, session: null, loading: true, authorized: false, checkingAuthz: true, refreshAuthorization: async () => {},
});

export const useAuth = () => useContext(AuthContext);
