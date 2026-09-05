"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const modifiableActions = ["REMINDER", "RETRY_INVITATION", "FRESH_CHECKOUT_LINK"] as const;
const permittedDelays = [0, 30, 120, 720, 1440] as const;

export function CaseControls({ caseId, batchId, mode, state, proposedAction, delayMinutes }: { caseId: string; batchId: string | null; mode: string; state: string; proposedAction?: string; delayMinutes?: number }) {
  const router = useRouter();
  const [reason, setReason] = useState("Operator review");
  const [action, setAction] = useState<(typeof modifiableActions)[number]>(modifiableActions.includes(proposedAction as never) ? proposedAction as (typeof modifiableActions)[number] : "FRESH_CHECKOUT_LINK");
  const [delay, setDelay] = useState<(typeof permittedDelays)[number]>(permittedDelays.includes(delayMinutes as never) ? delayMinutes as (typeof permittedDelays)[number] : 0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canEscalate = ["ANALYZING", "AWAITING_APPROVAL", "ACTION_SENT", "EXHAUSTED", "ESCALATED"].includes(state);
  const canStop = !["INELIGIBLE_STOPPED", "POLICY_BLOCKED", "ACTION_REJECTED", "RECOVERED", "EXPIRED", "MANUALLY_STOPPED"].includes(state);
  async function mutate(path: string, body?: unknown) {
    setBusy(true); setMessage("");
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    setMessage(response.ok ? `Completed: ${result.recovery_state ?? result.state ?? "ok"}` : result.error ?? "Request failed");
    setBusy(false); if (response.ok) router.refresh();
  }
  return <div className="space-y-3">{state === "AWAITING_APPROVAL" ? <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]"><label className="space-y-1 text-xs text-muted-foreground">Modified action<select aria-label="Modified action" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={action} onChange={(event) => setAction(event.target.value as typeof action)}>{modifiableActions.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label className="space-y-1 text-xs text-muted-foreground">Delay<select aria-label="Modified delay" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={delay} onChange={(event) => setDelay(Number(event.target.value) as typeof delay)}>{permittedDelays.map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label><Button className="self-end" variant="outline" disabled={busy} onClick={() => mutate(`/api/cases/${caseId}/modify`, { action, delay_minutes: delay, reason })}>Modify frozen plan</Button></div> : null}<div className="flex flex-wrap gap-2">{mode === "BENCHMARK" ? <Button disabled={busy} onClick={() => mutate(`/api/cases/${caseId}/proof`)}>Select for proof mode</Button> : null}{mode === "RAZORPAY_PROOF" && state === "DETECTED" && batchId ? <Button disabled={busy} onClick={() => mutate(`/api/batches/${batchId}/plan`)}>Plan proof case</Button> : null}{state === "AWAITING_APPROVAL" ? <><Button disabled={busy} onClick={() => mutate(`/api/cases/${caseId}/approve`)}>Approve action</Button><Button variant="outline" disabled={busy} onClick={() => mutate(`/api/cases/${caseId}/reject`, { reason })}>Reject</Button></> : null}{canEscalate ? <Button variant="outline" disabled={busy} onClick={() => mutate(`/api/cases/${caseId}/escalate`, { reason })}>Escalate</Button> : null}{canStop ? <Button variant="destructive" disabled={busy} onClick={() => mutate(`/api/cases/${caseId}/stop`, { reason })}>Stop</Button> : null}</div><Input aria-label="Operator reason" value={reason} onChange={(event) => setReason(event.target.value)} />{message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}</div>;
}
