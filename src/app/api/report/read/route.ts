// FILE: src/app/api/report/read/route.ts
import { NextResponse } from "next/server";
import { getStorage, getBucketName } from "@/lib/gcs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const objectName = (url.searchParams.get("objectName") ?? "").trim();
    if (!objectName) {
      return NextResponse.json({ ok: false, error: "objectName is required" }, { status: 400 });
    }

    const storage = getStorage();
    const bucket = storage.bucket(getBucketName());
    const file = bucket.file(objectName);

    const [buf] = await file.download();
    const text = buf.toString("utf8");

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      // If it isn't valid JSON, still return text so UI can show it.
      return NextResponse.json(
        { ok: true, kind: "text", objectName, text },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, kind: "json", objectName, json },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to read report" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
