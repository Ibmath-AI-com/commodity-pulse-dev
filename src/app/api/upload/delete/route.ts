// FILE: src/app/api/upload/delete/route.ts
import { NextResponse } from "next/server";
import { getStorage, getBucketName } from "@/lib/gcs";

export const runtime = "nodejs";

type DeleteResp =
  | { ok: true; deleted: string[] }
  | { ok: false; error: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      objectNames?: unknown;
      objectName?: unknown;
    };

    // Support either { objectName: "..." } or { objectNames: ["...", "..."] }
    const listRaw =
      Array.isArray(body.objectNames) ? body.objectNames : body.objectName ? [body.objectName] : [];

    const objectNames = listRaw
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);

    if (!objectNames.length) {
      const out: DeleteResp = { ok: false, error: "Missing objectName(s)." };
      return NextResponse.json(out, { status: 400 });
    }

    const storage = getStorage();
    const bucket = storage.bucket(getBucketName());

    const deleted: string[] = [];
    for (const name of objectNames) {
      // ignoreNotFound avoids throwing if it was already deleted
      await bucket.file(name).delete({ ignoreNotFound: true });
      deleted.push(name);
    }

    const out: DeleteResp = { ok: true, deleted };
    return NextResponse.json(out);
  } catch (e: any) {
    const out: DeleteResp = { ok: false, error: e?.message ? String(e.message) : "Delete failed" };
    return NextResponse.json(out, { status: 500 });
  }
}
