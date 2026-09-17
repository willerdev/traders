import { NextRequest, NextResponse } from "next/server";

function backendOrigin(): string {
  const raw =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:4001";
  return raw.replace(/\/$/, "").replace(/\/api\/v1$/i, "");
}

function originHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function proxyRequest(req: NextRequest, path: string[]) {
  const origin = backendOrigin();
  const incomingHost = (
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    req.nextUrl.hostname
  )
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");

  if (originHost(origin) && originHost(origin) === incomingHost) {
    return NextResponse.json(
      {
        message:
          "API_URL is set to this website (solo-web), which causes a loop. Set API_URL to the solo-api URL from Render (the backend service), with no /api/v1.",
      },
      { status: 500 },
    );
  }

  const target = `${origin}/api/v1/${path.join("/")}${req.nextUrl.search}`;

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
          "Backend API unreachable. Set API_URL on solo-web to your solo-api origin (https://….onrender.com).",
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
