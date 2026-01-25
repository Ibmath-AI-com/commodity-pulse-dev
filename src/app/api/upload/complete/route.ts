// FILE: src/app/api/upload/complete/route.ts
import { NextResponse } from "next/server";
import { headObject } from "@/lib/gcs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const objectName = String(body.objectName ?? "").trim();

    if (!objectName) {
      return NextResponse.json({ ok: false, error: "Missing objectName" }, { status: 400 });
    }

    const info = await headObject({ objectName });

    if (!info.exists) {
      return NextResponse.json(
        { ok: false, error: "Upload not found in bucket yet (object does not exist)." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, file: info });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Complete failed" },
      { status: 500 }
    );
  }
}
