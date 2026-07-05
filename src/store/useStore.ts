import { create } from 'zustand';
import { db } from '../lib/db';
import { enqueue, pendingCount, deadCount } from '../lib/sync';
import { apiGet, AuthError } from '../lib/api';
import { uuid } from '../lib/uuid';
import type { Party, CatalogValue, CatalogValueLink, CatalogFieldNumber, Load, Entry, Profile } from '../types';

interface AppState {
  online: boolean;
  pending: number;
  dead: number;
  userId: string | null;
  parties: Party[];
  catalogValues: CatalogValue[];
  catalogValueLinks: CatalogValueLink[];
  loads: Load[];
  entries: Entry[];
  companyName: string | null;
  customLabel1: string | null;
  customLabel2: string | null;
  customLabel3: string | null;
  activeLoadId: string | null;
  recentWeights: number[];
  recentVehicles: string[];
  setOnline: (v: boolean) => void;
  refreshPending: () => Promise<void>;
  setUser: (id: string | null) => void;
  loadAll: () => Promise<void>;
  setActiveLoad: (id: string | null) => void;
  loadEntries: (loadId: string) => Promise<void>;
  syncEntryLabelsToCatalog: (entries: Entry[]) => Promise<void>;
  pushRecent: (w: number) => void;
  pushRecentVehicle: (vehicle: string) => void;
  // company profile & business labels — saved together via an explicit Save action
  updateBusinessConfig: (cfg: { companyName: string; customLabel1: string; customLabel2: string; customLabel3: string }) => Promise<void>;
  // party
  addParty: (p: Partial<Party>) => Promise<Party>;
  updateParty: (p: Party) => Promise<void>;
  deleteParty: (id: string) => Promise<void>;
  // catalog values (dynamic, generic replacement for the old fixed fruits/vakkals/carets)
  addCatalogValue: (fieldNumber: CatalogFieldNumber, value: string, linkToParentId?: string) => Promise<CatalogValue>;
  updateCatalogValue: (v: CatalogValue) => Promise<void>;
  // Cascade delete: removes this value and every value reachable through its
  // active outgoing links (its whole subtree in the Catalogs tree), plus any
  // link rows touching them.
  deleteCatalogValue: (id: string) => Promise<void>;
  // Catalog tree — sets (or clears) the single active parent for `childId`,
  // removing any previous parent link first (the app enforces one parent
  // per value, stricter than the underlying many-to-many schema).
  setValueParent: (childId: string, parentId: string | null) => Promise<void>;
  // load
  addLoad: (l: Partial<Load>) => Promise<Load>;
  updateLoad: (l: Partial<Load> & { id: string }) => Promise<void>;
  deleteLoad: (id: string) => Promise<void>;
  restoreLoad: (load: Load) => Promise<void>;
  // entry
  addEntry: (loadId: string, weight: number, partyId?: string | null, labels?: { custom_field_1?: string | null; custom_field_2?: string | null; custom_field_3?: string | null }) => Promise<Entry>;
  updateEntry: (id: string, weight: number) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  restoreEntry: (entry: Entry) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pending: 0,
  dead: 0,
  userId: null,
  parties: [],
  catalogValues: [],
  catalogValueLinks: [],
  loads: [],
  entries: [],
  companyName: null,
  customLabel1: null,
  customLabel2: null,
  customLabel3: null,
  activeLoadId: null,
  recentWeights: (JSON.parse(localStorage.getItem('recentWeights') || '[]') as number[]).slice(0, 10),
  recentVehicles: (JSON.parse(localStorage.getItem('recentVehicles') || '[]') as string[]).slice(0, 10),

  setOnline: (v) => set({ online: v }),
  refreshPending: async () => set({ pending: await pendingCount(), dead: await deadCount() }),
  setUser: (id) => set({ userId: id }),
  setActiveLoad: (id) => set({ activeLoadId: id }),

  pushRecent: (w) => {
    const cur = get().recentWeights.filter((x) => x !== w);
    const next = [w, ...cur].slice(0, 10);
    localStorage.setItem('recentWeights', JSON.stringify(next));
    set({ recentWeights: next });
  },

  pushRecentVehicle: (vehicle) => {
    const normalized = vehicle.trim().toUpperCase();
    if (!normalized || normalized === 'NO-VEHICLE') return;
    const cur = get().recentVehicles.filter((x) => x !== normalized);
    const next = [normalized, ...cur].slice(0, 10);
    localStorage.setItem('recentVehicles', JSON.stringify(next));
    set({ recentVehicles: next });
  },

  // Explicit save (triggered by the Business Configuration "Save" button) —
  // commits all 3 fields together in one Dexie write + one sync-queue task.
  updateBusinessConfig: async (cfg) => {
    const companyName = cfg.companyName || null;
    const customLabel1 = cfg.customLabel1 || null;
    const customLabel2 = cfg.customLabel2 || null;
    const customLabel3 = cfg.customLabel3 || null;
    set({ companyName, customLabel1, customLabel2, customLabel3 });
    const userId = get().userId;
    if (!userId) return;
    await db.profile.put({ id: userId, company_name: companyName, custom_label_1: customLabel1, custom_label_2: customLabel2, custom_label_3: customLabel3 });
    await enqueue('profiles', 'update', { company_name: companyName, custom_label_1: customLabel1, custom_label_2: customLabel2, custom_label_3: customLabel3 });
    await get().refreshPending();
  },

  loadAll: async () => {
    const [cp, ccv, cvl, cl] = await Promise.all([
      db.parties.filter((x) => !x.is_deleted).toArray(),
      db.catalogValues.filter((x) => !x.is_deleted).toArray(),
      db.catalogValueLinks.filter((x) => !x.is_deleted).toArray(),
      db.loads.filter((x) => !x.is_deleted).toArray(),
    ]);
    set({ parties: cp, catalogValues: ccv, catalogValueLinks: cvl, loads: cl });
    const userId = get().userId;
    if (userId) {
      const cachedProfile = await db.profile.get(userId);
      if (cachedProfile) {
        set({
          companyName: cachedProfile.company_name ?? null,
          customLabel1: cachedProfile.custom_label_1 ?? null,
          customLabel2: cachedProfile.custom_label_2 ?? null,
          customLabel3: cachedProfile.custom_label_3 ?? null,
        });
      }
    }
    if (!navigator.onLine) return;
    try {
      const [parties, catalogValues, catalogValueLinks, loads, profile] = await Promise.all([
        apiGet<Party[]>('parties'),
        apiGet<CatalogValue[]>('catalog_values'),
        apiGet<CatalogValueLink[]>('catalog_value_links'),
        apiGet<Load[]>('loads'),
        apiGet<Profile>('profiles'),
      ]);
      await db.parties.bulkPut(parties);
      await db.catalogValues.bulkPut(catalogValues);
      await db.catalogValueLinks.bulkPut(catalogValueLinks);
      await db.loads.bulkPut(loads);
      await db.profile.put(profile);
      set({
        parties, catalogValues, catalogValueLinks, loads,
        companyName: profile.company_name ?? null,
        customLabel1: profile.custom_label_1 ?? null,
        customLabel2: profile.custom_label_2 ?? null,
        customLabel3: profile.custom_label_3 ?? null,
      });
    } catch (e) {
      if (!(e instanceof AuthError)) console.warn('loadAll: using cached data', e);
    }
  },

  loadEntries: async (loadId) => {
    const cached = await db.entries.where('load_id').equals(loadId).filter((x) => !x.is_deleted).toArray();
    cached.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    set({ entries: cached });
    
    // Auto-add labels from entries to catalog
    await get().syncEntryLabelsToCatalog(cached);
    
    if (!navigator.onLine) return;
    try {
      const remote = await apiGet<Entry[]>(`entries?load_id=${loadId}`);
      await db.entries.bulkPut(remote);
      set({ entries: remote });
      
      // Auto-add labels from remote entries to catalog
      await get().syncEntryLabelsToCatalog(remote);
    } catch (e) {
      if (!(e instanceof AuthError)) console.warn('loadEntries: using cached data', e);
    }
  },

  syncEntryLabelsToCatalog: async (entries) => {
    const catalogValues = get().catalogValues;
    const userId = get().userId;
    if (!userId) return;

    // Helper to check if a value already exists in catalog
    const valueExists = (fieldNumber: CatalogFieldNumber, value: string) => {
      const needle = value.trim().toLowerCase();
      return catalogValues.some(
        (v) => !v.is_deleted && 
        v.field_number === fieldNumber && 
        v.value.trim().toLowerCase() === needle
      );
    };

    // Helper to add value to catalog without parent link (untracked)
    const addUntracked = async (fieldNumber: CatalogFieldNumber, value: string) => {
      if (!value?.trim() || valueExists(fieldNumber, value)) return;
      
      const rec: CatalogValue = {
        id: uuid(),
        user_id: userId,
        field_number: fieldNumber,
        value: value.trim(),
        is_deleted: false,
        created_at: new Date().toISOString(),
      };
      
      await db.catalogValues.put(rec);
      set({ catalogValues: [...get().catalogValues, rec].sort((a, b) => a.value.localeCompare(b.value)) });
      await enqueue('catalog_values', 'create', { 
        id: rec.id, 
        field_number: rec.field_number, 
        value: rec.value 
      });
    };

    // Process all entries
    for (const entry of entries) {
      // Label 1 (custom_field_1): Add to catalog (tracked, can have children)
      if (entry.custom_field_1?.trim()) {
        const label1Value = entry.custom_field_1.trim();
        if (!valueExists(1, label1Value)) {
          await addUntracked(1, label1Value);
        }
      }

      // Label 2 (custom_field_2): Add as untracked
      if (entry.custom_field_2?.trim()) {
        const label2Value = entry.custom_field_2.trim();
        await addUntracked(2, label2Value);
      }

      // Label 3 (custom_field_3): Add as untracked
      if (entry.custom_field_3?.trim()) {
        const label3Value = entry.custom_field_3.trim();
        await addUntracked(3, label3Value);
      }
    }

    await get().refreshPending();
  },

  addParty: async (p) => {
    const rec: Party = { id: uuid(), user_id: get().userId!, name: p.name!, phone: p.phone, place: p.place, party_type: p.party_type ?? 'customer', is_deleted: false, created_at: new Date().toISOString() };
    await db.parties.put(rec);
    set({ parties: [...get().parties, rec].sort((a, b) => a.name.localeCompare(b.name)) });
    await enqueue('parties', 'create', { id: rec.id, name: rec.name, phone: rec.phone, place: rec.place, party_type: rec.party_type });
    await get().refreshPending();
    return rec;
  },
  updateParty: async (p) => {
    await db.parties.put(p);
    set({ parties: get().parties.map((x) => (x.id === p.id ? p : x)) });
    await enqueue('parties', 'update', { id: p.id, name: p.name, phone: p.phone, place: p.place, party_type: p.party_type });
    await get().refreshPending();
  },
  deleteParty: async (id) => {
    await db.parties.update(id, { is_deleted: true });
    set({ parties: get().parties.filter((x) => x.id !== id) });
    await enqueue('parties', 'delete', { id });
    await get().refreshPending();
  },

  addCatalogValue: async (fieldNumber, value, linkToParentId) => {
    const rec: CatalogValue = { id: uuid(), user_id: get().userId!, field_number: fieldNumber, value, is_deleted: false, created_at: new Date().toISOString() };
    await db.catalogValues.put(rec);
    set({ catalogValues: [...get().catalogValues, rec].sort((a, b) => a.value.localeCompare(b.value)) });
    await enqueue('catalog_values', 'create', { id: rec.id, field_number: rec.field_number, value: rec.value });
    await get().refreshPending();
    // Creating a value while a parent is already selected (e.g. typing a new
    // Variety while Category=Mango is active) auto-links it to that parent —
    // otherwise it would be invisible next time since it'd have zero links.
    if (linkToParentId) await get().setValueParent(rec.id, linkToParentId);
    return rec;
  },
  updateCatalogValue: async (v) => {
    await db.catalogValues.put(v);
    set({ catalogValues: get().catalogValues.map((x) => (x.id === v.id ? v : x)) });
    await enqueue('catalog_values', 'update', { id: v.id, value: v.value });
    await get().refreshPending();
  },
  deleteCatalogValue: async (id) => {
    const values = get().catalogValues;
    const links = get().catalogValueLinks;

    // Collect id + every value reachable via active outgoing links (its
    // whole subtree in the Catalogs tree).
    const toDelete = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const vid = stack.pop()!;
      if (toDelete.has(vid)) continue;
      toDelete.add(vid);
      for (const l of links) if (!l.is_deleted && l.value_id === vid) stack.push(l.linked_value_id);
    }

    for (const vid of toDelete) await db.catalogValues.update(vid, { is_deleted: true });
    const touchedLinks = links.filter((l) => !l.is_deleted && (toDelete.has(l.value_id) || toDelete.has(l.linked_value_id)));
    for (const l of touchedLinks) await db.catalogValueLinks.update(l.id, { is_deleted: true });

    const touchedLinkIds = new Set(touchedLinks.map((l) => l.id));
    set({
      catalogValues: values.filter((x) => !toDelete.has(x.id)),
      catalogValueLinks: links.filter((l) => !touchedLinkIds.has(l.id)),
    });

    for (const vid of toDelete) await enqueue('catalog_values', 'delete', { id: vid });
    for (const l of touchedLinks) await enqueue('catalog_value_links', 'delete', { id: l.id });
    await get().refreshPending();
  },

  setValueParent: async (childId, parentId) => {
    const links = get().catalogValueLinks;
    const current = links.filter((l) => !l.is_deleted && l.linked_value_id === childId);
    if (current.length === 1 && current[0].value_id === parentId) return; // already the desired parent

    const userId = get().userId!;
    const now = new Date().toISOString();
    for (const rec of current) await db.catalogValueLinks.update(rec.id, { is_deleted: true });

    let added: CatalogValueLink | null = null;
    if (parentId) {
      added = { id: uuid(), user_id: userId, value_id: parentId, linked_value_id: childId, is_deleted: false, created_at: now };
      await db.catalogValueLinks.put(added);
    }

    const currentIds = new Set(current.map((r) => r.id));
    set({ catalogValueLinks: [...links.filter((l) => !currentIds.has(l.id)), ...(added ? [added] : [])] });

    for (const rec of current) await enqueue('catalog_value_links', 'delete', { id: rec.id });
    if (added) await enqueue('catalog_value_links', 'create', { id: added.id, value_id: added.value_id, linked_value_id: added.linked_value_id });
    await get().refreshPending();
  },

  addLoad: async (l) => {
    const rec: Load = { id: uuid(), user_id: get().userId!, party_id: l.party_id, label: l.label!, movement_type: l.movement_type ?? 'inward', custom_field_1: l.custom_field_1 ?? null, custom_field_2: l.custom_field_2 ?? null, custom_field_3: l.custom_field_3 ?? null, container_count: l.container_count ?? null, weight_per_container: l.weight_per_container ?? null, status: 'draft', is_deleted: false, created_at: l.created_at || new Date().toISOString() };
    await db.loads.put(rec);
    set({ loads: [rec, ...get().loads] });
    await enqueue('loads', 'create', { id: rec.id, party_id: rec.party_id, label: rec.label, created_at: rec.created_at, movement_type: rec.movement_type, custom_field_1: rec.custom_field_1, custom_field_2: rec.custom_field_2, custom_field_3: rec.custom_field_3, container_count: rec.container_count, weight_per_container: rec.weight_per_container, status: rec.status });
    await get().refreshPending();
    // Track vehicle number for suggestions
    if (rec.label) get().pushRecentVehicle(rec.label);
    return rec;
  },
  updateLoad: async (l) => {
    const existing = get().loads.find((x) => x.id === l.id);
    const merged = { ...existing, ...l } as Load;
    await db.loads.put(merged);
    set({ loads: get().loads.map((x) => (x.id === l.id ? merged : x)) });
    await enqueue('loads', 'update', { ...l });
    await get().refreshPending();
  },
  deleteLoad: async (id) => {
    await db.loads.update(id, { is_deleted: true });
    set({ loads: get().loads.filter((x) => x.id !== id) });
    await enqueue('loads', 'delete', { id });
    await get().refreshPending();
  },
  restoreLoad: async (load) => {
    const rec = { ...load, is_deleted: false };
    await db.loads.put(rec);
    set({ loads: [rec, ...get().loads].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')) });
    await enqueue('loads', 'create', { id: rec.id, party_id: rec.party_id, label: rec.label, created_at: rec.created_at, movement_type: rec.movement_type, custom_field_1: rec.custom_field_1, custom_field_2: rec.custom_field_2, custom_field_3: rec.custom_field_3, container_count: rec.container_count, weight_per_container: rec.weight_per_container, status: rec.status });
    await get().refreshPending();
  },

  addEntry: async (loadId, weight, partyId, labels) => {
    const seq = get().entries.length + 1;
    const rec: Entry = {
      id: uuid(), user_id: get().userId!, load_id: loadId, party_id: partyId, seq, weight,
      custom_field_1: labels?.custom_field_1 ?? null, custom_field_2: labels?.custom_field_2 ?? null, custom_field_3: labels?.custom_field_3 ?? null,
      is_deleted: false, created_at: new Date().toISOString(),
    };
    await db.entries.put(rec);
    set({ entries: [rec, ...get().entries] });
    get().pushRecent(weight);
    await enqueue('entries', 'create', { id: rec.id, load_id: loadId, party_id: partyId, seq, weight, custom_field_1: rec.custom_field_1, custom_field_2: rec.custom_field_2, custom_field_3: rec.custom_field_3 });
    await get().refreshPending();
    return rec;
  },
  updateEntry: async (id, weight) => {
    await db.entries.update(id, { weight });
    set({ entries: get().entries.map((x) => (x.id === id ? { ...x, weight } : x)) });
    await enqueue('entries', 'update', { id, weight });
    await get().refreshPending();
  },
  deleteEntry: async (id) => {
    await db.entries.update(id, { is_deleted: true });
    set({ entries: get().entries.filter((x) => x.id !== id) });
    await enqueue('entries', 'delete', { id });
    await get().refreshPending();
  },
  restoreEntry: async (entry) => {
    const rec = { ...entry, is_deleted: false };
    await db.entries.put(rec);
    set({ entries: [rec, ...get().entries].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')) });
    await enqueue('entries', 'create', { id: rec.id, load_id: rec.load_id, party_id: rec.party_id, seq: rec.seq, weight: rec.weight, custom_field_1: rec.custom_field_1, custom_field_2: rec.custom_field_2, custom_field_3: rec.custom_field_3 });
    await get().refreshPending();
  },
}));
