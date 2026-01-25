// FILE: src/lib/gcs.ts
import { Storage } from "@google-cloud/storage";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export function getBucketName(): string {
  return requireEnv("GCS_BUCKET");
}

export function getStorage(): Storage {
  return new Storage({
    keyFilename: requireEnv("GOOGLE_APPLICATION_CREDENTIALS"),
  });
}

export function buildObjectPath(params: {
  commodity: string;
  kind: string,
  filename: string;
  region?: string; // optional
}) {
  const commodity = params.commodity.trim().toLowerCase();
  const kind = params.kind;
  const safeFilename = params.filename.replace(/[\\]/g, "/").split("/").pop() || "file";

  // Optional region partition
  const region = (params.region ?? "").trim().toLowerCase();

  // Example (no region): incoming/sulphur/doc/report.pdf
  // Example (with region): incoming/sulphur/doc/global/report.pdf
  return region
    ? `incoming/${commodity}/${kind}/${region}/${safeFilename}`
    : `incoming/${commodity}/${kind}/${safeFilename}`;
}

export async function createSignedUploadUrl(params: {
  objectName: string;
  contentType: string;
  expiresMinutes: number;
}) {
  const storage = getStorage();
  const bucketName = getBucketName();
  const file = storage.bucket(bucketName).file(params.objectName);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + params.expiresMinutes * 60 * 1000,
    contentType: params.contentType,
  });

  return { url, bucket: bucketName, objectName: params.objectName };
}

export async function headObject(params: { objectName: string }) {
  const storage = getStorage();
  const bucketName = getBucketName();
  const file = storage.bucket(bucketName).file(params.objectName);

  const [exists] = await file.exists();
  if (!exists) return { exists: false as const };

  const [meta] = await file.getMetadata();
  return {
    exists: true as const,
    bucket: bucketName,
    objectName: params.objectName,
    size: meta.size,
    contentType: meta.contentType,
    updated: meta.updated,
    md5Hash: meta.md5Hash,
  };
}

export async function listObjects(params: {
  prefix: string;
  endsWith?: string;
  maxResults?: number;
}) {
  const storage = getStorage();
  const bucketName = getBucketName();

  const [files] = await storage.bucket(bucketName).getFiles({
    prefix: params.prefix,
    autoPaginate: true,
    maxResults: params.maxResults ?? 200,
  });

  const filtered = files
    .filter((f) => (params.endsWith ? f.name.toLowerCase().endsWith(params.endsWith) : true))
    .map((f) => ({
      name: f.name,
      size: f.metadata?.size,
      contentType: f.metadata?.contentType,
      updated: f.metadata?.updated,
    }))
    // newest first (string ISO compare works here)
    .sort((a, b) => String(b.updated ?? "").localeCompare(String(a.updated ?? "")));

  return { bucket: bucketName, items: filtered };
}

/* =============================================================================
   NEW HELPERS (for "clean exists" + viewer signed URL)
   ============================================================================= */

/**
 * Build the "clean" object path that mirrors buildObjectPath() layout.
 * Examples:
 *  - clean/sulphur/doc/report.pdf
 *  - clean/sulphur/doc/global/report.pdf
 */
export function buildCleanObjectPath(params: {
  commodity: string;
  kind: "doc" | "price";
  filename: string;
  region?: string; // optional
}) {
  const commodity = params.commodity.trim().toLowerCase();
  const kind = params.kind;
  const safeFilename = params.filename.replace(/[\\]/g, "/").split("/").pop() || "file";
  const region = (params.region ?? "").trim().toLowerCase();

  return region
    ? `clean/${commodity}/${kind}/${region}/${safeFilename}`
    : `clean/${commodity}/${kind}/${safeFilename}`;
}

/**
 * Lightweight existence check (cheaper than headObject when you only need a boolean).
 */
export async function objectExists(params: { objectName: string }): Promise<boolean> {
  const storage = getStorage();
  const bucketName = getBucketName();
  const file = storage.bucket(bucketName).file(params.objectName);
  const [exists] = await file.exists();
  return exists;
}

/**
 * Signed READ URL for viewer page (private bucket).
 * Use this to embed PDF in an iframe.
 */
export async function createSignedReadUrl(params: { objectName: string; expiresMinutes: number }) {
  const storage = getStorage();
  const bucketName = getBucketName();
  const file = storage.bucket(bucketName).file(params.objectName);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + params.expiresMinutes * 60 * 1000,
  });

  return { url, bucket: bucketName, objectName: params.objectName, expiresMinutes: params.expiresMinutes };
}

export async function getSignedReadUrl(params: { objectName: string; expiresMinutes?: number }) {
  const storage = getStorage();
  const bucket = storage.bucket(getBucketName());
  const file = bucket.file(params.objectName);

  const expiresMinutes = params.expiresMinutes ?? 10;
  const expires = Date.now() + expiresMinutes * 60_000;

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires,
  });

  return url;
}
