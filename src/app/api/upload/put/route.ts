export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";

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

    const storage = new Storage(); // uses GOOGLE_APPLICATION_CREDENTIALS locally
    const gcsFile = storage.bucket(bucket).file(objectName);

    const buf = Buffer.from(await file.arrayBuffer());

    await gcsFile.save(buf, {
      resumable: false,
      contentType,
      // optional:
      metadata: { cacheControl: "no-store" },
    });

    return NextResponse.json({ ok: true, bucket, objectName });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Upload error" }, { status: 500 });
  }
}
