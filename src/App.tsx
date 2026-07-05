import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Loader2 } from 'lucide-react';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/authState';
import { ToastProvider } from './components/Toast';
import Splash from './components/Splash';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import EntryPage from './pages/Entry';
import { useStore } from './store/useStore';
import { initSyncEngine, flushQueue } from './lib/sync';
import { startRealtime, stopRealtime, getRealtimeStatus } from './lib/realtime';
import { initAutoBackup } from './lib/backup';
import { subscribeDiagnostics } from './lib/sync';
import { isPwaUpdateAvailable, subscribePwaUpdate, applyPwaUpdate } from './lib/pwa';

// Entry (the default landing route) and Login (the pre-auth landing route)
// stay eager — one of the two is always needed on first paint. Everything
// else loads on demand, keeping them out of the initial bundle.
const Loads = lazy(() => import('./pages/Loads'));
const LoadDetail = lazy(() => import('./pages/LoadDetail'));
const Parties = lazy(() => import('./pages/Parties'));
const History = lazy(() => import('./pages/History'));
const Manage = lazy(() => import('./pages/Manage'));
const Backup = lazy(() => import('./pages/Backup'));
const Diagnostics = lazy(() => import('./pages/Diagnostics'));

function RouteFallback() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
    </div>
  );
}

function Bootstrap() {
  const { user, loading } = useAuth();
  const { loadAll, setOnline, refreshPending } = useStore();
  const [showSplash, setShowSplash] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(isPwaUpdateAvailable());
  const [updating, setUpdating] = useState(false);

  useEffect(() => subscribePwaUpdate(() => setUpdateAvailable(isPwaUpdateAvailable())), []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    initSyncEngine();
    initAutoBackup();
    void refreshPending();
    // keep the header pending/failed badges live as the engine works in the background
    const unsub = subscribeDiagnostics(() => { void refreshPending(); });
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); unsub(); };
  }, [setOnline, refreshPending]);

  useEffect(() => {
    // Don't load user data or start realtime if this is a password recovery session
    const isRecoveryUrl = window.location.hash.includes('type=recovery');
    if (isRecoveryUrl) return;
    
    if (user) { void loadAll(); startRealtime(user.id); }
    else stopRealtime();
    return () => stopRealtime();
  }, [user, loadAll]);

  // Re-check the realtime connection and flush the offline queue whenever
  // the app returns to the foreground — Android may throttle/kill the
  // WebSocket while backgrounded, and the plain 'online' browser event
  // doesn't reliably fire on a resume that didn't also change connectivity.
  useEffect(() => {
    if (!user) return;
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    import('@capacitor/app').then(({ App }) => {
      if (cancelled) return;
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) return;
        void flushQueue();
        // startRealtime() no-ops while a (possibly stale/errored) channel
        // object still exists, so force a clean reconnect rather than just
        // calling startRealtime() again.
        if (getRealtimeStatus() !== 'connected') { stopRealtime(); startRealtime(user.id); }
      }).then((s) => { if (cancelled) s.remove(); else sub = s; });
    });
    return () => { cancelled = true; sub?.remove(); };
  }, [user]);

  // Hide splash once auth resolves, keeping a minimum 1.6s for a smooth intro.
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => setShowSplash(false), 1600);
    return () => clearTimeout(t);
  }, [loading]);

  const doUpdate = async () => {
    setUpdating(true);
    await applyPwaUpdate();
  };

  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <motion.div key="splash" exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <Splash />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent (non-auto-dismissing) update prompt — a stale-JS reload
          matters too much to risk missing inside a 5s toast. */}
      {updateAvailable && (
        <div className="fixed top-0 inset-x-0 z-[80] flex justify-center px-3 pt-3">
          <button onClick={() => void doUpdate()} disabled={updating}
            className="flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-2xl transition active:scale-95 disabled:opacity-70"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            <RefreshCw size={16} className={updating ? 'animate-spin' : ''} />
            {updating ? 'Updating…' : 'Update available — tap to refresh'}
          </button>
        </div>
      )}

    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<ProtectedRoute><Layout><EntryPage /></Layout></ProtectedRoute>} />
        <Route path="/loads" element={<ProtectedRoute><Layout><Loads /></Layout></ProtectedRoute>} />
        <Route path="/loads/:id" element={<ProtectedRoute><Layout><LoadDetail /></Layout></ProtectedRoute>} />
        <Route path="/parties" element={<ProtectedRoute><Layout><Parties /></Layout></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><Layout><History /></Layout></ProtectedRoute>} />
        <Route path="/manage" element={<ProtectedRoute><Layout><Manage /></Layout></ProtectedRoute>} />
        <Route path="/backup" element={<ProtectedRoute><Layout><Backup /></Layout></ProtectedRoute>} />
        <Route path="/diagnostics" element={<ProtectedRoute><Layout><Diagnostics /></Layout></ProtectedRoute>} />
      </Routes>
    </Suspense>
    </>
  );
}

export default function App() {
  // Intercept recovery tokens BEFORE React Router initializes
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery') && !window.location.pathname.includes('/reset-password')) {
      // Navigate to reset-password without the hash in the pathname
      // The hash will remain in the URL automatically
      window.history.replaceState(null, '', '/reset-password' + hash);
      window.location.reload();
    }
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Bootstrap />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
