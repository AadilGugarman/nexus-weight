import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/authState';
import AccessGate from '../pages/AccessGate';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, authorized, checkingAuthz } = useAuth();

  if (loading || checkingAuthz) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950 text-lime-400">
      <div className="animate-pulse text-lg font-semibold tracking-wide">Loading Nexus…</div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (!authorized) return <AccessGate />;
  return <>{children}</>;
}
