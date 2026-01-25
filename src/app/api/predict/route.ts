// FILE: src/app/api/predict/route.ts
import { NextResponse } from "next/server";
import { adminAuth, adminDb, admin } from "@/lib/firebaseAdmin";

/**
 * UI may send dashed basis keys (e.g., "middle-east").
 * Normalize basis keys by removing dashes between words (=> "middle east").
 */

function normalizeBasisKey(basisKeyRaw: unknown) {
  return String(basisKeyRaw ?? "")
    .trim()
    .toLowerCase()
    .replace(/-+/g, " ")
    .replace(/\s+/g, " ");
}

function basisLabelFromKey(basisKeyRaw: string) {
  const k = normalizeBasisKey(basisKeyRaw);

  switch (k) {
    case "middle east":
      return "Middle East";
    case "us gulf":
      return "US Gulf";
    case "black sea":
      return "Black Sea";
    case "baltic sea":
      return "Baltic Sea";
    case "mediterranean":
      return "Mediterranean";
    case "vancouver":
      return "Vancouver";
    case "iran":
      return "Iran";
    default:
      return k;
  }
}

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} env var`);
  return v;
}

function asStringArray(x: unknown): string[] {
  if (Array.isArray(x)) return x.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (typeof x === "string") {
    const s = x.trim();
    return s ? [s] : [];
  }
  return [];
}

function toFiniteNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function postToN8n(webhookUrl: string, token: string, payload: any) {
  const url = new URL(webhookUrl);
  url.searchParams.set("token", token);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-n8n-token": token,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    return { ok: false as const, status: res.status, details: text };
  }

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return { ok: false as const, status: 502, details: "n8n returned non-JSON response" };
  }

  return { ok: true as const, data };
}

/** Expect: Authorization: Bearer <Firebase ID Token> */
async function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const m = authHeader.match(/^Bearer (.+)$/);
  if (!m) return { ok: false as const, status: 401, error: "Missing Authorization Bearer token" };

  try {
    const decoded = await adminAuth.verifyIdToken(m[1]);
    return { ok: true as const, uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return { ok: false as const, status: 401, error: "Invalid or expired token" };
  }
}

// Firestore doc id safe
function safeIdPart(s: string) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[\/#?[\]]/g, "_");
}

function isIsoDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  // 1) Verify user
  const u = await requireUser(req);
  if (!u.ok) {
    return NextResponse.json({ ok: false, error: u.error }, { status: u.status });
  }

  // 2) Parse body
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // We’ll compute docId as soon as we have commodity/futureDate.
  let predictionId: string | null = null;

  try {
    const commodity = String(body?.commodity ?? "").trim().toLowerCase();
    const futureDate = String(body?.futureDate ?? "").trim(); // "YYYY-MM-DD"

    // Client may send basis[] OR basisKeys[]
    const basisKeysRaw =
      asStringArray(body?.basisKeys).length > 0
        ? asStringArray(body?.basisKeys)
        : asStringArray(body?.basisKey ?? body?.basis);

    // Keep dashed keys for UI identity (but we send normalized to n8n)
    const basisKeys = basisKeysRaw.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 2);

    // Labels: allow client-provided labels, else derive
    const basisLabelsFromClient = asStringArray(body?.basisLabels);
    const basisLabels =
      basisLabelsFromClient.length === basisKeys.length && basisLabelsFromClient.length > 0
        ? basisLabelsFromClient
        : basisKeys.map((k) => basisLabelFromKey(k));

    if (!commodity || !futureDate || basisKeys.length === 0) {
      return NextResponse.json(
        { ok: false, error: "commodity, basisKeys (or basisKey/basis), and futureDate are required" },
        { status: 400 }
      );
    }
    if (!isIsoDate(futureDate)) {
      return NextResponse.json({ ok: false, error: "futureDate must be YYYY-MM-DD" }, { status: 400 });
    }

    // ✅ Overwrite key: same USER + same commodity + same date => overwrite same doc
    predictionId = safeIdPart(`${u.uid}__${commodity}__${futureDate}`);

    // basePrices aligned with basisKeys order
    let basePrices: Array<number | null> = [];
    if (Array.isArray(body?.basePrices)) {
      basePrices = body.basePrices.map((v: any) => toFiniteNumberOrNull(v));
    } else if (body?.basePrice != null) {
      basePrices = [toFiniteNumberOrNull(body.basePrice)];
    }
    basePrices = (basePrices ?? []).slice(0, basisKeys.length);
    while (basePrices.length < basisKeys.length) basePrices.push(null);

    const baseWebhookUrl = requiredEnv("N8N_WEBHOOK_FORECASTING_URL");
    const token = requiredEnv("N8N_WEBHOOK_TOKEN");

    const basisKeysNormalized = basisKeys.map(normalizeBasisKey);

    // ✅ ONE payload to n8n (multi-region semantics)
    const n8nPayload: any = {
      commodity,
      futureDate,
      basisKeys: basisKeysNormalized,
      basisLabels,
      basePrices,
      uid: u.uid, // useful inside n8n if you want
    };

    // Backward compatibility with older nodes
    n8nPayload.basisKey = basisKeysNormalized[0];
    n8nPayload.basis = basisLabels[0];
    if (basePrices[0] != null) n8nPayload.basePrice = basePrices[0];

    // 3) Call n8n
    const out = await postToN8n(baseWebhookUrl, token, n8nPayload);

    // 4) Save history (OVERWRITE instead of add)
    const ref = adminDb.collection("predictions").doc(predictionId);

    const nowTs = admin.firestore.FieldValue.serverTimestamp();

    const baseDoc = {
      uid: u.uid,
      email: u.email,
      runtimeMs: Date.now() - startedAt,

      commodity,
      futureDate,
      basisKeys, // keep original (may include dashes)
      basisKeysNormalized,
      basisLabels,
      basePrices,

      // raw request and response for traceability
      request: body,
      n8nPayload,

      status: out.ok ? "success" : "error",
      n8nHttpStatus: out.ok ? 200 : out.status,
      outputs: out.ok ? out.data : null,
      error: out.ok ? null : { message: `n8n webhook failed (${out.status})`, details: out.details },

      // timestamps
      updatedAt: nowTs,
    };

    // Preserve createdAt on overwrite (keep first createdAt)
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const createdAt =
        snap.exists && snap.get("createdAt")
          ? snap.get("createdAt")
          : admin.firestore.FieldValue.serverTimestamp();

      tx.set(
        ref,
        {
          ...baseDoc,
          createdAt,
        },
        { merge: true }
      );
    });

    if (!out.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `n8n webhook failed (${out.status})`,
          details: out.details,
          predictionId,
        },
        { status: 502 }
      );
    }

    // Return raw workflow output (single result) + deterministic id
    return NextResponse.json({ ...out.data, predictionId }, { status: 200 });
  } catch (e: any) {
    // Save server error too (overwrite if we have predictionId; else fallback add)
    try {
      const nowTs = admin.firestore.FieldValue.serverTimestamp();

      if (predictionId) {
        const ref = adminDb.collection("predictions").doc(predictionId);

        await adminDb.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const createdAt =
            snap.exists && snap.get("createdAt")
              ? snap.get("createdAt")
              : admin.firestore.FieldValue.serverTimestamp();

          tx.set(
            ref,
            {
              uid: u.uid,
              email: u.email,
              createdAt,
              updatedAt: nowTs,
              runtimeMs: Date.now() - startedAt,
              status: "error",
              error: { message: e?.message ?? "Unknown server error" },
              request: body,
            },
            { merge: true }
          );
        });
      } else {
        await adminDb.collection("predictions").add({
          uid: u.uid,
          email: u.email,
          createdAt: nowTs,
          runtimeMs: Date.now() - startedAt,
          status: "error",
          error: { message: e?.message ?? "Unknown server error" },
          request: body,
        });
      }
    } catch {
      // ignore logging errors
    }

    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown server error" }, { status: 500 });
  }
}
