import { NextResponse } from "next/server";

import {
  resolveGatewayRuntimeConfig,
  toPublicGatewayRuntimeConfig,
} from "@/lib/gateway-runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    toPublicGatewayRuntimeConfig(resolveGatewayRuntimeConfig()),
  );
}
