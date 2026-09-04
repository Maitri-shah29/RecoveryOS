import { NextResponse } from "next/server";
import { processRazorpayWebhook } from "@/lib/services/webhooks";
import { apiErrorResponse } from "@/lib/http/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const result = await processRazorpayWebhook(rawBody, request.headers.get("x-razorpay-signature") ?? "", request.headers.get("x-razorpay-event-id"));
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) { return apiErrorResponse(error); }
}
