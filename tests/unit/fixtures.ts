import type { BenchmarkCase } from "@/lib/domain/schemas";

export function benchmarkCase(overrides: Partial<BenchmarkCase> = {}): BenchmarkCase {
  return {
    case_id: "case_999",
    customer_id: "customer_test",
    order_id: "order_test",
    razorpay_payment_id: null,
    amount_paise: 25_000,
    currency: "INR",
    failure_code: "TRANSIENT",
    failure_description: "synthetic test failure",
    payment_method: "UPI",
    attempted_at: "2026-01-15T16:00:00.000Z",
    customer_segment: "RETURNING",
    prior_attempts: 0,
    recovery_contacts_7d: 0,
    consent_status: "OPTED_IN",
    risk_flag: "CLEAR",
    preferred_channel: "IN_APP",
    customer_timezone: "Asia/Kolkata",
    simulation_profile_id: "profile_test",
    order_paid: false,
    action_in_flight: false,
    required_data_complete: true,
    split: "development",
    ...overrides,
  };
}
