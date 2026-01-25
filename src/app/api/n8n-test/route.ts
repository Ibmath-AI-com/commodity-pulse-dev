import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const payload = await req.json();

  const res = await fetch(process.env.N8N_WEBHOOK_TEST_TEXT_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "text/plain";

  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": contentType },
  });
}
