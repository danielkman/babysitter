import { NextRequest, NextResponse } from "next/server";

import {
  buildGatewayTargetUrl,
  normalizeGatewayUrl,
  resolveGatewayRuntimeConfig,
} from "@/lib/gateway-runtime-config";

export const dynamic = "force-dynamic";

const FORWARDED_HEADERS = [
  "accept",
  "content-type",
  "authorization",
  "if-none-match",
  "if-match",
  "if-modified-since",
  "if-unmodified-since",
  "cache-control",
  "x-kanban-gateway-url",
] as const;

async function proxyGatewayRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
) {
  const resolved = await params;
  const runtimeConfig = resolveGatewayRuntimeConfig();
  const overrideGatewayUrl = normalizeGatewayUrl(
    request.headers.get("x-kanban-gateway-url"),
  );
  const gatewayBaseUrl = overrideGatewayUrl ?? runtimeConfig.proxyGatewayUrl;
  const targetUrl = buildGatewayTargetUrl(
    gatewayBaseUrl,
    `/${resolved.path.join("/")}`,
    request.nextUrl.search,
  );

  const headers = new Headers();
  for (const header of FORWARDED_HEADERS) {
    if (header === "x-kanban-gateway-url") {
      continue;
    }
    const value = request.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }

  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.text(),
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  const contentType = upstreamResponse.headers.get("content-type");
  if (contentType) {
    responseHeaders.set("content-type", contentType);
  }
  const cacheControl = upstreamResponse.headers.get("cache-control");
  if (cacheControl) {
    responseHeaders.set("cache-control", cacheControl);
  }

  return new NextResponse(await upstreamResponse.arrayBuffer(), {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return await proxyGatewayRequest(request, context.params);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return await proxyGatewayRequest(request, context.params);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return await proxyGatewayRequest(request, context.params);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return await proxyGatewayRequest(request, context.params);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return await proxyGatewayRequest(request, context.params);
}
