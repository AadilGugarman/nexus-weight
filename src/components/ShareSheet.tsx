import { Loader2 } from 'lucide-react';
import BottomSheet from './BottomSheet';

export interface ShareAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  tint: string;
  bg: string;
  onClick: () => void;
  busy?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  actions: ShareAction[];
}

/** "Share Load" bottom sheet — a tappable list of export actions, iOS/Android
 * action-sheet style, ending in an explicit Cancel row. */
export default function ShareSheet({ open, onClose, actions }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Share Load">
      <div className="space-y-2">
        {actions.map((a) => (
          <button
            key={a.key}
            onClick={a.onClick}
            disabled={a.busy}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition active:scale-[0.98] disabled:opacity-60"
            style={{ background: 'var(--surface-2)' }}
          >
            <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: a.bg, color: a.tint }}>
              {a.busy ? <Loader2 size={18} className="animate-spin" /> : a.icon}
            </span>
            <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{a.label}</span>
          </button>
        ))}
        <button
          onClick={onClose}
          className="w-full rounded-2xl py-3.5 text-sm font-bold mt-2"
          style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}
