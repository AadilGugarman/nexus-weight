import supabase from './supabase';
import { db } from './db';
import { useStore } from '../store/useStore';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Entry, Load, Party, Profile, CatalogValue } from '../types';

let channel: RealtimeChannel | null = null;
let realtimeStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';

export function getRealtimeStatus() {
  return realtimeStatus;
}

export function startRealtime(userId: string) {
  if (channel) return;
  realtimeStatus = 'connecting';
  channel = supabase
    .channel('nexus-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: `user_id=eq.${userId}` }, async (payload) => {
      const newRow = payload.new as Partial<Entry> | undefined;
      const oldRow = payload.old as Partial<Entry> | undefined;
      const row = (newRow && Object.keys(newRow).length ? newRow : oldRow) as Entry | undefined;
      if (!row) return;
      const state = useStore.getState();
      if (payload.eventType === 'DELETE' || newRow?.is_deleted) {
        await db.entries.update(row.id, { is_deleted: true });
        if (state.activeLoadId === row.load_id) {
          useStore.setState({ entries: state.entries.filter((e) => e.id !== row.id) });
        }
      } else if (newRow) {
        const entry = newRow as Entry;
        await db.entries.put(entry);
        if (state.activeLoadId === entry.load_id) {
          const exists = state.entries.some((e) => e.id === entry.id);
          const list = exists ? state.entries.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...state.entries];
          list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
          useStore.setState({ entries: list });
        }
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'loads', filter: `user_id=eq.${userId}` }, async (payload) => {
      const state = useStore.getState();
      const newRow = payload.new as Partial<Load> | undefined;
      const oldRow = payload.old as Partial<Load> | undefined;
      const row = (newRow && Object.keys(newRow).length ? newRow : oldRow) as Load | undefined;
      if (!row) return;
      if (payload.eventType === 'DELETE' || newRow?.is_deleted) {
        await db.loads.update(row.id, { is_deleted: true });
        useStore.setState({ loads: state.loads.filter((l) => l.id !== row.id) });
      } else if (newRow) {
        const load = newRow as Load;
        await db.loads.put(load);
        const exists = state.loads.some((l) => l.id === load.id);
        useStore.setState({ loads: exists ? state.loads.map((l) => (l.id === load.id ? load : l)) : [load, ...state.loads] });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parties', filter: `user_id=eq.${userId}` }, async (payload) => {
      const state = useStore.getState();
      const newRow = payload.new as Partial<Party> | undefined;
      const oldRow = payload.old as Partial<Party> | undefined;
      const row = (newRow && Object.keys(newRow).length ? newRow : oldRow) as Party | undefined;
      if (!row) return;
      if (payload.eventType === 'DELETE' || newRow?.is_deleted) {
        await db.parties.update(row.id, { is_deleted: true });
        useStore.setState({ parties: state.parties.filter((p) => p.id !== row.id) });
      } else if (newRow) {
        const party = newRow as Party;
        await db.parties.put(party);
        const exists = state.parties.some((p) => p.id === party.id);
        const list = exists ? state.parties.map((p) => (p.id === party.id ? party : p)) : [...state.parties, party];
        list.sort((a, b) => a.name.localeCompare(b.name));
        useStore.setState({ parties: list });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_values', filter: `user_id=eq.${userId}` }, async (payload) => {
      const state = useStore.getState();
      const newRow = payload.new as Partial<CatalogValue> | undefined;
      const oldRow = payload.old as Partial<CatalogValue> | undefined;
      const row = (newRow && Object.keys(newRow).length ? newRow : oldRow) as CatalogValue | undefined;
      if (!row) return;
      if (payload.eventType === 'DELETE' || newRow?.is_deleted) {
        await db.catalogValues.update(row.id, { is_deleted: true });
        useStore.setState({ catalogValues: state.catalogValues.filter((v) => v.id !== row.id) });
      } else if (newRow) {
        const value = newRow as CatalogValue;
        await db.catalogValues.put(value);
        const exists = state.catalogValues.some((v) => v.id === value.id);
        const list = exists ? state.catalogValues.map((v) => (v.id === value.id ? value : v)) : [...state.catalogValues, value];
        list.sort((a, b) => a.value.localeCompare(b.value));
        useStore.setState({ catalogValues: list });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, async (payload) => {
      const newRow = payload.new as Partial<Profile> | undefined;
      if (!newRow) return;
      const companyName = newRow.company_name ?? null;
      const customLabel1 = newRow.custom_label_1 ?? null;
      const customLabel2 = newRow.custom_label_2 ?? null;
      const customLabel3 = newRow.custom_label_3 ?? null;
      await db.profile.put({ id: userId, company_name: companyName, custom_label_1: customLabel1, custom_label_2: customLabel2, custom_label_3: customLabel3 });
      useStore.setState({ companyName, customLabel1, customLabel2, customLabel3 });
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') realtimeStatus = 'connected';
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') realtimeStatus = 'error';
      else if (status === 'CLOSED') realtimeStatus = 'disconnected';
    });
}

export function stopRealtime() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  realtimeStatus = 'disconnected';
}
