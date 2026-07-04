import { useState, useMemo } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import BottomSheet from './BottomSheet';

interface Props {
  open: boolean;
  onClose: () => void;
  entryCount: number;
  grossWeight: number;
  onConfirm: (containerCount: number, weightPerContainer: number) => Promise<void>;
}

/** Finalize Load bottom sheet — auto-fills Container Count from the entry
 * count (the common "1 entry ≈ 1 container" case), lets the user correct it
 * and enter a per-container weight, shows the tare/net math live, and only
 * commits on explicit confirmation. */
export default function FinalizeSheet({ open, onClose, entryCount, grossWeight, onConfirm }: Props) {
  const [containerCount, setContainerCount] = useState(String(entryCount || ''));
  const [weightPerContainer, setWeightPerContainer] = useState('');
  const [busy, setBusy] = useState(false);

  // Re-seed the auto-fill each time the sheet opens (entryCount may have
  // changed since the last time it was open) — adjusted during render
  // instead of an Effect, per this project's react-hooks/set-state-in-effect rule.
  const [seededOpen, setSeededOpen] = useState(false);
  if (open !== seededOpen) {
    setSeededOpen(open);
    if (open) { setContainerCount(String(entryCount || '')); setWeightPerContainer(''); }
  }

  const tare = useMemo(() => (parseFloat(containerCount) || 0) * (parseFloat(weightPerContainer) || 0), [containerCount, weightPerContainer]);
  const net = grossWeight - tare;

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(parseFloat(containerCount) || 0, parseFloat(weightPerContainer) || 0);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 h-12 text-white outline-none focus:border-lime-500 text-lg font-bold tabular-nums';
  const lbl = 'text-[11px] font-semibold uppercase tracking-wider mb-1.5';

  return (
    <BottomSheet open={open} onClose={onClose} title="Finalize Load" subtitle="Set the tare weight, then confirm — this locks all entries.">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className={lbl} style={{ color: 'var(--text-faint)' }}>Container Count</p>
            <input inputMode="decimal" value={containerCount} placeholder={String(entryCount)}
              onChange={(e) => setContainerCount(e.target.value.replace(/[^0-9.]/g, ''))} className={input} />
          </div>
          <div>
            <p className={lbl} style={{ color: 'var(--text-faint)' }}>Weight / Container (kg)</p>
            <input inputMode="decimal" value={weightPerContainer} placeholder="e.g. 1"
              onChange={(e) => setWeightPerContainer(e.target.value.replace(/[^0-9.]/g, ''))} className={input} />
          </div>
        </div>
        <p className="text-[11px] -mt-2" style={{ color: 'var(--text-faint)' }}>
          Auto-filled from {entryCount} entries — adjust if the actual container count differs.
        </p>

        {/* live summary */}
        <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--surface-2)' }}>
          <SummaryRow label="Gross Weight" value={`${grossWeight.toFixed(2)} kg`} />
          <SummaryRow label="Container Count" value={containerCount || '0'} />
          <SummaryRow label="Weight / Container" value={`${weightPerContainer || '0'} kg`} />
          <div className="h-px my-1" style={{ background: 'var(--border-2)' }} />
          <SummaryRow label="Total Tare" value={`${tare.toFixed(2)} kg`} />
          <SummaryRow label="Net Weight" value={`${net.toFixed(2)} kg`} accent />
        </div>

        <button onClick={() => void confirm()} disabled={busy}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-4 text-base font-black disabled:opacity-60 transition active:scale-95"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
          {busy ? <Loader2 size={20} className="animate-spin" /> : <ShieldCheck size={20} />}
          {busy ? 'Finalizing…' : 'Finalize Load'}
        </button>
      </div>
    </BottomSheet>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold" style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span className={`text-sm tabular-nums ${accent ? 'text-base font-black' : 'font-bold'}`} style={{ color: accent ? 'var(--accent-deep)' : 'var(--text)' }}>{value}</span>
    </div>
  );
}
