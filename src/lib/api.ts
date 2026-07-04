import supabase from "./supabase";
import type { Resource } from "../types";

export class AuthError extends Error {
  constructor(msg = "Not authenticated") {
    super(msg);
    this.name = "AuthError";
  }
}

/** Thrown on a failed Supabase/Postgrest operation; carries a status-like code for retry classification (see sync.ts isPermanent). */
export class HttpError extends Error {
  status: number;
  body?: string;
  constructor(status: number, msg: string, body?: string) {
    super(msg);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

type Row = Record<string, unknown>;

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) throw new AuthError();
  return session.user.id;
}

/** Maps a Postgrest/Postgres error to an HttpError with a status sync.ts can classify. */
function toHttpError(
  err: { code?: string; message?: string } | Error,
): HttpError {
  const code = (err as { code?: string }).code;
  const message = (err as Error).message || String(err);
  if (code === "42501") return new HttpError(403, message); // insufficient_privilege (RLS denial)
  if (code === "23505") return new HttpError(409, message); // unique_violation
  if (code === "23503") return new HttpError(422, message); // foreign_key_violation
  if (code === "23514") return new HttpError(422, message); // check_violation (e.g. entry edit on a finalized load)
  if (code === "22P02" || code === "PGRST102")
    return new HttpError(400, message); // bad input
  if (code === "PGRST116") return new HttpError(404, message); // no rows found
  return new HttpError(500, message); // network blip / unknown -> transient, retried by sync.ts
}

function nowIso() {
  return new Date().toISOString();
}

/* ============================================================================
 * GET (read)
 * ========================================================================== */

async function getList<T>(
  table: Resource,
  userId: string,
  orderCol: string,
): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order(orderCol, { ascending: orderCol === "name" });
  if (error) throw toHttpError(error);
  return (data || []) as T;
}

async function getEntries<T>(
  userId: string,
  params: URLSearchParams,
): Promise<T> {
  const loadId = params.get("load_id");
  const limit = params.get("limit");
  let q = supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false);
  if (loadId) q = q.eq("load_id", loadId);
  q = q
    .order("created_at", { ascending: false })
    .limit(limit ? Number(limit) : 5000);
  const { data, error } = await q;
  if (error) throw toHttpError(error);
  return (data || []) as T;
}

async function getHistory<T>(
  userId: string,
  params: URLSearchParams,
): Promise<T> {
  const partyId = params.get("party_id");
  const from = params.get("from");
  const to = params.get("to");
  const q = (params.get("q") || "").trim();
  const movementType = params.get("movement_type");
  const status = params.get("status");
  const page = Math.max(1, Number(params.get("page") || "1"));
  const pageSize = Number(params.get("page_size") || "25");

  let query = supabase
    .from("loads")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .eq("is_deleted", false);
  if (partyId) query = query.eq("party_id", partyId);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  if (movementType) query = query.eq("movement_type", movementType);
  if (status) query = query.eq("status", status);

  if (q) {
    // Single global search: matches vehicle (label) and catalog fields directly,
    // plus party name (via a lookup), plus movement/status keywords (e.g. typing
    // "draft" surfaces draft loads) so one box covers everything the History
    // screen used to need separate filter fields for.
    const ql = q.toLowerCase();
    const orParts = [
      `label.ilike.%${q}%`,
      `custom_field_1.ilike.%${q}%`,
      `custom_field_2.ilike.%${q}%`,
      `custom_field_3.ilike.%${q}%`,
    ];

    const { data: matchedParties } = await supabase
      .from("parties")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", `%${q}%`);
    if (matchedParties?.length)
      orParts.push(
        `party_id.in.(${matchedParties.map((p) => p.id as string).join(",")})`,
      );

    if (ql.length >= 2) {
      (["inward", "outward"] as const).forEach((mt) => {
        if (mt.includes(ql)) orParts.push(`movement_type.eq.${mt}`);
      });
      (["draft", "finalized"] as const).forEach((st) => {
        if (st.includes(ql)) orParts.push(`status.eq.${st}`);
      });
    }

    query = query.or(orParts.join(","));
  }
  query = query.order("created_at", { ascending: false });
  const offset = (page - 1) * pageSize;
  query = query.range(offset, offset + pageSize - 1);

  const { data: loads, error, count } = await query;
  if (error) throw toHttpError(error);

  const loadIds = (loads || []).map((l) => l.id as string);
  const stats: Record<string, { count: number; total: number }> = {};
  if (loadIds.length) {
    const { data: ents, error: eErr } = await supabase
      .from("entries")
      .select("load_id, weight")
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .in("load_id", loadIds);
    if (eErr) throw toHttpError(eErr);
    for (const e of ents || []) {
      const key = e.load_id as string;
      if (!stats[key]) stats[key] = { count: 0, total: 0 };
      stats[key].count += 1;
      stats[key].total += Number(e.weight);
    }
  }
  const rows = (loads || []).map((l) => ({
    ...l,
    entry_count: stats[l.id as string]?.count || 0,
    total_weight: stats[l.id as string]?.total || 0,
  }));
  return { rows, total: count ?? rows.length, page, pageSize } as T;
}

const BACKUP_TABLES: Resource[] = [
  "parties",
  "catalog_values",
  "catalog_value_links",
  "loads",
  "entries",
];

const DEFAULT_LABELS = {
  custom_label_1: "Category",
  custom_label_2: "Variety",
  custom_label_3: "Vakkal",
};

async function getProfile<T>(userId: string): Promise<T> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, company_name, custom_label_1, custom_label_2, custom_label_3")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw toHttpError(error);
  return (data || { id: userId, company_name: null, ...DEFAULT_LABELS }) as T;
}

async function getBackup<T>(userId: string): Promise<T> {
  const tables: Record<string, unknown[]> = {};
  let count = 0;
  // Parallel, not sequential — these are independent reads. Soft-deleted rows
  // are excluded (a backup should mirror what the app actually shows; without
  // this, years of accumulated tombstones would make every backup payload
  // grow forever). profiles is keyed by `id` (= auth user id), not `user_id`,
  // so it's fetched separately below rather than through this loop.
  const results = await Promise.all(
    BACKUP_TABLES.map((t) =>
      supabase
        .from(t)
        .select("*")
        .eq("user_id", userId)
        .eq("is_deleted", false),
    ),
  );
  BACKUP_TABLES.forEach((t, i) => {
    const { data, error } = results[i];
    if (error) throw toHttpError(error);
    tables[t] = data || [];
    count += tables[t].length;
  });
  const profile = await getProfile<Row>(userId);
  tables["profiles"] = [profile];
  count += 1;
  return {
    version: 2,
    exportedAt: nowIso(),
    userId,
    tables,
    recordCount: count,
  } as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const [base, qs] = path.split("?");
  const params = new URLSearchParams(qs || "");
  const userId = await requireUserId();

  switch (base) {
    case "parties":
      return getList<T>("parties", userId, "name");
    case "catalog_values":
      return getList<T>("catalog_values", userId, "value");
    case "catalog_value_links":
      return getList<T>("catalog_value_links", userId, "created_at");
    case "loads":
      return getList<T>("loads", userId, "created_at");
    case "entries":
      return getEntries<T>(userId, params);
    case "history":
      return getHistory<T>(userId, params);
    case "backup":
      return getBackup<T>(userId);
    case "profiles":
      return getProfile<T>(userId);
    default:
      throw new HttpError(404, `Unknown resource: ${base}`);
  }
}

/* ============================================================================
 * POST (create) — mirrors each api/*.js handler's insert/upsert field set
 * ========================================================================== */

async function upsertOrInsert(table: Resource, row: Row & { id?: unknown }) {
  const { data, error } = row.id
    ? await supabase
        .from(table)
        .upsert(row, { onConflict: "id" })
        .select()
        .single()
    : await supabase.from(table).insert(row).select().single();
  if (error) throw toHttpError(error);
  return data;
}

async function createParty(userId: string, b: Row) {
  const row: Row = {
    user_id: userId,
    name: b.name,
    phone: (b.phone as string) || null,
    place: (b.place as string) || null,
    party_type: (b.party_type as string) || "customer",
    updated_at: nowIso(),
  };
  if (b.id) row.id = b.id;
  return upsertOrInsert("parties", row);
}
/** Creates a catalog value, resolving gracefully instead of failing when two
 * offline-first clients (or two tabs) independently create the exact same
 * value text before either has seen the other's write: the DB's case-
 * insensitive uniqueness index rejects the second insert with 23505, and
 * rather than dead-lettering that as a permanent failure, this returns the
 * row that already won the race so the sync task still completes — the
 * caller (sync.ts) reconciles the local duplicate onto the canonical id. */
async function createCatalogValue(userId: string, b: Row) {
  const row: Row = {
    user_id: userId,
    field_number: b.field_number,
    value: b.value,
    updated_at: nowIso(),
  };
  if (b.id) row.id = b.id;
  try {
    return await upsertOrInsert("catalog_values", row);
  } catch (e) {
    if (
      e instanceof HttpError &&
      e.status === 409 &&
      e.message.includes("idx_catalog_values_unique_active")
    ) {
      const { data, error } = await supabase
        .from("catalog_values")
        .select("*")
        .eq("user_id", userId)
        .eq("field_number", b.field_number)
        .ilike("value", (b.value as string).replace(/[%_]/g, "\\$&"))
        .eq("is_deleted", false)
        .maybeSingle();
      if (!error && data) return data;
    }
    throw e;
  }
}
async function createCatalogValueLink(userId: string, b: Row) {
  const row: Row = {
    user_id: userId,
    value_id: b.value_id,
    linked_value_id: b.linked_value_id,
    updated_at: nowIso(),
  };
  if (b.id) row.id = b.id;
  return upsertOrInsert("catalog_value_links", row);
}
async function createLoad(userId: string, b: Row) {
  const row: Row = {
    user_id: userId,
    party_id: (b.party_id as string) || null,
    label: b.label,
    movement_type: (b.movement_type as string) || "inward",
    custom_field_1: (b.custom_field_1 as string) || null,
    custom_field_2: (b.custom_field_2 as string) || null,
    custom_field_3: (b.custom_field_3 as string) || null,
    container_count: (b.container_count as number) ?? null,
    weight_per_container: (b.weight_per_container as number) ?? null,
    status: (b.status as string) || "draft",
    updated_at: nowIso(),
  };
  if (b.id) row.id = b.id;
  if (b.created_at) row.created_at = b.created_at;
  return upsertOrInsert("loads", row);
}
async function createEntry(userId: string, b: Row) {
  const row: Row = {
    user_id: userId,
    load_id: b.load_id,
    party_id: (b.party_id as string) || null,
    seq: (b.seq as number) || 0,
    weight: b.weight,
    custom_field_1: (b.custom_field_1 as string) || null,
    custom_field_2: (b.custom_field_2 as string) || null,
    custom_field_3: (b.custom_field_3 as string) || null,
    updated_at: nowIso(),
  };
  if (b.id) row.id = b.id;
  return upsertOrInsert("entries", row);
}

const RESTORE_ORDER: Resource[] = [
  "parties",
  "catalog_values",
  "catalog_value_links",
  "loads",
  "entries",
];

async function restoreProfile(userId: string, rows: Row[] | undefined) {
  const p = rows?.[0];
  if (!p) return 0;
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      company_name: (p.company_name as string) ?? null,
      custom_label_1: (p.custom_label_1 as string) ?? null,
      custom_label_2: (p.custom_label_2 as string) ?? null,
      custom_label_3: (p.custom_label_3 as string) ?? null,
      updated_at: nowIso(),
    },
    { onConflict: "id" },
  );
  if (error) throw toHttpError(error);
  return 1;
}

async function restoreSnapshot(
  userId: string,
  snapshot: { tables?: Record<string, Row[]> } | null | undefined,
) {
  if (!snapshot || !snapshot.tables)
    throw new HttpError(400, "Invalid backup file");
  let restored = 0;
  // profiles is keyed by `id`, not `user_id` — restored separately from the loop below.
  restored += await restoreProfile(userId, snapshot.tables["profiles"]);

  // A finalized load's own entries are DB-trigger-locked (trg_entries_lock_finalized)
  // against insert/update — correct for normal app usage, but restoring a
  // backup taken after a load was finalized would then fail to write back
  // its own entries in the same breath. Restore every load as 'draft' first
  // (entries can then land freely), and re-apply each load's real status —
  // a plain loads-only UPDATE, untouched by the entries trigger — afterward.
  let finalizedLoadIds: string[] = [];
  for (const t of RESTORE_ORDER) {
    const rows = snapshot.tables[t];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    let cleaned: Row[] = rows.map((r) => ({ ...r, user_id: userId }));
    if (t === "loads") {
      finalizedLoadIds = cleaned
        .filter((r) => r.status === "finalized")
        .map((r) => r.id as string);
      cleaned = cleaned.map((r) =>
        r.status === "finalized" ? { ...r, status: "draft" } : r,
      );
    }
    for (let i = 0; i < cleaned.length; i += 500) {
      const chunk = cleaned.slice(i, i + 500);
      const { error } = await supabase
        .from(t)
        .upsert(chunk, { onConflict: "id" });
      if (error) throw toHttpError(error);
      restored += chunk.length;
    }
  }

  for (let i = 0; i < finalizedLoadIds.length; i += 500) {
    const chunk = finalizedLoadIds.slice(i, i + 500);
    const { error } = await supabase
      .from("loads")
      .update({ status: "finalized" })
      .in("id", chunk)
      .eq("user_id", userId);
    if (error) throw toHttpError(error);
  }

  return { ok: true, restored };
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const userId = await requireUserId();
  if (path === "restore")
    return (await restoreSnapshot(
      userId,
      body as { tables?: Record<string, Row[]> },
    )) as T;

  const b = (body || {}) as Row;
  switch (path) {
    case "parties":
      return (await createParty(userId, b)) as T;
    case "catalog_values":
      return (await createCatalogValue(userId, b)) as T;
    case "catalog_value_links":
      return (await createCatalogValueLink(userId, b)) as T;
    case "loads":
      return (await createLoad(userId, b)) as T;
    case "entries":
      return (await createEntry(userId, b)) as T;
    default:
      throw new HttpError(404, `Unknown resource: ${path}`);
  }
}

/* ============================================================================
 * PUT (update) — mirrors each api/*.js handler's updatable field set
 * ========================================================================== */

async function updateParty(userId: string, b: Row) {
  const upd: Row = {
    name: b.name,
    phone: (b.phone as string) || null,
    place: (b.place as string) || null,
    updated_at: nowIso(),
  };
  if (b.party_type !== undefined) upd.party_type = b.party_type;
  const { data, error } = await supabase
    .from("parties")
    .update(upd)
    .eq("id", b.id as string)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw toHttpError(error);
  return data;
}

async function updateProfile(userId: string, b: Row) {
  const row: Row = { id: userId, updated_at: nowIso() };
  if (b.company_name !== undefined)
    row.company_name = (b.company_name as string) ?? null;
  if (b.custom_label_1 !== undefined)
    row.custom_label_1 = (b.custom_label_1 as string) ?? null;
  if (b.custom_label_2 !== undefined)
    row.custom_label_2 = (b.custom_label_2 as string) ?? null;
  if (b.custom_label_3 !== undefined)
    row.custom_label_3 = (b.custom_label_3 as string) ?? null;
  const { data, error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();
  if (error) throw toHttpError(error);
  return data;
}
async function updateCatalogValue(userId: string, b: Row) {
  const upd: Row = { updated_at: nowIso() };
  if (b.value !== undefined) upd.value = b.value;
  const { data, error } = await supabase
    .from("catalog_values")
    .update(upd)
    .eq("id", b.id as string)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw toHttpError(error);
  return data;
}
async function updateLoad(userId: string, b: Row) {
  const upd: Row = { updated_at: nowIso() };
  if (b.party_id !== undefined) upd.party_id = b.party_id || null;
  if (b.label !== undefined) upd.label = b.label;
  if (b.status !== undefined) upd.status = b.status;
  if (b.movement_type !== undefined) upd.movement_type = b.movement_type;
  if (b.custom_field_1 !== undefined)
    upd.custom_field_1 = b.custom_field_1 || null;
  if (b.custom_field_2 !== undefined)
    upd.custom_field_2 = b.custom_field_2 || null;
  if (b.custom_field_3 !== undefined)
    upd.custom_field_3 = b.custom_field_3 || null;
  if (b.container_count !== undefined)
    upd.container_count = b.container_count ?? null;
  if (b.weight_per_container !== undefined)
    upd.weight_per_container = b.weight_per_container ?? null;
  const { data, error } = await supabase
    .from("loads")
    .update(upd)
    .eq("id", b.id as string)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw toHttpError(error);
  return data;
}
async function updateEntry(userId: string, b: Row) {
  const { data, error } = await supabase
    .from("entries")
    .update({ weight: b.weight, updated_at: nowIso() })
    .eq("id", b.id as string)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw toHttpError(error);
  return data;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const userId = await requireUserId();
  const b = (body || {}) as Row;
  switch (path) {
    case "parties":
      return (await updateParty(userId, b)) as T;
    case "catalog_values":
      return (await updateCatalogValue(userId, b)) as T;
    case "loads":
      return (await updateLoad(userId, b)) as T;
    case "entries":
      return (await updateEntry(userId, b)) as T;
    case "profiles":
      return (await updateProfile(userId, b)) as T;
    default:
      throw new HttpError(404, `Unknown resource: ${path}`);
  }
}

/* ============================================================================
 * DELETE (soft-delete, with the same cascades as the original handlers)
 * ========================================================================== */

async function deleteParty(userId: string, b: Row) {
  const { error } = await supabase
    .from("parties")
    .update({ is_deleted: true, updated_at: nowIso() })
    .eq("id", b.id as string)
    .eq("user_id", userId);
  if (error) throw toHttpError(error);
  return { ok: true };
}
async function deleteCatalogValue(userId: string, b: Row) {
  const { error } = await supabase
    .from("catalog_values")
    .update({ is_deleted: true, updated_at: nowIso() })
    .eq("id", b.id as string)
    .eq("user_id", userId);
  if (error) throw toHttpError(error);
  return { ok: true };
}
async function deleteCatalogValueLink(userId: string, b: Row) {
  const { error } = await supabase
    .from("catalog_value_links")
    .update({ is_deleted: true, updated_at: nowIso() })
    .eq("id", b.id as string)
    .eq("user_id", userId);
  if (error) throw toHttpError(error);
  return { ok: true };
}
async function deleteLoad(userId: string, b: Row) {
  const { error } = await supabase
    .from("loads")
    .update({ is_deleted: true, updated_at: nowIso() })
    .eq("id", b.id as string)
    .eq("user_id", userId);
  if (error) throw toHttpError(error);
  // cascade: a deleted load takes its entries with it
  await supabase
    .from("entries")
    .update({ is_deleted: true, updated_at: nowIso() })
    .eq("load_id", b.id as string)
    .eq("user_id", userId);
  return { ok: true };
}
async function deleteEntry(userId: string, b: Row) {
  const { error } = await supabase
    .from("entries")
    .update({ is_deleted: true, updated_at: nowIso() })
    .eq("id", b.id as string)
    .eq("user_id", userId);
  if (error) throw toHttpError(error);
  return { ok: true };
}

export async function apiDelete<T>(path: string, body: unknown): Promise<T> {
  const userId = await requireUserId();
  const b = (body || {}) as Row;
  switch (path) {
    case "parties":
      return (await deleteParty(userId, b)) as T;
    case "catalog_values":
      return (await deleteCatalogValue(userId, b)) as T;
    case "catalog_value_links":
      return (await deleteCatalogValueLink(userId, b)) as T;
    case "loads":
      return (await deleteLoad(userId, b)) as T;
    case "entries":
      return (await deleteEntry(userId, b)) as T;
    default:
      throw new HttpError(404, `Unknown resource: ${path}`);
  }
}
