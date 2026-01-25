// FILE: src/app/api/upload/read-url/route.ts
import { NextResponse } from "next/server";
import { getSignedReadUrl } from "@/lib/gcs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const objectName = (url.searchParams.get("objectName") ?? "").trim();
    if (!objectName) {
      return NextResponse.json({ ok: false, error: "objectName is required" }, { status: 400 });
    }

    const signedUrl = await getSignedReadUrl({ objectName, expiresMinutes: 10 });

    return NextResponse.json(
      { ok: true, signedUrl },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed" }, { status: 500 });
  }
}
