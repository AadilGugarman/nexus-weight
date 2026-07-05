import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Loader2, Package, ChevronRight, Filter, X, Lock, CheckCircle2, Circle, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useToast } from '../components/toastContext';
import { apiGet } from '../lib/api';
import { db } from '../lib/db';
import Dropdown from '../components/Dropdown';
import DatePicker from '../components/DatePicker';
import Pagination from '../components/Pagination';
import type { LoadHistory, HistoryPage, MovementType, LoadStatus } from '../types';

type MovementFilter = '' | MovementType;
type StatusFilter = '' | LoadStatus;

const CHIPS: { label: string; movementType: MovementFilter; status: StatusFilter }[] = [
  { label: 'All', movementType: '', status: '' },
  { label: 'Inward', movementType: 'inward', status: '' },
  { label: 'Outward', movementType: 'outward', status: '' },
  { label: 'Pending', movementType: '', status: 'draft' },
  { label: 'Completed', movementType: '', status: 'finalized' },
];

/** Offline fallback: filter + paginate the locally cached loads when the
 * server round trip fails (or we're already offline). Entry stats are
 * best-effort — db.entries only has data for loads the user has actually
 * opened before going offline, so uncached loads show 0 here rather than
 * failing outright. */
async function searchOffline(userId: string, filters: {
  partyId: string; from: string; to: string; q: string; movementType: MovementFilter; status: StatusFilter;
}, partyNamesById: Map<string, string>, page: number, pageSize: number): Promise<HistoryPage> {
  let rows = await db.loads.filter((l) => !l.is_deleted && l.user_id === userId).toArray();
  if (filters.partyId) rows = rows.filter((l) => l.party_id === filters.partyId);
  if (filters.from) rows = rows.filter((l) => (l.created_at || '') >= filters.from);
  if (filters.to) rows = rows.filter((l) => (l.created_at || '') <= filters.to);
  if (filters.movementType) rows = rows.filter((l) => (l.movement_type || 'inward') === filters.movementType);
  if (filters.status) rows = rows.filter((l) => (l.status || 'draft') === filters.status);
  if (filters.q) {
    const term = filters.q.toLowerCase();
    rows = rows.filter((l) => {
      const partyName = (l.party_id && partyNamesById.get(l.party_id)) || '';
      const movement = l.movement_type || 'inward';
      const st = l.status || 'draft';
      return (l.label || '').toLowerCase().includes(term) ||
        partyName.toLowerCase().includes(term) ||
        (term.length >= 2 && (movement.includes(term) || st.includes(term))) ||
        [l.custom_field_1, l.custom_field_2, l.custom_field_3].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }
  rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const total = rows.length;
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const loadIds = pageRows.map((l) => l.id);
  const entries = loadIds.length ? await db.entries.where('load_id').anyOf(loadIds).filter((e) => !e.is_deleted).toArray() : [];
  const stats: Record<string, { count: number; total: number }> = {};
  for (const e of entries) {
    const s = (stats[e.load_id] ??= { count: 0, total: 0 });
    s.count += 1;
    s.total += Number(e.weight);
  }
  const result: LoadHistory[] = pageRows.map((l) => ({ ...l, entry_count: stats[l.id]?.count || 0, total_weight: stats[l.id]?.total || 0 }));
  return { rows: result, total, page, pageSize };
}

export default function History() {
  const { parties, userId, deleteLoad, restoreLoad } = useStore();
  const { show } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [partyId, setPartyId] = useState(params.get('party') || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [movementType, setMovementType] = useState<MovementFilter>('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState<HistoryPage>({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [offline, setOffline] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const activeFilterCount = [partyId, from, to, movementType, status].filter(Boolean).length;

  const search = useCallback(async () => {
    setLoading(true); setErr('');
    const qs = new URLSearchParams();
    if (partyId) qs.set('party_id', partyId);
    if (from) qs.set('from', new Date(from).toISOString());
    if (to) { const d = new Date(to); d.setHours(23, 59, 59); qs.set('to', d.toISOString()); }
    if (q.trim()) qs.set('q', q.trim());
    if (movementType) qs.set('movement_type', movementType);
    if (status) qs.set('status', status);
    qs.set('page', String(page));
    qs.set('page_size', String(pageSize));
    try {
      const data = await apiGet<HistoryPage>(`history?${qs.toString()}`);
      setResult(data);
      setOffline(false);
    } catch (e) {
      if (userId) {
        try {
          const partyNamesById = new Map(parties.map((p) => [p.id, p.name]));
          const offlineResult = await searchOffline(userId, { partyId, from: from ? new Date(from).toISOString() : '', to: to ? (() => { const d = new Date(to); d.setHours(23, 59, 59); return d.toISOString(); })() : '', q: q.trim(), movementType, status }, partyNamesById, page, pageSize);
          setResult(offlineResult);
          setOffline(true);
        } catch (e2) {
          console.warn('History: offline fallback failed', e2);
          setErr((e as Error).message);
        }
      } else {
        setErr((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [partyId, from, to, q, movementType, status, page, pageSize, userId, parties]);

  useEffect(() => {
    const t = window.setTimeout(() => void search(), 0);
    return () => window.clearTimeout(t);
  }, [search]);
  useEffect(() => { if (partyId) setParams({ party: partyId }); else setParams({}); }, [partyId, setParams]);

  // Any filter change resets to page 1 — adjusted during render (React's
  // documented pattern for this) rather than via an Effect, so it lands in
  // the same render that changed the filter instead of an extra one.
  const filterKey = `${partyId}|${from}|${to}|${q}|${movementType}|${status}|${pageSize}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    if (page !== 1) setPage(1);
  }

  const clearFilters = () => { setPartyId(''); setFrom(''); setTo(''); setMovementType(''); setStatus(''); };

  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()); };
  const allPageSelected = result.rows.length > 0 && result.rows.every((r) => selected.has(r.id));
  const toggleSelectAll = () => setSelected(allPageSelected ? new Set() : new Set(result.rows.map((r) => r.id)));

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    const toRestore = result.rows.filter((r) => selected.has(r.id));
    exitSelectMode();
    for (const id of ids) await deleteLoad(id);
    await search();
    show(`${ids.length} record${ids.length > 1 ? 's' : ''} deleted`, {
      label: 'Undo',
      onClick: () => { void (async () => { await Promise.all(toRestore.map((r) => restoreLoad(r))); await search(); })(); },
    });
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
          <input placeholder="Search vehicle, party, movement, status…" value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-2.5 h-9 text-xs text-white outline-none focus:border-lime-500" />
        </div>
        {offline && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}>Offline</span>}
        <button onClick={() => setFiltersOpen((v) => !v)} aria-label="Filters" aria-expanded={filtersOpen}
          className="relative shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition"
          style={{ background: filtersOpen ? 'var(--accent)' : 'var(--surface)', border: '1px solid var(--border)', color: filtersOpen ? 'var(--accent-fg)' : 'var(--text)' }}>
          <Filter size={15} />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-0.5 -mx-0.5 px-0.5" style={{ scrollbarWidth: 'none' }}>
        {CHIPS.map((c) => {
          const active = movementType === c.movementType && status === c.status;
          return (
            <button key={c.label} onClick={() => { setMovementType(active ? '' : c.movementType); setStatus(active ? '' : c.status); }}
              className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full transition"
              style={active ? { background: 'var(--accent)', color: 'var(--accent-fg)' } : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}>
              {c.label}
            </button>
          );
        })}
      </div>

      {filtersOpen && (
        <div className="rounded-lg p-2 mb-2.5 space-y-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-0.5 pl-1">Party</p>
            <Dropdown value={partyId} onChange={setPartyId} placeholder="All parties" compact
              options={[{ value: '', label: 'All parties' }, ...parties.map((p) => ({ value: p.id, label: p.name, sub: p.place || undefined }))]} />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-0.5 pl-1">Movement Type</p>
              <Dropdown value={movementType} onChange={(v) => setMovementType(v as MovementFilter)} placeholder="All" compact
                options={[{ value: '', label: 'All' }, { value: 'inward', label: 'Inward' }, { value: 'outward', label: 'Outward' }]} />
            </div>
            <div>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-0.5 pl-1">Status</p>
              <Dropdown value={status} onChange={(v) => setStatus(v as StatusFilter)} placeholder="All" compact
                options={[{ value: '', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'finalized', label: 'Finalized' }]} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-0.5 pl-1">From</p>
              <DatePicker value={from} onChange={setFrom} placeholder="Any date" compact />
            </div>
            <div>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-0.5 pl-1">To</p>
              <DatePicker value={to} onChange={setTo} placeholder="Any date" compact />
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="w-full flex items-center justify-center gap-1.5 text-xs font-bold py-1.5 rounded-lg" style={{ color: 'var(--text-faint)' }}>
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      )}

      {!loading && !err && result.rows.length > 0 && (
        <div className="flex items-center justify-between mb-2 h-6">
          {selectMode ? (
            <>
              <button onClick={toggleSelectAll} className="text-xs font-bold" style={{ color: 'var(--accent)' }}>{allPageSelected ? 'Deselect All' : 'Select All'}</button>
              <span className="text-xs text-slate-500">{selected.size} selected</span>
              <button onClick={exitSelectMode} className="text-xs font-bold text-slate-400">Cancel</button>
            </>
          ) : (
            <button onClick={() => setSelectMode(true)} className="ml-auto text-xs font-bold text-slate-400">Select</button>
          )}
        </div>
      )}

      {loading ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-lime-400" size={28} /></div>
        : err ? <p className="text-red-400 text-center py-8">{err}</p>
        : result.rows.length === 0 ? <div className="text-center py-16 text-slate-600"><Package size={40} className="mx-auto mb-3" />No records found.</div>
        : (
        <>
          <div className="space-y-1.5 pb-2">
            {result.rows.map((r) => {
              const p = parties.find((x) => x.id === r.party_id);
              const isSelected = selected.has(r.id);
              return (
                <button key={r.id} onClick={() => { if (selectMode) toggleSelect(r.id); else navigate(`/loads/${r.id}`); }} className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {selectMode && (
                    isSelected ? <CheckCircle2 size={20} className="text-lime-400 shrink-0" /> : <Circle size={20} className="text-slate-600 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm truncate">{p ? p.name : 'No party'}{p?.place ? ` · ${p.place}` : ''}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{r.label}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs text-slate-500">{new Date(r.created_at || '').toLocaleDateString('en-IN')}</p>
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-lime-500/15 text-lime-400">
                        {r.entry_count} {r.entry_count === 1 ? 'entry' : 'entries'}
                      </span>
                      {r.status === 'finalized' ? (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}>
                          <Lock size={9} /> Finalized
                        </span>
                      ) : (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-slate-700 text-slate-400">
                          Draft
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-lime-400 font-black text-sm tabular-nums shrink-0">{Number(r.total_weight).toFixed(0)} kg</p>
                  {!selectMode && <ChevronRight size={15} className="text-slate-600 shrink-0" />}
                </button>
              );
            })}
          </div>
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </>
      )}

      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-16 inset-x-0 z-40 flex justify-center px-3">
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl w-full sm:max-w-md" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span className="text-sm font-bold flex-1">{selected.size} selected</span>
            <button onClick={() => void bulkDelete()} className="flex items-center gap-1.5 text-sm font-bold text-red-400 px-3 py-2 rounded-xl hover:bg-red-500/10">
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
