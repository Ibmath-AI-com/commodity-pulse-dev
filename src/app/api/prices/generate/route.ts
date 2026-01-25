// FILE: src/app/api/prices/generate/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

type Body = { commodity?: string; sourceObjectName?: string; region?: string; futureDate?: string };

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} env var`);
  return v;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const commodity = String(body?.commodity ?? "").trim().toLowerCase();
    const sourceObjectName = String(body?.sourceObjectName ?? "").trim();

    // Optional (only if your n8n expects them)
    const region = String(body?.region ?? "").trim();
    const futureDate = String(body?.futureDate ?? "").trim();

    if (!commodity || !sourceObjectName) {
      return NextResponse.json(
        { ok: false, error: "commodity and sourceObjectName are required" },
        { status: 400 }
      );
    }

    // New webhook/env for prices generation
    const baseWebhookUrl = requiredEnv("N8N_WEBHOOK_GENERATING_PRICES_URL");
    const token = requiredEnv("N8N_WEBHOOK_TOKEN");

    const url = new URL(baseWebhookUrl);
    url.searchParams.set("token", token);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-n8n-token": token,
      },
      body: JSON.stringify({
        commodity,
        sourceObjectName,
        ...(region ? { region } : {}),
        ...(futureDate ? { futureDate } : {}),
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `n8n webhook failed (${res.status})`, details: text },
        { status: 502 }
      );
    }

    // n8n might return empty or text; handle both
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: true, queued: true, raw: text.slice(0, 500) },
        { status: 200 }
      );
    }

    const data = await res.json().catch(() => null);
    if (data == null) {
      return NextResponse.json(
        { ok: false, error: "n8n returned non-JSON response" },
        { status: 502 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
