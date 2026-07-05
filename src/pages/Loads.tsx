import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Plus, Trash2, ChevronRight, Lock, Search, Filter as FilterIcon, X, CheckCircle2, Circle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useToast } from '../components/toastContext';
import LoadPicker from '../components/LoadPicker';
import DatePicker from '../components/DatePicker';
import Pagination from '../components/Pagination';
import { db } from '../lib/db';
import type { Load, MovementType } from '../types';

type Filter = 'all' | 'inward' | 'outward';

export default function Loads() {
  const { loads, parties, deleteLoad, restoreLoad, setActiveLoad } = useStore();
  const { show } = useToast();
  const navigate = useNavigate();
  const [picker, setPicker] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [entryCounts, setEntryCounts] = useState<Map<string, number>>(new Map());

  // Load entry counts for all loads
  useEffect(() => {
    const loadEntryCounts = async () => {
      const counts = new Map<string, number>();
      for (const load of loads) {
        const count = await db.entries
          .where('load_id')
          .equals(load.id)
          .filter((e) => !e.is_deleted)
          .count();
        counts.set(load.id, count);
      }
      setEntryCounts(counts);
    };
    void loadEntryCounts();
  }, [loads]);

  const activeFilterCount = [dateFrom, dateTo].filter(Boolean).length;
  const clearFilters = () => { setDateFrom(''); setDateTo(''); };

  const filtered = useMemo(() => {
    let list = filter === 'all' ? loads : loads.filter((l) => (l.movement_type || 'inward') === filter);
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      list = list.filter((l) => {
        const p = parties.find((x) => x.id === l.party_id);
        return (l.label || '').toLowerCase().includes(term)
          || (p?.name || '').toLowerCase().includes(term)
          || [l.custom_field_1, l.custom_field_2, l.custom_field_3].filter(Boolean).some((v) => (v || '').toLowerCase().includes(term));
      });
    }
    if (dateFrom) list = list.filter((l) => (l.created_at || '') >= dateFrom);
    if (dateTo) list = list.filter((l) => (l.created_at || '') <= dateTo + 'T23:59:59');
    return list;
  }, [loads, parties, filter, q, dateFrom, dateTo]);

  // Any filter/search/tab change resets to page 1 — adjusted during render
  // (React's documented pattern for this) rather than via an Effect, so it
  // takes effect in the same render instead of triggering an extra one.
  const filterKey = `${filter}|${q}|${dateFrom}|${dateTo}|${pageSize}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const counts = useMemo(() => ({
    all: loads.length,
    inward: loads.filter((l) => (l.movement_type || 'inward') === 'inward').length,
    outward: loads.filter((l) => l.movement_type === 'outward').length,
  }), [loads]);

  const tabs: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'inward', label: 'Inward' },
    { id: 'outward', label: 'Outward' },
  ];

  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()); };
  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleSelectAll = () => setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((l) => l.id)));

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    const toRestore = loads.filter((l) => selected.has(l.id));
    exitSelectMode();
    for (const id of ids) await deleteLoad(id);
    show(`${ids.length} load${ids.length > 1 ? 's' : ''} deleted`, {
      label: 'Undo',
      onClick: () => { toRestore.forEach((l) => void restoreLoad(l)); },
    });
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
          <input placeholder="Search vehicle, party…" value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-2.5 h-9 text-xs text-white outline-none focus:border-lime-500" />
        </div>
        <button onClick={() => setFiltersOpen((v) => !v)} aria-label="Date filter" aria-expanded={filtersOpen}
          className="relative shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition"
          style={filtersOpen
            ? { background: 'var(--accent)', color: 'var(--accent-fg)' }
            : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <FilterIcon size={15} />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>{activeFilterCount}</span>
          )}
        </button>
        <button onClick={() => setPicker(true)} className="shrink-0 flex items-center gap-1 h-9 px-2.5 rounded-lg bg-lime-500 text-slate-950 font-bold text-xs"><Plus size={15} /> Load</button>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 mb-2 bg-slate-900 border border-slate-800 rounded-xl p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-bold text-xs transition ${filter === t.id ? 'bg-lime-500 text-slate-950' : 'text-slate-400'}`}>
            {t.label}
            <span className={`text-[10px] rounded-full px-1.5 py-0 leading-[15px] ${filter === t.id ? 'bg-black/15' : 'bg-slate-800'}`}>{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {filtersOpen && (
        <div className="rounded-lg p-2 mb-2.5 space-y-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-0.5 pl-1">From</p>
              <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="Any date" compact />
            </div>
            <div>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-0.5 pl-1">To</p>
              <DatePicker value={dateTo} onChange={setDateTo} placeholder="Any date" compact />
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="w-full flex items-center justify-center gap-1.5 text-xs font-bold py-1.5 rounded-lg" style={{ color: 'var(--text-faint)' }}>
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center justify-between mb-2 h-6">
          {selectMode ? (
            <>
              <button onClick={toggleSelectAll} className="text-xs font-bold" style={{ color: 'var(--accent)' }}>{allFilteredSelected ? 'Deselect All' : 'Select All'}</button>
              <span className="text-xs text-slate-500">{selected.size} selected</span>
              <button onClick={exitSelectMode} className="text-xs font-bold text-slate-400">Cancel</button>
            </>
          ) : (
            <button onClick={() => setSelectMode(true)} className="ml-auto text-xs font-bold text-slate-400">Select</button>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-slate-600">
          <Package size={40} className="mx-auto mb-3" />
          {loads.length === 0 ? 'No loads yet.' : 'No loads match your filters.'}
        </div>
      )}
      <div className="space-y-2 pb-2">
        {paged.map((l) => {
          const p = parties.find((x) => x.id === l.party_id);
          const isSelected = selected.has(l.id);
          const entryCount = entryCounts.get(l.id) || 0;
          return (
            <div key={l.id} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3">
              {selectMode && (
                <button aria-label={isSelected ? 'Deselect' : 'Select'} onClick={() => toggleSelect(l.id)} className="shrink-0">
                  {isSelected ? <CheckCircle2 size={22} className="text-lime-400" /> : <Circle size={22} className="text-slate-600" />}
                </button>
              )}
              <button onClick={() => { if (selectMode) toggleSelect(l.id); else navigate(`/loads/${l.id}`); }} className="flex-1 text-left min-w-0">
                <p className="font-bold text-white truncate">{p ? p.name : 'No party'}{p?.place ? ` · ${p.place}` : ''}</p>
                <p className="text-xs text-slate-500 mt-0.5">{l.label || 'No vehicle'}</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <p className="text-xs text-slate-500">
                    {new Date(l.created_at || '').toLocaleDateString('en-IN')}
                  </p>
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-lime-500/15 text-lime-400">
                    {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                  </span>
                  {l.status === 'finalized' ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}>
                      <Lock size={10} /> Finalized
                    </span>
                  ) : (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-slate-700 text-slate-400">
                      Draft
                    </span>
                  )}
                </div>
              </button>
              {!selectMode && (
                <>
                  <button aria-label={`Open ${l.label}`} onClick={() => navigate(`/loads/${l.id}`)} className="text-slate-400 p-2"><ChevronRight size={18} /></button>
                  <button aria-label={`Delete ${l.label}`} onClick={() => { deleteLoad(l.id); show('Load deleted'); }} className="text-slate-500 hover:text-red-400 p-2"><Trash2 size={16} /></button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length > 0 && <Pagination page={pageSafe} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />}
      {picker && <LoadPicker onClose={() => setPicker(false)} onPick={(l: Load) => { setActiveLoad(l.id); setPicker(false); navigate('/'); }} />}

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
