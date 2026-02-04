// FILE: src/app/api/reports/list/route.ts
import { NextResponse } from "next/server";
import { getStorage, getBucketName } from "@/lib/gcs";

export const runtime = "nodejs";

type Source = "incoming" | "archive";

type ReportListItem = {
  id: string;
  createdAt: string; // ISO
  commodity: string;
  region: string; // "-" if none
  fileName: string;

  source: Source;
  active: boolean;

  objectName: string;      // incoming/... or archive/...
  cleanObjectName: string; // clean/.../<base>.json
  hasClean: boolean;
  generatedBy: string;     // "system" or email
};

function fileNameOnly(p: string) {
  return p.replace(/[\\]/g, "/").split("/").pop() || p;
}

function baseNoExt(p: string) {
  const f = fileNameOnly(p);
  return f.replace(/\.[^/.]+$/, "");
}

// Expected layouts:
// incoming/<commodity>/doc/<file>
// incoming/<commodity>/doc/<region>/<file>
// (same for archive)
function parseRegion(objectName: string) {
  const parts = objectName.split("/").filter(Boolean);
  // parts[0]=incoming|archive, [1]=commodity, [2]=doc
  if (parts.length >= 5) return parts[3]; // region folder
  return "-";
}

function buildCleanObjectName(objectName: string) {
  const parts = objectName.split("/").filter(Boolean);
  const source = parts[0]; // incoming|archive
  const commodity = parts[1] || "unknown";
  const kind = parts[2] || "doc";

  // keep any subfolders under doc/ (e.g., region/)
  const underKind = parts.slice(3); // [region?, filename]
  const filename = underKind[underKind.length - 1] || "file";
  const folder = underKind.slice(0, -1); // region? etc

  const base = filename.replace(/\.[^/.]+$/, "");
  const cleanFile = `${base}.json`;

  // clean/<commodity>/<kind>/<...folders>/<base>.json
  return ["clean", commodity, kind, ...folder, cleanFile].join("/");
}

export async function GET() {
  try {
    const storage = getStorage();
    const bucket = storage.bucket(getBucketName());

    const [incoming] = await bucket.getFiles({ prefix: "incoming/", autoPaginate: true, maxResults: 2000 });
    const [archive] = await bucket.getFiles({ prefix: "archive/", autoPaginate: true, maxResults: 2000 });
    const [clean] = await bucket.getFiles({ prefix: "clean/", autoPaginate: true, maxResults: 5000 });

    const cleanSet = new Set<string>(
      clean
        .map((f) => f.name || "")
        .filter((n) => n.includes("/doc/") && n.toLowerCase().endsWith(".json"))
    );

    const all = [...incoming, ...archive]
      .map((f) => f.name || "")
      .filter((n) => n.includes("/doc/") && !n.endsWith("/"));

    const items: ReportListItem[] = all.map((objectName) => {
      const source: Source = objectName.startsWith("incoming/") ? "incoming" : "archive";
      const active = source === "incoming";

      const parts = objectName.split("/").filter(Boolean);
      const commodity = parts[1] || "unknown";

      const cleanObjectName = buildCleanObjectName(objectName);
      const hasClean = cleanSet.has(cleanObjectName);

      const meta =
        (source === "incoming" ? incoming : archive).find((x) => x.name === objectName)?.metadata ?? {};

      const createdAt =
        (meta?.updated as string) ||
        (meta?.timeCreated as string) ||
        new Date().toISOString();

      // Try to get generatedBy from custom metadata, default to "system"
      const generatedBy = (meta?.metadata as any)?.generatedBy || "system";

      return {
        id: `${source}:${commodity}:${fileNameOnly(objectName)}`,
        createdAt,
        commodity,
        region: parseRegion(objectName),
        fileName: fileNameOnly(objectName),
        source,
        active,
        objectName,
        cleanObjectName,
        hasClean,
        generatedBy,
      };
    });

    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return NextResponse.json(
      { ok: true, items },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to list reports" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
