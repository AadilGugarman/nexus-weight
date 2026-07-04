import { Check, Moon, Sun, MonitorSmartphone } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { useTheme, THEMES, type Mode } from '../lib/theme';

const MODES: { id: Mode; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'System', icon: MonitorSmartphone },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
];

/** Header "🎨 Theme" bottom sheet — appearance mode (System / Dark / Light)
 * plus accent theme preview cards. Selections apply instantly and persist
 * via useTheme (localStorage). */
export default function ThemeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, mode, setTheme, setMode } = useTheme();

  return (
    <BottomSheet open={open} onClose={onClose} title="Theme" subtitle="Applies instantly across the app, PDFs & prints">
      <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>Appearance</p>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button key={m.id} onClick={() => setMode(m.id)}
              className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 font-bold text-xs transition active:scale-95"
              style={active
                ? { background: 'var(--accent)', color: 'var(--accent-fg)' }
                : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <m.icon size={17} /> {m.label}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>Accent Theme</p>
      <div className="grid grid-cols-3 gap-2">
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button key={t.id} onClick={() => setTheme(t.id)}
              className="relative rounded-xl p-2 border-2 transition active:scale-95"
              style={{ borderColor: active ? t.color : 'var(--border)', background: 'var(--surface-2)' }}>
              <div className="h-9 rounded-lg mb-1" style={{ background: `linear-gradient(135deg, ${t.deep}, ${t.color})` }} />
              <p className="text-[11px] font-bold" style={{ color: 'var(--text)' }}>{t.label}</p>
              {active && (
                <span className="absolute top-1 right-1 rounded-full flex items-center justify-center" style={{ background: t.color, width: 18, height: 18 }}>
                  <Check size={11} className="text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
