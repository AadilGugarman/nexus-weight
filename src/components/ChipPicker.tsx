import { useMemo, useRef, useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { findCatalogValueId, explicitLinkedChildren } from '../lib/catalogLinks';
import type { CatalogFieldNumber } from '../types';

interface Props {
  fieldNumber: CatalogFieldNumber;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  parentFieldNumber?: CatalogFieldNumber;
  parentValue?: string;
  parentLabel?: string;
}

const CHIP = 'px-3.5 py-2 rounded-lg text-sm font-bold transition active:scale-95 whitespace-nowrap';

/** One-tap chip picker for a catalog field's linked values, built for the
 * Active Tag Mode bar where an operator re-picks a value dozens of times a
 * shift. Chips are the fast path; tapping "+" drops into an inline
 * type-to-search-or-create box (no navigation, no separate dropdown) so a
 * value that doesn't exist yet ("HD200") can be typed and saved immediately —
 * existing linked values are always offered first as the query narrows them. */
export default function ChipPicker({ fieldNumber, value, onChange, placeholder, parentFieldNumber, parentValue, parentLabel }: Props) {
  const catalogValues = useStore((s) => s.catalogValues);
  const catalogValueLinks = useStore((s) => s.catalogValueLinks);
  const addCatalogValue = useStore((s) => s.addCatalogValue);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isChild = parentFieldNumber != null;
  const parentId = useMemo(
    () => (isChild ? findCatalogValueId(catalogValues, parentFieldNumber, parentValue || '') : undefined),
    [catalogValues, isChild, parentFieldNumber, parentValue],
  );

  const options = useMemo(() => {
    if (!isChild) return catalogValues.filter((v) => !v.is_deleted && v.field_number === fieldNumber).sort((a, b) => a.value.localeCompare(b.value));
    // Use explicitLinkedChildren to only show values that are actually linked (no fallback to all values)
    return explicitLinkedChildren(catalogValues, catalogValueLinks, parentId, fieldNumber);
  }, [catalogValues, catalogValueLinks, fieldNumber, isChild, parentId]);

  const needsParentFirst = isChild && !parentValue?.trim();

  const trimmed = query.trim();
  const filtered = useMemo(() => {
    if (!trimmed) return options;
    const q = trimmed.toLowerCase();
    return options.filter((o) => o.value.toLowerCase().includes(q));
  }, [options, trimmed]);
  const exactMatch = options.find((o) => o.value.toLowerCase() === trimmed.toLowerCase());

  const openAdd = () => {
    setAdding(true);
    setQuery('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const closeAdd = () => { setAdding(false); setQuery(''); };

  const pick = (v: string) => { onChange(v); closeAdd(); };

  const commit = async () => {
    if (!trimmed || busy) return;
    if (exactMatch) { pick(exactMatch.value); return; }
    setBusy(true);
    try {
      const rec = await addCatalogValue(fieldNumber, trimmed, isChild ? parentId : undefined);
      pick(rec.value);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void commit(); }
    else if (e.key === 'Escape') closeAdd();
  };

  if (needsParentFirst) {
    return <p className="text-xs italic px-1 py-2" style={{ color: 'var(--text-faint)' }}>Select {parentLabel || 'the parent value'} first</p>;
  }

  if (adding) {
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <input
            ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value.toUpperCase())} onKeyDown={onKeyDown}
            enterKeyHint="done" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            placeholder={placeholder ? `Type or search ${placeholder.toLowerCase()}…` : 'Type or search…'}
            className="flex-1 min-w-0 rounded-xl px-3 h-11 outline-none border uppercase"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--accent)', color: 'var(--text)' }}
          />
          <button type="button" aria-label="Save" onClick={() => void commit()} disabled={!trimmed || busy}
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-95 transition"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            <Check size={20} />
          </button>
          <button type="button" aria-label="Cancel" onClick={closeAdd}
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 active:scale-95 transition"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}>
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {trimmed && !exactMatch && (
            <button type="button" onClick={() => void commit()} disabled={busy}
              className={`${CHIP} flex items-center gap-1 disabled:opacity-50`}
              style={{ background: 'var(--accent-soft)', border: '1px dashed var(--accent)', color: 'var(--accent-deep)' }}>
              <Plus size={14} /> Add &ldquo;{trimmed}&rdquo;
            </button>
          )}
          {filtered.map((o) => (
            <button key={o.id} type="button" onClick={() => pick(o.value)}
              className={CHIP}
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {o.value}
            </button>
          ))}
          {trimmed && filtered.length === 0 && exactMatch === undefined && (
            <p className="text-xs italic px-1 py-1.5" style={{ color: 'var(--text-faint)' }}>No matches — save to create it</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${options.length > 12 ? 'max-h-28 overflow-y-auto pr-1' : ''}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.value)}
            className={`${CHIP} ${active ? '' : 'hover:brightness-110'}`}
            style={active
              ? { background: 'var(--accent)', color: 'var(--accent-fg)' }
              : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            {o.value}
          </button>
        );
      })}
      <button type="button" onClick={openAdd}
        className={`${CHIP} flex items-center gap-1`}
        style={{ background: 'var(--surface-2)', border: '1px dashed var(--border-2)', color: 'var(--text-faint)' }}>
        <Plus size={14} /> {options.length === 0 ? `Add ${placeholder || 'value'}` : 'Add'}
      </button>
    </div>
  );
}
