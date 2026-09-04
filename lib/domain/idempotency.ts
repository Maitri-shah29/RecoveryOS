import { createHash } from "node:crypto";
import type { RecoveryActionType } from "./schemas";

export function actionIdempotencyKey(merchantId: string, caseId: string, action: RecoveryActionType, attemptNumber: number): string {
  const input = `${merchantId}|${caseId}|${action}|${attemptNumber}`;
  return `act_${createHash("sha256").update(input).digest("hex")}`;
}
