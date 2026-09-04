import type { RecoveryCase } from "@prisma/client";
import type { BenchmarkCase } from "./schemas";

export function recoveryCaseToPlannerInput(item: RecoveryCase): BenchmarkCase {
  return {
    case_id: item.externalCaseId,
    customer_id: item.customerId,
    order_id: item.orderId,
    razorpay_payment_id: null,
    amount_paise: item.amountPaise,
    currency: "INR",
    failure_code: item.failureCode as BenchmarkCase["failure_code"],
    failure_description: item.failureDescription,
    payment_method: item.paymentMethod as BenchmarkCase["payment_method"],
    attempted_at: item.attemptedAt.toISOString(),
    customer_segment: item.customerSegment as BenchmarkCase["customer_segment"],
    prior_attempts: item.priorAttempts,
    recovery_contacts_7d: item.recoveryContacts7d,
    consent_status: item.consentStatus as BenchmarkCase["consent_status"],
    risk_flag: item.riskFlag as BenchmarkCase["risk_flag"],
    preferred_channel: item.preferredChannel as BenchmarkCase["preferred_channel"],
    customer_timezone: item.customerTimezone,
    simulation_profile_id: item.simulationProfileId ?? "not_available_in_proof_mode",
    order_paid: item.paymentState === "PAID" || item.paymentState === "CAPTURED",
    action_in_flight: false,
    required_data_complete: true,
    split: (item.datasetSplit ?? "development") as BenchmarkCase["split"],
  };
}
