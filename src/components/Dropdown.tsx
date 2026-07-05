import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface DropdownOption {
  value: string;
  label: string;
  sub?: string;
  group?: string;
}

interface Props {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** allow searching/typing inside the single field (combobox) */
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
  /** when provided, shows "Add '<text>'" for unmatched input; returns the new option's value */
  onCreate?: (label: string) => Promise<string> | string;
  createLabel?: (text: string) => string;
  /** force typed text to display uppercase */
  uppercase?: boolean;
  /** shorter control (h-9, smaller icon/text) — for compact filter panels */
  compact?: boolean;
}

export default function Dropdown({
  value, options, onChange, placeholder = 'Select…', searchable, disabled, className = '', icon,
  onCreate, createLabel, uppercase, compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const selected = options.find((o) => o.value === value);

  // The text shown in the field: while typing use the query, otherwise the selection label.
  const displayValue = typing ? query : (selected?.label ?? '');

  // Clear the in-progress search text once the panel closes — adjusted
  // during render (React's documented pattern) instead of an Effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) { setTyping(false); setQuery(''); }
  }

  useEffect(() => {
    if (!open) return;
    const update = () => wrapRef.current && setRect(wrapRef.current.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open]);

  const filtered = useMemo(() => {
    const q = typing ? query.trim().toLowerCase() : '';
    if (!q) return options;
    return options.filter((o) => (o.label + ' ' + (o.sub || '') + ' ' + (o.group || '')).toLowerCase().includes(q));
  }, [options, query, typing]);

  // group options
  const groups: Record<string, DropdownOption[]> = {};
  const ungrouped: DropdownOption[] = [];
  filtered.forEach((o) => {
    if (o.group) { (groups[o.group] ||= []).push(o); }
    else ungrouped.push(o);
  });

  const trimmed = query.trim();
  const exactMatch = options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  const canCreate = !!onCreate && typing && trimmed.length > 0 && !exactMatch;

  // Smart placement: below the field, clamped to the viewport, never above the header.
  const PANEL_MAX = 300;
  const GAP = 6;
  const HEADER_SAFE = 64;
  let panelStyle: React.CSSProperties = {};
  if (rect) {
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - HEADER_SAFE - 8;
    const placeBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove;
    const maxH = Math.min(PANEL_MAX, placeBelow ? spaceBelow : spaceAbove);
    panelStyle = placeBelow
      ? { top: rect.bottom + GAP, maxHeight: Math.max(140, maxH) }
      : { bottom: window.innerHeight - rect.top + GAP, maxHeight: Math.max(140, maxH) };
    panelStyle.left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
    panelStyle.width = rect.width;
  }
  const openUpward = !!panelStyle.bottom;

  const pick = (v: string) => { onChange(v); setOpen(false); setTyping(false); setQuery(''); };

  const doCreate = async () => {
    if (!onCreate || !trimmed) return;
    const newVal = await onCreate(trimmed);
    pick(newVal);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length === 1) pick(filtered[0].value);
      else if (canCreate) void doCreate();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const openField = () => {
    if (disabled) return;
    setOpen(true);
    setTyping(true);
    setQuery('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <>
      <div
        ref={wrapRef}
        onClick={openField}
        className={`w-full flex items-center gap-2 bg-slate-800 border rounded-xl text-left outline-none transition cursor-text ${compact ? 'px-2.5 h-9 text-xs' : 'px-3 h-10'} ${open ? 'border-lime-500 ring-2 ring-lime-500/20' : 'border-slate-700'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-600'} ${className}`}
      >
        {icon}
        {searchable !== false ? (
          <input
            ref={inputRef}
            value={displayValue}
            disabled={disabled}
            role="combobox"
            aria-expanded={open}
            aria-label={placeholder}
            onChange={(e) => { setTyping(true); setQuery(uppercase ? e.target.value.toUpperCase() : e.target.value); if (!open) setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={selected ? selected.label : placeholder}
            className={`flex-1 min-w-0 bg-transparent outline-none placeholder-slate-500 ${uppercase ? 'uppercase' : ''} ${selected && !typing ? 'text-white font-semibold' : 'text-white'}`}
          />
        ) : (
          <span className={`flex-1 truncate ${selected ? 'text-white font-semibold' : 'text-slate-500'}`}>
            {selected ? selected.label : placeholder}
          </span>
        )}
        {selected?.sub && !typing && <span className={`text-slate-500 shrink-0 ${compact ? 'text-xs' : 'text-sm'}`}>{selected.sub}</span>}
        <ChevronDown size={compact ? 15 : 18} className={`text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </div>

      {createPortal(
        <AnimatePresence>
          {open && rect && (
            <>
              {/* Above BottomSheet (z-70/71) — CatalogField renders inside the
                  Add Child / node-action sheets, and the options panel must
                  layer over the sheet, not under its backdrop. */}
              <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: openUpward ? 8 : -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: openUpward ? 8 : -8, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                style={{ position: 'fixed', zIndex: 81, display: 'flex', flexDirection: 'column', ...panelStyle }}
                className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
              >
                <div className="flex-1 overflow-y-auto py-1.5 overscroll-contain min-h-0">
                  {ungrouped.map((o) => (
                    <Item key={o.value} o={o} active={o.value === value} onPick={() => pick(o.value)} />
                  ))}
                  {Object.entries(groups).map(([g, items]) => (
                    <div key={g}>
                      <p className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-wider text-lime-500">{g}</p>
                      {items.map((o) => (
                        <Item key={o.value} o={o} active={o.value === value} onPick={() => pick(o.value)} />
                      ))}
                    </div>
                  ))}

                  {filtered.length === 0 && !canCreate && (
                    <p className="px-3 py-4 text-center text-sm text-slate-500">No results</p>
                  )}

                  {canCreate && (
                    <button
                      type="button"
                      onClick={doCreate}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-800 border-t border-slate-800 mt-1"
                    >
                      <span className="w-7 h-7 rounded-lg bg-lime-500/15 flex items-center justify-center shrink-0">
                        <Plus size={16} className="text-lime-400" />
                      </span>
                      <span className="text-sm text-slate-200">
                        {createLabel ? createLabel(trimmed) : <>Add “<span className="font-bold text-lime-400">{trimmed}</span>”</>}
                      </span>
                    </button>
                  )}
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

function Item({ o, active, onPick }: { o: DropdownOption; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition ${active ? 'bg-lime-500/10' : 'hover:bg-slate-800'}`}
    >
      <div className="flex-1 min-w-0">
        <p className={`truncate ${active ? 'text-lime-400 font-bold' : 'text-white font-medium'}`}>{o.label}</p>
        {o.sub && <p className="text-xs text-slate-500 truncate">{o.sub}</p>}
      </div>
      {active && <Check size={17} className="text-lime-400 shrink-0" />}
    </button>
  );
}
