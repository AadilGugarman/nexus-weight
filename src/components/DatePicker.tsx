import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  value: string; // yyyy-mm-dd or ''
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** shorter control (h-9, smaller icon/text) — for compact filter panels */
  compact?: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromISO(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y) return null;
  return new Date(y, m - 1, d);
}

export default function DatePicker({ value, onChange, placeholder = 'Select date', className = '', compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const selected = fromISO(value);
  const [view, setView] = useState(() => selected || new Date());
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Jump the visible month back to the selected date each time the panel
  // opens — adjusted during render (React's documented pattern) instead of
  // an Effect, since it's just deriving state from a prop/state change.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && selected) setView(selected);
  }

  useEffect(() => {
    if (!open) return;
    const update = () => btnRef.current && setRect(btnRef.current.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = toISO(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  // Smart placement: keep the panel fully within the viewport.
  const PANEL_H = 360; // approx panel height
  const PANEL_W = 288;
  const GAP = 6;
  const HEADER_SAFE = 64; // don't cover the sticky app header
  let panelTop = 0;
  let panelLeft = 0;
  if (rect) {
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top - HEADER_SAFE;
    if (spaceBelow >= PANEL_H + GAP || spaceBelow >= spaceAbove) {
      // place below, clamp so it doesn't run off the bottom
      panelTop = Math.min(rect.bottom + GAP, window.innerHeight - PANEL_H - 8);
    } else {
      // place above, but never above the header
      panelTop = Math.max(HEADER_SAFE + 8, rect.top - PANEL_H - GAP);
    }
    panelTop = Math.max(HEADER_SAFE + 8, Math.min(panelTop, window.innerHeight - PANEL_H - 8));
    panelLeft = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_W - 8));
  }

  const label = selected
    ? selected.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : placeholder;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={selected ? `Date: ${label}` : (placeholder || 'Select date')}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 bg-slate-800 border rounded-xl text-left outline-none transition ${compact ? 'px-2.5 h-9 text-xs' : 'px-3 h-11'} ${open ? 'border-lime-500 ring-2 ring-lime-500/20' : 'border-slate-700 hover:border-slate-600'} ${className}`}
      >
        <Calendar size={compact ? 14 : 16} className="text-slate-400 shrink-0" />
        <span className={`flex-1 truncate ${selected ? 'text-white font-semibold' : 'text-slate-500'}`}>{label}</span>
        {value && (
          <span role="button" aria-label="Clear date" onClick={(e) => { e.stopPropagation(); onChange(''); }} className="text-slate-500 hover:text-red-400 p-0.5"><X size={compact ? 13 : 15} /></span>
        )}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && rect && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                style={{
                  position: 'fixed',
                  left: panelLeft,
                  top: panelTop,
                  width: PANEL_W,
                  maxHeight: 'calc(100vh - 80px)',
                  overflowY: 'auto',
                  zIndex: 61,
                }}
                className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3"
              >
                {/* header */}
                <div className="flex items-center justify-between mb-3">
                  <button type="button" aria-label="Previous month" onClick={() => setView(new Date(year, month - 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300"><ChevronLeft size={18} /></button>
                  <div className="flex items-center gap-1.5 font-bold text-white text-sm">
                    <span>{MONTHS[month]}</span>
                    <span className="text-lime-400">{year}</span>
                  </div>
                  <button type="button" aria-label="Next month" onClick={() => setView(new Date(year, month + 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300"><ChevronRight size={18} /></button>
                </div>

                {/* dow */}
                <div className="grid grid-cols-7 mb-1">
                  {DOW.map((d, i) => <div key={i} className="text-center text-[11px] font-bold text-slate-500 py-1">{d}</div>)}
                </div>

                {/* days */}
                <div className="grid grid-cols-7 gap-0.5">
                  {cells.map((d, i) => {
                    if (!d) return <div key={i} />;
                    const iso = toISO(d);
                    const isSel = iso === value;
                    const isToday = iso === today;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { onChange(iso); setOpen(false); }}
                        className={`aspect-square rounded-lg text-sm font-semibold transition flex items-center justify-center
                          ${isSel ? 'bg-lime-500 text-slate-950' : isToday ? 'text-lime-400 ring-1 ring-lime-500/40' : 'text-slate-200 hover:bg-slate-800'}`}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-800">
                  <button type="button" onClick={() => { onChange(today); setOpen(false); }} className="flex-1 text-sm font-bold text-lime-400 py-1.5 rounded-lg hover:bg-slate-800">Today</button>
                  <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="flex-1 text-sm font-bold text-slate-400 py-1.5 rounded-lg hover:bg-slate-800">Clear</button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
