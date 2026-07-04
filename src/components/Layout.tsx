import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Scale, Users, Package, History, Settings, LogOut, Wifi, WifiOff, CloudUpload, Cloud, Palette, AlertTriangle, Download } from 'lucide-react';
import supabase from '../lib/supabase';
import { useStore } from '../store/useStore';
import { useAuth } from '../contexts/authState';
import ThemeSheet from './ThemeSheet';
import { canInstallPwa, subscribePwaInstall, promptPwaInstall } from '../lib/pwa';

const nav = [
  { to: '/', label: 'Entry', icon: Scale, end: true },
  { to: '/loads', label: 'Loads', icon: Package, end: false },
  { to: '/parties', label: 'Parties', icon: Users, end: false },
  { to: '/history', label: 'History', icon: History, end: false },
  { to: '/manage', label: 'Manage', icon: Settings, end: false },
];

export default function Layout({ children }: { children: ReactNode }) {
  const online = useStore((s) => s.online);
  const pending = useStore((s) => s.pending);
  const dead = useStore((s) => s.dead);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [themeOpen, setThemeOpen] = useState(false);
  const [installable, setInstallable] = useState(canInstallPwa());

  useEffect(() => subscribePwaInstall(() => setInstallable(canInstallPwa())), []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Solid (not blurred) — backdrop-blur here was a permanent GPU
          compositing cost on every scroll frame on Android WebView; a
          near-opaque solid background reads almost identically. */}
      <header className="sticky top-0 z-30 bg-slate-900/98 border-b border-slate-800">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-lime-500 flex items-center justify-center text-slate-950"><Scale size={19} /></div>
            <span className="hidden sm:inline font-bold tracking-tight text-lg">Nexus <span className="text-lime-400">Weight</span></span>
          </div>
          <div className="flex items-center gap-3">
            {pending > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-400"><CloudUpload size={14} />{pending}</span>
            )}
            {dead > 0 && (
              <NavLink to="/backup" title="Failed to sync — tap to review" className="flex items-center gap-1 text-xs text-red-400 font-bold">
                <AlertTriangle size={14} />{dead}
              </NavLink>
            )}
            <span className={`flex items-center gap-1 text-xs ${online ? 'text-lime-400' : 'text-red-400'}`}>
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? 'Online' : 'Offline'}
            </span>
            {installable && (
              <button onClick={() => void promptPwaInstall()} title="Install Nexus Weight" className="p-2 rounded-lg hover:bg-slate-800 text-lime-400">
                <Download size={18} />
              </button>
            )}
            <button onClick={() => setThemeOpen(true)} title="Theme" aria-label="Theme" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
              <Palette size={18} />
            </button>
            <NavLink to="/backup" title="Backup & Restore"
              className={({ isActive }) => `p-2 rounded-lg hover:bg-slate-800 ${isActive ? 'text-lime-400' : 'text-slate-400'}`}>
              <Cloud size={18} />
            </NavLink>
            <button onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}
              aria-label="Sign out" title={user?.email || 'Sign out'} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-4 pb-24 pt-3">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-slate-900/98 border-t border-slate-800">
        <div className="max-w-5xl mx-auto grid grid-cols-5">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${isActive ? 'text-lime-400' : 'text-slate-500'}`}>
              <n.icon size={22} />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <ThemeSheet open={themeOpen} onClose={() => setThemeOpen(false)} />
    </div>
  );
}
