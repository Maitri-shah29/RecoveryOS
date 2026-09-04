import type { PaymentState, RecoveryState } from "@/lib/domain/state-machines";

export type ReconciliationState = { payment: PaymentState; recovery: RecoveryState; processedEventIds: string[]; attributedPaymentIds: string[] };
export type SimulatedWebhook = { eventId: string; eventType: "payment.authorized" | "payment.captured"; paymentId: string; signatureValid: boolean; apiStatus: "authorized" | "captured" };

export function reconcileSimulatedWebhook(state: ReconciliationState, event: SimulatedWebhook): ReconciliationState {
  if (!event.signatureValid || state.processedEventIds.includes(event.eventId)) return state;
  const processedEventIds = [...state.processedEventIds, event.eventId];
  if (state.payment === "CAPTURED" || state.payment === "PAID") return { ...state, processedEventIds };
  if (event.eventType === "payment.captured" && event.apiStatus === "captured") {
    const attributedPaymentIds = state.attributedPaymentIds.includes(event.paymentId) ? state.attributedPaymentIds : [...state.attributedPaymentIds, event.paymentId];
    return { payment: "CAPTURED", recovery: "RECOVERED", processedEventIds, attributedPaymentIds };
  }
  if (event.eventType === "payment.authorized" && event.apiStatus === "authorized") return { ...state, payment: "AUTHORIZED", processedEventIds };
  return { ...state, processedEventIds };
}
