import type { ReviewPayload } from "@/components/submit/submit-review";

const DB_NAME = "trp-pending-setup";
const STORE = "submits";
const DB_VERSION = 1;

export type PendingSetupSubmitRecord = {
  userId: string;
  review: ReviewPayload;
  imageBlob: Blob | null;
  screenshotUrl: string;
  lastError: string;
  retryCount: number;
  nextRetryAt: string;
  createdAt: string;
  updatedAt: string;
};

export const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000, 600_000] as const;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Could not open storage"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "userId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        req.onerror = () => reject(req.error ?? new Error("Storage operation failed"));
        req.onsuccess = () => resolve(req.result as T);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error ?? new Error("Storage transaction failed"));
      }),
  );
}

export function nextRetryDelayMs(retryCount: number): number {
  const idx = Math.min(retryCount, RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[idx];
}

export async function getPendingSetupSubmit(
  userId: string,
): Promise<PendingSetupSubmitRecord | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const row = await withStore("readonly", (store) => store.get(userId));
    return (row as PendingSetupSubmitRecord | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function savePendingSetupSubmit(input: {
  userId: string;
  review: ReviewPayload;
  imageBlob: Blob | null;
  screenshotUrl: string;
  lastError: string;
  retryCount?: number;
  nextRetryAt?: string;
}): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  const existing = await getPendingSetupSubmit(input.userId);
  const now = new Date().toISOString();
  const retryCount = input.retryCount ?? existing?.retryCount ?? 0;
  const nextRetryAt =
    input.nextRetryAt ??
    new Date(Date.now() + nextRetryDelayMs(retryCount)).toISOString();

  const record: PendingSetupSubmitRecord = {
    userId: input.userId,
    review: input.review,
    imageBlob: input.imageBlob,
    screenshotUrl: input.screenshotUrl || input.review.screenshotUrl,
    lastError: input.lastError,
    retryCount,
    nextRetryAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await withStore("readwrite", (store) => store.put(record));
}

export async function bumpPendingSetupRetry(
  userId: string,
  lastError: string,
): Promise<PendingSetupSubmitRecord | null> {
  const existing = await getPendingSetupSubmit(userId);
  if (!existing) return null;

  const retryCount = existing.retryCount + 1;
  const nextRetryAt = new Date(
    Date.now() + nextRetryDelayMs(retryCount),
  ).toISOString();

  await savePendingSetupSubmit({
    userId,
    review: existing.review,
    imageBlob: existing.imageBlob,
    screenshotUrl: existing.screenshotUrl,
    lastError,
    retryCount,
    nextRetryAt,
  });

  return getPendingSetupSubmit(userId);
}

export async function clearPendingSetupSubmit(userId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await withStore("readwrite", (store) => store.delete(userId));
  } catch {
    /* ignore */
  }
}

export function blobToFile(blob: Blob, name = "setup-chart.webp"): File {
  return new File([blob], name, {
    type: blob.type || "image/webp",
    lastModified: Date.now(),
  });
}
