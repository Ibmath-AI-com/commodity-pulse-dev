// FILE: src/app/api/upload/init/route.ts
import { NextResponse } from "next/server";
import { buildObjectPath, createSignedUploadUrl, getStorage } from "@/lib/gcs";

export const runtime = "nodejs";

type Kind = "doc" | "rdata" | "general";

function kindFromContentType(contentType?: string): Kind {
  const ct = (contentType ?? "").toLowerCase().trim();
  if (ct === "application/pdf") return "doc";

  if (
    ct === "text/csv" ||
    ct === "application/csv" ||
    ct === "application/vnd.ms-excel" ||
    ct === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "rdata";
  }

  return "general";
}

function splitPath(objectName: string) {
  const parts = String(objectName || "").split("/").filter(Boolean);
  const base = parts.pop() || "file";
  const dir = parts.join("/");
  return { dir, base };
}

/**
 * Move all existing objects under incoming/<...dir...>/ to archive/<...dir...>/
 * preserving relative structure.
 *
 * Example:
 *   incoming/sulphur/doc/a.pdf  -> archive/sulphur/doc/a.pdf
 */
async function archiveExistingInFolder(opts: {
  bucket: string;
  incomingDir: string; // e.g. "incoming/sulphur/doc"
  keepObjectName?: string; // optionally keep the file we are about to upload
}) {
  const { bucket, incomingDir, keepObjectName } = opts;

  const storage = getStorage();
  const b = storage.bucket(bucket);
  const prefix = incomingDir.endsWith("/") ? incomingDir : `${incomingDir}/`;

  const [files] = await b.getFiles({ prefix });

  for (const f of files) {
    const name = f.name;

    if (!name || name.endsWith("/")) continue;
    if (keepObjectName && name === keepObjectName) continue;

    if (!name.startsWith("incoming/")) continue;

    const rel = name.slice("incoming/".length); // "sulphur/doc/a.pdf"
    const archivedName = `archive/${rel}`;

    await b.file(name).copy(b.file(archivedName));
    await b.file(name).delete(); // evacuate from incoming
  }
}

/**
 * Delete everything under clean/<commodity>/<kind>/
 *
 * Example:
 *   clean/sulphur/doc/... -> (deleted)
 */
async function wipeCleanCommodityDoc(opts: { bucket: string; commodity: string; kind: string }) {
  const { bucket, commodity, kind } = opts;

  const storage = getStorage();
  const b = storage.bucket(bucket);

  const prefix = `clean/${String(commodity || "").trim().toLowerCase()}/${String(kind || "").trim().toLowerCase()}/`;
  const [files] = await b.getFiles({ prefix });

  for (const f of files) {
    const name = f.name;
    if (!name || name.endsWith("/")) continue;
    await b.file(name).delete();
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const commodity = String(body.commodity ?? "sulphur");
    const filename = String(body.filename ?? "").trim();
    const contentType = String(body.contentType ?? "application/octet-stream").trim();

    if (!filename) {
      return NextResponse.json({ ok: false, error: "Missing filename" }, { status: 400 });
    }

    const allowedTypes = contentType.toLowerCase().trim();
    if (
      allowedTypes !== "application/pdf" &&
      allowedTypes !== "text/csv" &&
      allowedTypes !== "application/csv" &&
      allowedTypes !== "application/vnd.ms-excel" &&
      allowedTypes !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      return NextResponse.json(
        { ok: false, error: `Invalid content type. Received: ${contentType || "unknown"}.` },
        { status: 400 }
      );
    }

    const kind = kindFromContentType(contentType);
    const expiresMinutes = Number(process.env.GCS_SIGNED_URL_EXPIRES_MIN ?? "15") || 15;

    // build objectName (buildObjectPath includes "incoming/...")
    const objectName = buildObjectPath({ commodity, kind, filename });

    // create signed URL (this uses getStorage() internally from your updated lib)
    const signed = await createSignedUploadUrl({
      objectName,
      contentType,
      expiresMinutes,
    });

    // 1) Archive old files in the SAME incoming folder (incoming/<commodity>/<kind>/...)
    if (signed.objectName.startsWith("incoming/")) {
      const { dir } = splitPath(signed.objectName); // e.g. "incoming/sulphur/doc"
      await archiveExistingInFolder({
        bucket: signed.bucket,
        incomingDir: dir,
        // keepObjectName: signed.objectName, // optional
      });
    }

    // 2) Delete clean/<commodity>/<kind>/...
    await wipeCleanCommodityDoc({
      bucket: signed.bucket,
      commodity,
      kind,
    });

    return NextResponse.json({
      ok: true,
      bucket: signed.bucket,
      objectName: signed.objectName,
      uploadUrl: signed.url,
      expiresMinutes,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Init failed" }, { status: 500 });
  }
}
