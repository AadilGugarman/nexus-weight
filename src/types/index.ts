export type PartyType = 'customer' | 'supplier';

export interface Party {
  id: string;
  user_id: string;
  name: string;
  phone?: string | null;
  place?: string | null;
  party_type?: PartyType | null; // persisted: parties.party_type, DB default 'customer'
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Profile {
  id: string;
  company_name?: string | null;
  custom_label_1?: string | null; // persisted: profiles.custom_label_1, backfilled default 'Category'
  custom_label_2?: string | null; // persisted: profiles.custom_label_2, backfilled default 'Variety'
  custom_label_3?: string | null; // persisted: profiles.custom_label_3, backfilled default 'Vakkal'
  updated_at?: string;
}

/** Which of the business's 3 configurable fields (profiles.custom_label_1/2/3) this value belongs to. */
export type CatalogFieldNumber = 1 | 2 | 3;

/** A reusable value for one of the business's dynamic catalog fields (e.g. a
 * fruit trader's Category values: Mango, Grapes, Banana). Purely an
 * autocomplete/suggestion source — loads store the chosen text directly in
 * custom_field_1/2/3, not a reference to this row. */
export interface CatalogValue {
  id: string;
  user_id: string;
  field_number: CatalogFieldNumber;
  value: string;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** A link from one catalog value to another value from the business's next
 * configured label (e.g. Category "Mango" -> Variety "Kesar"), letting Load
 * Entry pickers filter to just the linked values. Plain many-to-many: a
 * value can link to several values, and be linked from several different
 * values (e.g. Grade "Premium" linked from both "White" and "Red"). No
 * hierarchy "mode" is stored anywhere — a value with zero outgoing links
 * simply means every value of the next field is offered (today's behavior). */
export interface CatalogValueLink {
  id: string;
  user_id: string;
  value_id: string;
  linked_value_id: string;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type MovementType = 'inward' | 'outward';

export type LoadStatus = 'draft' | 'finalized';

export interface Load {
  id: string;
  user_id: string;
  party_id?: string | null;
  label: string;
  movement_type?: MovementType | null; // persisted: loads.movement_type, DB default 'inward'
  custom_field_1?: string | null; // persisted: loads.custom_field_1, labeled per profiles.custom_label_1
  custom_field_2?: string | null; // persisted: loads.custom_field_2, labeled per profiles.custom_label_2
  custom_field_3?: string | null; // persisted: loads.custom_field_3, labeled per profiles.custom_label_3
  container_count?: number | null; // tare system: number of containers (carets, sacks, ...)
  weight_per_container?: number | null; // tare system: kg per container; tare = container_count * weight_per_container
  status?: LoadStatus; // 'draft' (editable) | 'finalized' (locked — entries.trg_entries_lock_finalized enforces this server-side too)
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Entry {
  id: string;
  user_id: string;
  load_id: string;
  party_id?: string | null;
  seq?: number;
  weight: number;
  // Per-entry catalog labels (Group Entry Mode) — falls back to the parent
  // load's own custom_field_1/2/3 when unset, so entries created before this
  // existed (or added without changing the active group) keep working.
  custom_field_1?: string | null;
  custom_field_2?: string | null;
  custom_field_3?: string | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LoadHistory extends Load {
  entry_count: number;
  total_weight: number;
}

export interface HistoryPage {
  rows: LoadHistory[];
  total: number;
  page: number;
  pageSize: number;
}

export type SyncOp = 'create' | 'update' | 'delete';
export type Resource = 'parties' | 'catalog_values' | 'catalog_value_links' | 'loads' | 'entries' | 'profiles';

export interface SyncTask {
  id?: number;
  resource: Resource;
  op: SyncOp;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts?: number;        // number of failed attempts so far
  nextAttemptAt?: number;   // epoch ms; task is skipped until this time (backoff)
  lastError?: string;       // last failure message
  lastAttemptAt?: number;   // epoch ms of the most recent attempt
}

export interface DeadTask {
  id?: number;
  resource: Resource;
  op: SyncOp;
  payload: Record<string, unknown>;
  createdAt: number;      // original enqueue time
  failedAt: number;       // when it was moved to the dead-letter queue
  attempts: number;       // total attempts made before giving up
  lastError: string;      // final error message
  reason: 'max_retries' | 'permanent';
}

export interface SyncDiagnostics {
  pending: number;
  dead: number;
  inFlight: boolean;
  lastFlushAt: number | null;
  lastError: string | null;
  scheduledRetries: number;   // pending tasks currently waiting on backoff
}
