import { NextRequest, NextResponse } from "next/server";

function backendOrigin(): string {
  const raw =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") ||
    "http://localhost:4000";
  return raw.replace(/\/$/, "");
}

async function proxyRequest(req: NextRequest, path: string[]) {
  const target = `${backendOrigin()}/api/v1/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "content-length") {
      return;
    }
    headers.set(key, value);
  });

  const clientIp =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  headers.set("x-forwarded-for", clientIp);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
    });
  } catch {
    return NextResponse.json(
      {
        message:
          "Backend API unreachable. Set API_URL to your backend (e.g. https://traders-c53s.onrender.com).",
      },
      { status: 502 },
    );
  }

  const body = await res.arrayBuffer();

  const responseHeaders = new Headers();
  res.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    // Do not forward length/encoding — fetch decompresses bodies; wrong
    // Content-Length truncates JSON (breaks login with parse error ~517).
    if (
      lower === "transfer-encoding" ||
      lower === "content-length" ||
      lower === "content-encoding"
    ) {
      return;
    }
    responseHeaders.set(key, value);
  });

  return new NextResponse(body, {
    status: res.status,
    headers: responseHeaders,
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function handler(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(req, path);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
