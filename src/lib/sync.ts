import { db } from "./db";
import { apiPost, apiPut, apiDelete, AuthError, HttpError } from "./api";
import type {
  SyncTask,
  DeadTask,
  Resource,
  SyncOp,
  SyncDiagnostics,
  CatalogValue,
} from "../types";

/* ============================================================================
 * Offline sync engine
 *  - Exponential backoff with jitter (per task)
 *  - Maximum retry count → dead-letter queue
 *  - Poison-task handling: permanent (4xx-equivalent) failures are dead-lettered
 *    immediately; a bad task never blocks the rest of the queue
 *  - Retry diagnostics: attempts, lastError, nextAttemptAt, live stats
 *
 * Transport: apiPost/apiPut/apiDelete (./api) now call Supabase/Postgrest
 * directly instead of a custom /api/* backend. HttpError.status here is a
 * classification code assigned by api.ts's toHttpError() from the Postgrest
 * error code (e.g. RLS denial -> 403, unique_violation -> 409), not a real
 * HTTP response — isPermanent()'s 4xx/5xx bucketing below still applies.
 * ========================================================================== */

export const MAX_ATTEMPTS = 8; // give up after this many failed tries
const BASE_DELAY_MS = 2_000; // first backoff step
const MAX_DELAY_MS = 5 * 60_000; // cap backoff at 5 minutes
const FLUSH_INTERVAL_MS = 15_000;

let running = false;
let lastFlushAt: number | null = null;
let lastError: string | null = null;

type Listener = (d: SyncDiagnostics) => void;
const listeners = new Set<Listener>();

/* ------------------------------- queueing -------------------------------- */

export async function enqueue(
  resource: Resource,
  op: SyncOp,
  payload: Record<string, unknown>,
) {
  await db.syncQueue.add({
    resource,
    op,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
  });
  void notify();
  void flushQueue();
}

export async function pendingCount(): Promise<number> {
  return db.syncQueue.count();
}

export async function deadCount(): Promise<number> {
  return db.deadLetter.count();
}

/* ---------------------------- error handling ----------------------------- */

/** A permanent failure should NOT be retried (client-side/validation errors). */
function isPermanent(err: unknown): boolean {
  if (err instanceof AuthError) return false; // transient: token may refresh
  if (err instanceof HttpError) {
    // 408 (timeout) & 429 (rate limit) are transient; other 4xx-equivalents are permanent
    if (err.status === 408 || err.status === 429) return false;
    // 422 Foreign key violations are transient — parent record may not have synced yet
    if (err.status === 422 && err.body?.includes("foreign key")) return false;
    return err.status >= 400 && err.status < 500;
  }
  return false; // network/unknown → transient
}

function errMessage(err: unknown): string {
  if (err instanceof HttpError)
    return `HTTP ${err.status}: ${err.body?.slice(0, 200) || err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Exponential backoff with full jitter. */
function backoffDelay(attempt: number): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
  return Math.floor(Math.random() * exp); // full jitter avoids thundering herd
}

/* ------------------------------- flushing -------------------------------- */

/** Two offline-first clients (or two tabs) can independently create the
 * exact same catalog value text before either has seen the other's write;
 * api.ts's createCatalogValue resolves that race by returning the row that
 * already won instead of throwing, so this task still completes — but the
 * locally-generated id used everywhere in this session (Dexie + the live
 * Zustand list) is now an orphan that never made it to the server. Swap it
 * for the canonical row here so no duplicate lingers in the UI.
 *
 * Dynamic import (not a static one) avoids a module cycle: useStore.ts
 * already imports sync.ts for enqueue()/pendingCount(). */
async function reconcileDuplicateCatalogValue(
  localId: string,
  canonical: CatalogValue,
) {
  await db.catalogValues.delete(localId);
  await db.catalogValues.put(canonical);
  const { useStore } = await import("../store/useStore");
  const exists = useStore
    .getState()
    .catalogValues.some((v) => v.id === canonical.id);
  useStore.setState((s) => ({
    catalogValues: s.catalogValues
      .filter((v) => v.id !== localId)
      .map((v) => (v.id === canonical.id ? canonical : v))
      .concat(exists ? [] : [canonical]),
  }));
}

async function runTask(task: SyncTask) {
  const { resource, op, payload } = task;
  if (op === "create") {
    const result = await apiPost<CatalogValue | Record<string, unknown>>(
      resource,
      payload,
    );
    const localId = (payload as { id?: string }).id;
    const canonicalId = (result as { id?: string })?.id;
    if (
      resource === "catalog_values" &&
      localId &&
      canonicalId &&
      canonicalId !== localId
    ) {
      await reconcileDuplicateCatalogValue(localId, result as CatalogValue);
    }
    return result;
  }
  if (op === "update") return apiPut(resource, payload);
  if (op === "delete") return apiDelete(resource, payload);
  throw new HttpError(400, `Unknown op: ${op}`);
}

async function deadLetter(
  task: SyncTask,
  reason: DeadTask["reason"],
  message: string,
) {
  const dead: DeadTask = {
    resource: task.resource,
    op: task.op,
    payload: task.payload,
    createdAt: task.createdAt,
    failedAt: Date.now(),
    attempts: task.attempts ?? 0,
    lastError: message,
    reason,
  };
  await db.transaction("rw", db.syncQueue, db.deadLetter, async () => {
    await db.deadLetter.add(dead);
    if (task.id != null) await db.syncQueue.delete(task.id);
  });
  console.error(
    `[sync] task dead-lettered (${reason}):`,
    task.resource,
    task.op,
    message,
  );
}

export async function flushQueue(): Promise<void> {
  if (running) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  running = true;
  void notify();
  try {
    const now = Date.now();
    // Only process tasks whose backoff window has elapsed; skip the rest so a
    // single failing task can never block ready tasks (no head-of-line blocking).
    const tasks = await db.syncQueue.orderBy("createdAt").toArray();
    for (const task of tasks) {
      if ((task.nextAttemptAt ?? 0) > now) continue; // still backing off
      try {
        await runTask(task);
        if (task.id != null) await db.syncQueue.delete(task.id);
        lastError = null;
      } catch (err) {
        const attempts = (task.attempts ?? 0) + 1;
        const message = errMessage(err);
        lastError = message;

        if (isPermanent(err)) {
          // Poison task: will never succeed → dead-letter immediately.
          await deadLetter({ ...task, attempts }, "permanent", message);
          continue; // keep processing the rest of the queue
        }
        if (attempts >= MAX_ATTEMPTS) {
          await deadLetter({ ...task, attempts }, "max_retries", message);
          continue;
        }
        // transient failure → schedule a backoff retry, keep going
        if (
          err instanceof HttpError &&
          err.status === 422 &&
          err.body?.includes("foreign key")
        ) {
          console.warn(
            `[sync] FK constraint violation on ${task.resource} — likely parent record hasn't synced yet; retrying with backoff (attempt ${attempts}/${MAX_ATTEMPTS})`,
          );
        }
        if (task.id != null) {
          await db.syncQueue.update(task.id, {
            attempts,
            lastError: message,
            lastAttemptAt: now,
            nextAttemptAt: now + backoffDelay(attempts),
          });
        }
      }
    }
  } finally {
    running = false;
    lastFlushAt = Date.now();
    void notify();
  }
}

/* ---------------------------- dead-letter mgmt --------------------------- */

export async function listDeadTasks(): Promise<DeadTask[]> {
  return db.deadLetter.orderBy("failedAt").reverse().toArray();
}

/** Requeue a dead task for another try (resets attempts/backoff). */
export async function retryDeadTask(id: number): Promise<void> {
  const dead = await db.deadLetter.get(id);
  if (!dead) return;
  await db.transaction("rw", db.syncQueue, db.deadLetter, async () => {
    await db.syncQueue.add({
      resource: dead.resource,
      op: dead.op,
      payload: dead.payload,
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: 0,
    });
    await db.deadLetter.delete(id);
  });
  void notify();
  void flushQueue();
}

export async function retryAllDeadTasks(): Promise<number> {
  const all = await listDeadTasks();
  for (const d of all) if (d.id != null) await retryDeadTask(d.id);
  return all.length;
}

export async function discardDeadTask(id: number): Promise<void> {
  await db.deadLetter.delete(id);
  void notify();
}

export async function clearDeadLetter(): Promise<void> {
  await db.deadLetter.clear();
  void notify();
}

/* ----------------------------- diagnostics ------------------------------- */

export async function getDiagnostics(): Promise<SyncDiagnostics> {
  const now = Date.now();
  const pendingTasks = await db.syncQueue.toArray();
  const scheduledRetries = pendingTasks.filter(
    (t) => (t.nextAttemptAt ?? 0) > now,
  ).length;
  return {
    pending: pendingTasks.length,
    dead: await db.deadLetter.count(),
    inFlight: running,
    lastFlushAt,
    lastError,
    scheduledRetries,
  };
}

export function subscribeDiagnostics(fn: Listener): () => void {
  listeners.add(fn);
  void notify();
  return () => listeners.delete(fn);
}

async function notify() {
  if (listeners.size === 0) return;
  const d = await getDiagnostics();
  listeners.forEach((fn) => fn(d));
}

/* ------------------------------ lifecycle -------------------------------- */

let timer: number | null = null;
let engineStarted = false;

export function initSyncEngine() {
  // Guard against double-init (e.g. React StrictMode) so we don't register
  // duplicate 'online' listeners or intervals that would trigger extra flushes.
  if (engineStarted) {
    void flushQueue();
    return;
  }
  engineStarted = true;
  window.addEventListener("online", () => void flushQueue());
  if (timer == null) {
    timer = window.setInterval(() => {
      void flushQueue();
    }, FLUSH_INTERVAL_MS);
  }
  void flushQueue();
}
