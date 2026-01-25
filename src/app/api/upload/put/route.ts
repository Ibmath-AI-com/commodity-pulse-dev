export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";

function loadServiceAccountFromEnv() {
  const raw = (process.env.GOOGLE_APPLICATION_SA_JSON_B64 ?? "").trim();
  if (!raw) {
    throw new Error("Missing GOOGLE_APPLICATION_SA_JSON_B64");
  }

  // Accept either base64(JSON) or raw JSON pasted directly.
  let jsonText = raw;
  if (!raw.startsWith("{")) {
    jsonText = Buffer.from(raw, "base64").toString("utf8").trim();
  }

  let sa: any;
  try {
    sa = JSON.parse(jsonText);
  } catch {
    throw new Error("Invalid GOOGLE_APPLICATION_SA_JSON_B64 (cannot parse JSON)");
  }

  // Common formatting issue: private_key line breaks may be escaped
  if (typeof sa.private_key === "string") {
    sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  }

  if (!sa.client_email || !sa.private_key) {
    throw new Error("Service account JSON missing client_email/private_key");
  }

  return {
    credentials: {
      client_email: sa.client_email,
      private_key: sa.private_key,
    },
    projectId: sa.project_id,
  };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const bucket = String(form.get("bucket") ?? process.env.GCS_BUCKET ?? "");
    const objectName = String(form.get("objectName") ?? "");
    const contentType = String(form.get("contentType") ?? "application/octet-stream");

    if (!bucket) return NextResponse.json({ ok: false, error: "Missing bucket" }, { status: 400 });
    if (!objectName) return NextResponse.json({ ok: false, error: "Missing objectName" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });

    const { credentials, projectId } = loadServiceAccountFromEnv();

    // Create Storage client using env-provided service account
    const storage = new Storage({
      projectId,
      credentials,
    });

    const gcsFile = storage.bucket(bucket).file(objectName);
    const buf = Buffer.from(await file.arrayBuffer());

    await gcsFile.save(buf, {
      resumable: false,
      contentType,
      metadata: { cacheControl: "no-store" },
    });

    return NextResponse.json({ ok: true, bucket, objectName });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Upload error" }, { status: 500 });
  }
}
