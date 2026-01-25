// FILE: src/app/api/upload/list/route.ts
import { NextResponse } from "next/server";
import { listObjects, objectExists } from "@/lib/gcs";

export const runtime = "nodejs";

type SourceKind = "doc" | "rdata";

function stripExt(filename: string) {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}

function isExcelLike(name: string) {
  const n = (name || "").toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const commodity = (url.searchParams.get("commodity") ?? "sulphur").trim().toLowerCase();
    const region = (url.searchParams.get("region") ?? "global").trim().toLowerCase();

    const kinds: SourceKind[] = ["doc", "rdata"];

    // List both folders in parallel (keep your current folder layout unchanged)
    const listed = await Promise.all(
      kinds.map(async (kind) => {
        const prefix = `incoming/${commodity}/${kind}/`;
        const { bucket, items } = await listObjects({ prefix, maxResults: 300 });

        // Remove folder placeholders
        const fileItems = items.filter((it) => !it.name.endsWith("/"));

        // Enrich with report existence + prices existence
        const enriched = await Promise.all(
          fileItems.map(async (it) => {
            const filename = it.name.split("/").pop() || "";
            const base = stripExt(filename);

            // Existing report mapping (keep as-is)
            const reportObjectName = `clean/${commodity}/${kind}/${base}.json`;
            const reportExists = await objectExists({ objectName: reportObjectName });

            // New prices mapping (Excel/CSV only)
            const pricesObjectName = `clean/${commodity}/${kind}/${commodity}_prices.json`;
            const pricesExists = isExcelLike(filename)
              ? await objectExists({ objectName: pricesObjectName })
              : false;

            return {
              ...it,
              kind, // keep for the UI so you know where it came from

              reportExists,
              reportObjectName,

              pricesExists,
              pricesObjectName,
            };
          })
        );

        return { bucket, prefix, items: enriched };
      })
    );

    // Usually bucket is same for both calls; take the first
    const bucket = listed[0]?.bucket ?? undefined;

    // Merge items (optionally sort by name)
    const mergedItems = listed
      .flatMap((x) => x.items)
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    return NextResponse.json(
      {
        ok: true,
        bucket,
        commodity,
        region,
        prefixes: listed.map((x) => x.prefix),
        items: mergedItems,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "List failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
