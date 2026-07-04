import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Trash2, Pencil, Phone, MapPin, History, X, ArrowDownLeft, ArrowUpRight, Search } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useToast } from '../components/toastContext';
import Pagination from '../components/Pagination';
import type { Party, PartyType } from '../types';

type Filter = 'all' | 'customer' | 'supplier';

export default function Parties() {
  const { parties, addParty, updateParty, deleteParty } = useStore();
  const { show } = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Party | null>(null);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [place, setPlace] = useState('');
  const [partyType, setPartyType] = useState<PartyType>('customer');
  const [phoneErr, setPhoneErr] = useState('');

  const openForm = (p?: Party) => {
    setEdit(p || null);
    setName(p?.name || ''); setPhone(p?.phone || ''); setPlace(p?.place || '');
    setPartyType((p?.party_type as PartyType) || 'customer');
    setPhoneErr(''); setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (phone && phone.length !== 10) { setPhoneErr('Phone number must be exactly 10 digits'); return; }
    if (edit) await updateParty({ ...edit, name: name.trim().toUpperCase(), phone, place: place.trim().toUpperCase(), party_type: partyType });
    else await addParty({ name: name.trim().toUpperCase(), phone, place: place.trim().toUpperCase(), party_type: partyType });
    setOpen(false);
  };

  const byType = useMemo(() => {
    if (filter === 'all') return parties;
    return parties.filter((p) => (p.party_type || 'customer') === filter);
  }, [parties, filter]);

  const filtered = useMemo(() => {
    let list = byType;
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(term) || (p.phone || '').includes(term) || (p.place || '').toLowerCase().includes(term));
    }
    return list;
  }, [byType, q]);

  const counts = useMemo(() => ({
    all: parties.length,
    customer: parties.filter((p) => (p.party_type || 'customer') === 'customer').length,
    supplier: parties.filter((p) => p.party_type === 'supplier').length,
  }), [parties]);

  // Any filter/search/tab change resets to page 1 — adjusted during render
  // (React's documented pattern for this) rather than via an Effect, so it
  // takes effect in the same render instead of triggering an extra one.
  const filterKey = `${filter}|${q}|${pageSize}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const tabs: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'customer', label: 'Customers' },
    { id: 'supplier', label: 'Suppliers' },
  ];

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
          <input placeholder="Search name, phone, place…" value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-2.5 h-9 text-xs text-white outline-none focus:border-lime-500" />
        </div>
        <button onClick={() => openForm()} className="shrink-0 flex items-center gap-1 h-9 px-2.5 rounded-lg bg-lime-500 text-slate-950 font-bold text-xs"><Plus size={15} /> Party</button>
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

      {filtered.length === 0 && <div className="text-center py-16 text-slate-600"><Users size={40} className="mx-auto mb-3" />No {filter === 'all' ? 'parties' : filter + 's'} found.</div>}
      {filtered.length > 0 && (
        <>
          <div className="space-y-2">
            {paged.map((p) => {
              const type = (p.party_type || 'customer') as PartyType;
              return (
                <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white truncate">{p.name}</p>
                      <TypeBadge type={type} />
                    </div>
                    <p className="text-xs text-slate-500 flex gap-3 mt-0.5">{p.phone && <span className="flex items-center gap-1"><Phone size={12} />{p.phone}</span>}{p.place && <span className="flex items-center gap-1"><MapPin size={12} />{p.place}</span>}</p>
                  </div>
                  <button aria-label={`View history for ${p.name}`} onClick={() => navigate(`/history?party=${p.id}`)} className="text-slate-400 hover:text-lime-400 p-2"><History size={16} /></button>
                  <button aria-label={`Edit ${p.name}`} onClick={() => openForm(p)} className="text-slate-400 hover:text-lime-400 p-2"><Pencil size={15} /></button>
                  <button aria-label={`Delete ${p.name}`} onClick={() => { deleteParty(p.id); show('Party deleted'); }} className="text-slate-500 hover:text-red-400 p-2"><Trash2 size={15} /></button>
                </div>
              );
            })}
          </div>
          <Pagination page={pageSafe} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </>
      )}

      {open && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold">{edit ? 'Edit' : 'New'} Party</h2><button aria-label="Close" onClick={() => setOpen(false)}><X size={22} className="text-slate-400" /></button></div>
            <form onSubmit={submit} className="space-y-3">
              {/* Party type toggle */}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPartyType('customer')}
                  className={`flex items-center justify-center gap-2 h-11 rounded-xl font-bold text-sm border-2 transition ${partyType === 'customer' ? 'bg-lime-500 text-slate-950 border-transparent' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                  <ArrowDownLeft size={16} /> Customer
                </button>
                <button type="button" onClick={() => setPartyType('supplier')}
                  className={`flex items-center justify-center gap-2 h-11 rounded-xl font-bold text-sm border-2 transition ${partyType === 'supplier' ? 'bg-lime-500 text-slate-950 border-transparent' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                  <ArrowUpRight size={16} /> Supplier
                </button>
              </div>

              <input autoFocus placeholder="PARTY NAME" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 h-11 text-white outline-none focus:border-lime-500 uppercase" />
              <div>
                <input
                  placeholder="Phone (10 digits, optional)"
                  value={phone}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setPhoneErr(''); }}
                  className={`w-full bg-slate-800 border rounded-xl px-3 h-11 text-white outline-none tabular-nums ${phoneErr ? 'border-red-500' : 'border-slate-700 focus:border-lime-500'}`}
                />
                {phoneErr && <p className="text-red-400 text-xs mt-1">{phoneErr}</p>}
                {phone && phone.length > 0 && phone.length < 10 && !phoneErr && <p className="text-slate-500 text-xs mt-1">{10 - phone.length} more digit{10 - phone.length > 1 ? 's' : ''}</p>}
              </div>
              <input placeholder="PLACE (OPTIONAL)" value={place} onChange={(e) => setPlace(e.target.value.toUpperCase())} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 h-11 text-white outline-none focus:border-lime-500 uppercase" />
              <button type="submit" disabled={!name.trim()} className="w-full bg-lime-500 text-slate-950 font-bold rounded-xl py-3 disabled:opacity-50">Save</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: PartyType }) {
  const isCust = type === 'customer';
  return (
    <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 ${isCust ? 'bg-sky-500/15 text-sky-400' : 'bg-amber-500/15 text-amber-400'}`}>
      {isCust ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
      {isCust ? 'Customer' : 'Supplier'}
    </span>
  );
}
