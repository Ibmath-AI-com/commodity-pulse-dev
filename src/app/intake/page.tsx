// FILE: src/app/intake/page.tsx
"use client";

import { useMemo, useState } from "react";

type InitResp =
  | {
      ok: true;
      bucket: string;
      objectName: string;
      uploadUrl: string;
      expiresMinutes: number;
    }
  | { ok: false; error: string };

type CompleteResp =
  | { ok: true; file: { bucket: string; objectName: string; size?: string; updated?: string } }
  | { ok: false; error: string };

export default function IntakePage() {
  const [commodity, setCommodity] = useState("sulphur");
  const [kind, setKind] = useState<"doc" | "price">("doc");
  const [file, setFile] = useState<File | null>(null);

  const [status, setStatus] = useState<
    "idle" | "init" | "uploading" | "verifying" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const filename = useMemo(() => file?.name ?? "", [file]);

  async function handleUpload() {
    if (!file) return;

    setStatus("init");
    setMessage("");

    // 1) init: get signed url
    const initRes = await fetch("/api/upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commodity,
        kind,
        filename: file.name,
        contentType: file.type || (kind === "doc" ? "application/pdf" : "application/octet-stream"),
      }),
    });

    const initData = (await initRes.json()) as InitResp;

    if (!initRes.ok || !initData.ok) {
      setStatus("error");
      setMessage(initData.ok ? "Init failed" : initData.error);
      return;
    }

    // 2) upload to GCS using signed URL (PUT)
    setStatus("uploading");

    const putRes = await fetch(initData.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!putRes.ok) {
      setStatus("error");
      setMessage(`GCS upload failed (HTTP ${putRes.status}).`);
      return;
    }

    // 3) complete: verify exists
    setStatus("verifying");

    const completeRes = await fetch("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectName: initData.objectName }),
    });

    const completeData = (await completeRes.json()) as CompleteResp;

    if (!completeRes.ok || !completeData.ok) {
      setStatus("error");
      setMessage(completeData.ok ? "Complete failed" : completeData.error);
      return;
    }

    setStatus("done");
    setMessage(`Uploaded: gs://${completeData.file.bucket}/${completeData.file.objectName}`);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, Arial", maxWidth: 900 }}>
      <h1 style={{ marginBottom: 8 }}>Intake</h1>
      <p style={{ marginTop: 0, marginBottom: 18 }}>
        Upload PDFs (docs) or Excel/CSV (prices) to GCS using a signed URL.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Commodity</span>
          <input
            value={commodity}
            onChange={(e) => setCommodity(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "doc" | "price")}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          >
            <option value="doc">doc (PDF)</option>
            <option value="price">price (Excel/CSV)</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span>Select file</span>
          <input
            type="file"
            accept={kind === "doc" ? "application/pdf" : undefined}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, color: "#444" }}>Selected</div>
        <code
          style={{
            display: "block",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #eee",
            background: "#fafafa",
            marginTop: 6,
            overflowX: "auto",
          }}
        >
          {filename || "(no file selected)"}
        </code>
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || status === "init" || status === "uploading" || status === "verifying"}
        style={{
          marginTop: 14,
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #ddd",
          cursor:
            !file || status === "init" || status === "uploading" || status === "verifying"
              ? "not-allowed"
              : "pointer",
        }}
      >
        {status === "uploading"
          ? "Uploading..."
          : status === "init"
          ? "Preparing..."
          : status === "verifying"
          ? "Verifying..."
          : "Upload"}
      </button>

      {message && (
        <p style={{ marginTop: 14, whiteSpace: "pre-wrap" }}>
          <strong>Status:</strong>{" "}
          <span style={{ color: status === "error" ? "crimson" : "green" }}>{message}</span>
        </p>
      )}
    </main>
  );
}
