import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    orderId: "ORD-20260430-1842",
    provider: "sample-card-gateway",
    authorizationId: "AUTH-9f42-safe",
    at: new Date().toISOString(),
  });
}
