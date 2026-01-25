import { NextResponse } from "next/server";
import { adminDb, admin } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    const ref = await adminDb.collection("predictions").add({
      uid: "server-test",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      note: "admin write works",
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
