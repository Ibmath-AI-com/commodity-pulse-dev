export async function callN8n<T>(url: string, payload: unknown, timeoutMs = 120000): Promise<T> {
  if (!url) throw new Error("Missing n8n webhook URL");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_SHARED_SECRET ? { "x-shared-secret": process.env.N8N_SHARED_SECRET } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`n8n ${res.status}: ${text || res.statusText}`);

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  } finally {
    clearTimeout(timer);
  }
}
