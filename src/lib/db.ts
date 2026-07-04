import Dexie, { type Table } from 'dexie';
import type { Party, CatalogValue, CatalogValueLink, Load, Entry, SyncTask, DeadTask, Profile } from '../types';

/** Current IndexedDB (Dexie) schema version. */
export const DB_VERSION = 6;

export class NexusDB extends Dexie {
  parties!: Table<Party, string>;
  catalogValues!: Table<CatalogValue, string>;
  catalogValueLinks!: Table<CatalogValueLink, string>;
  loads!: Table<Load, string>;
  entries!: Table<Entry, string>;
  profile!: Table<Profile, string>;
  syncQueue!: Table<SyncTask, number>;
  deadLetter!: Table<DeadTask, number>;

  constructor() {
    super('nexus_weight');
    this.version(2).stores({
      parties: 'id, name, user_id, is_deleted',
      fruits: 'id, name, user_id, is_deleted',
      varieties: 'id, name, user_id, fruit_id, is_deleted',
      caret_types: 'id, name, user_id, is_deleted',
      loads: 'id, created_at, user_id, party_id, vakkal_id, is_deleted',
      entries: 'id, load_id, created_at, user_id, is_deleted',
      syncQueue: '++id, createdAt',
    });
    // v3: retry metadata on syncQueue + dead-letter queue for poison tasks
    this.version(3).stores({
      parties: 'id, name, user_id, is_deleted',
      fruits: 'id, name, user_id, is_deleted',
      varieties: 'id, name, user_id, fruit_id, is_deleted',
      caret_types: 'id, name, user_id, is_deleted',
      loads: 'id, created_at, user_id, party_id, vakkal_id, is_deleted',
      entries: 'id, load_id, created_at, user_id, is_deleted',
      syncQueue: '++id, createdAt, nextAttemptAt',
      deadLetter: '++id, failedAt',
    });
    // v4: local cache of the profiles row (id, company_name) for offline reads
    this.version(4).stores({
      parties: 'id, name, user_id, is_deleted',
      fruits: 'id, name, user_id, is_deleted',
      varieties: 'id, name, user_id, fruit_id, is_deleted',
      caret_types: 'id, name, user_id, is_deleted',
      loads: 'id, created_at, user_id, party_id, vakkal_id, is_deleted',
      entries: 'id, load_id, created_at, user_id, is_deleted',
      profile: 'id',
      syncQueue: '++id, createdAt, nextAttemptAt',
      deadLetter: '++id, failedAt',
    });
    // v5: fixed fruits/varieties/caret_types entities replaced by the generic
    // catalog_values table (dynamic business labels). Old tables are dropped
    // locally — they were always a redundant cache of already-synced server
    // data, so nothing is lost.
    this.version(5).stores({
      parties: 'id, name, user_id, is_deleted',
      fruits: null,
      varieties: null,
      caret_types: null,
      catalogValues: 'id, user_id, field_number, is_deleted',
      loads: 'id, created_at, user_id, party_id, is_deleted',
      entries: 'id, load_id, created_at, user_id, is_deleted',
      profile: 'id',
      syncQueue: '++id, createdAt, nextAttemptAt',
      deadLetter: '++id, failedAt',
    });
    // v6: Linked Values — catalog values can now be linked to values from the
    // next configured label (e.g. Category "Mango" linked to Variety "Kesar")
    // via a generic many-to-many join table, cached locally for offline
    // Entry-screen filtering.
    this.version(6).stores({
      parties: 'id, name, user_id, is_deleted',
      fruits: null,
      varieties: null,
      caret_types: null,
      catalogValues: 'id, user_id, field_number, is_deleted',
      catalogValueLinks: 'id, user_id, value_id, linked_value_id, is_deleted',
      loads: 'id, created_at, user_id, party_id, is_deleted',
      entries: 'id, load_id, created_at, user_id, is_deleted',
      profile: 'id',
      syncQueue: '++id, createdAt, nextAttemptAt',
      deadLetter: '++id, failedAt',
    });
  }
}

export const db = new NexusDB();
