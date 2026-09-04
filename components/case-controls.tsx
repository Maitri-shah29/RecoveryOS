"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CaseControls({ caseId, batchId, mode, state }: { caseId: string; batchId: string | null; mode: string; state: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("Operator review");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function mutate(path: string, body?: unknown) {
    setBusy(true); setMessage("");
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    setMessage(response.ok ? `Completed: ${result.recovery_state ?? result.state ?? "ok"}` : result.error ?? "Request failed");
    setBusy(false); if (response.ok) router.refresh();
  }
  return <div className="space-y-3"><div className="flex flex-wrap gap-2">{mode === "BENCHMARK" ? <Button disabled={busy} onClick={() => mutate(`/api/cases/${caseId}/proof`)}>Select for proof mode</Button> : null}{mode === "RAZORPAY_PROOF" && state === "DETECTED" && batchId ? <Button disabled={busy} onClick={() => mutate(`/api/batches/${batchId}/plan`)}>Plan proof case</Button> : null}{state === "AWAITING_APPROVAL" ? <><Button disabled={busy} onClick={() => mutate(`/api/cases/${caseId}/approve`)}>Approve action</Button><Button variant="outline" disabled={busy} onClick={() => mutate(`/api/cases/${caseId}/reject`, { reason })}>Reject</Button></> : null}<Button variant="outline" disabled={busy} onClick={() => mutate(`/api/cases/${caseId}/escalate`, { reason })}>Escalate</Button><Button variant="destructive" disabled={busy} onClick={() => mutate(`/api/cases/${caseId}/stop`, { reason })}>Stop</Button></div><Input aria-label="Operator reason" value={reason} onChange={(event) => setReason(event.target.value)} />{message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}</div>;
}
