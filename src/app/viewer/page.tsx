// FILE: src/app/viewer/page.tsx
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useSearchParams } from "next/navigation";

export default function ViewerPage() {
  const sp = useSearchParams();
  const objectName = sp.get("objectName") || "";

  const [url, setUrl] = useState<string>("");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      setErr("");
      setUrl("");
      if (!objectName) return;

      const res = await fetch(`/api/files/signed-read?objectName=${encodeURIComponent(objectName)}`);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setErr(data?.error || "Failed to load file");
        return;
      }
      setUrl(data.url);
    })();
  }, [objectName]);

  return (
    <AppShell title="Viewer">
      <div className="space-y-4">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Object</div>
          <div className="mt-1 font-mono text-xs text-gray-800 break-all">{objectName || "-"}</div>

          {err && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {err}
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          {!objectName ? (
            <div className="text-sm text-gray-600">No file selected.</div>
          ) : !url ? (
            <div className="text-sm text-gray-600">Loading preview...</div>
          ) : (
            <iframe className="h-[75vh] w-full rounded-xl border" src={url} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
