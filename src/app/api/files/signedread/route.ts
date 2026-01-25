// FILE: src/app/api/files/signed-read/route.ts
import { NextResponse } from "next/server";
import { getSignedReadUrl } from "@/lib/gcs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const objectName = (url.searchParams.get("objectName") ?? "").trim();
    if (!objectName) {
      return NextResponse.json({ ok: false, error: "Missing objectName" }, { status: 400 });
    }

    const signed = await getSignedReadUrl({ objectName, expiresMinutes: 15 });
    return NextResponse.json({ ok: true, url: signed }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Signed URL failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
