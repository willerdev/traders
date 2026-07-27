import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin JSON-RPC proxy for Polygon Amoy.
 * Browser → /api/blockchain/rpc → public Amoy RPC (avoids CORS / flaky DNS).
 */
const RPC_FALLBACKS = [
  process.env.POLYGON_AMOY_RPC,
  process.env.NEXT_PUBLIC_RPC_URL,
  "https://polygon-amoy-bor-rpc.publicnode.com",
  "https://polygon-amoy.drpc.org",
  "https://rpc-amoy.polygon.technology/",
].filter(Boolean) as string[];

export async function POST(req: NextRequest) {
  const body = await req.arrayBuffer();
  let lastError = "All Amoy RPC endpoints failed";

  for (const url of RPC_FALLBACKS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) {
        lastError = `${url} → HTTP ${res.status}`;
        continue;
      }
      return new NextResponse(text, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32000, message: lastError }, id: null },
    { status: 502 },
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    network: "polygon-amoy",
    chainId: 80002,
    upstreams: RPC_FALLBACKS,
  });
}
