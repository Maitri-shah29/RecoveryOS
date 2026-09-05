import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { verifyAuditChain, type AuditEvent } from "@/lib/audit/chain";
import { PageHeader } from "@/components/page-header";
import { CaseControls } from "@/components/case-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { aiRecommendationSchema } from "@/lib/domain/schemas";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.recoveryCase.findFirst({
    where: { id, merchantId: SYNTHETIC_MERCHANT_ID },
    include: {
      paymentAttempts: { orderBy: { attemptNumber: "asc" } },
      plans: { orderBy: { createdAt: "desc" } },
      actions: { orderBy: { createdAt: "desc" }, include: { inboxMessage: true } },
      escalations: { orderBy: { createdAt: "desc" } },
      auditEvents: { orderBy: { sequenceNumber: "asc" } },
      webhookEvents: { orderBy: { receivedAt: "desc" } },
      attributions: true,
    },
  });
  if (!item) notFound();
  const events: AuditEvent[] = item.auditEvents.map((event) => ({
    event_id: event.id,
    case_id: event.caseId,
    sequence_number: event.sequenceNumber,
    timestamp: event.timestamp.toISOString(),
    actor_type: event.actorType,
    actor_id: event.actorId,
    event_type: event.eventType,
    input_refs: event.inputRefs as string[],
    decision: event.decision,
    reason_codes: event.reasonCodes,
    policy_snapshot: event.policySnapshot,
    model_metadata: event.modelMetadata ?? null,
    previous_hash: event.previousHash,
    event_hash: event.eventHash,
  }));
  const audit = verifyAuditChain(events);
  const latestPlan = item.plans[0];
  const diagnosisEvent = item.auditEvents.findLast((event) => event.eventType === "DIAGNOSIS");
  const parsedRecommendation = aiRecommendationSchema.safeParse(diagnosisEvent?.decision);
  const recommendation = parsedRecommendation.success ? parsedRecommendation.data : null;
  const modelMetadata = jsonRecord(diagnosisEvent?.modelMetadata);
  const latestEscalation = item.escalations[0];
  const escalationContext = jsonRecord(latestEscalation?.context);
  const formatTime = (value: Date) => `${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "medium", timeZone: item.customerTimezone }).format(value)} (${item.customerTimezone})`;

  return <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
    <PageHeader eyebrow={`Case / ${item.mode}`} title={item.externalCaseId} description={`${item.orderId} · ${item.failureDescription}`} badge={`${item.paymentState} / ${item.recoveryState}`} />
    <section className="grid gap-4 md:grid-cols-3"><Info label="Amount at risk" value={`₹${(item.amountPaise / 100).toLocaleString("en-IN")}`} /><Info label="Consent / risk" value={`${item.consentStatus} / ${item.riskFlag}`} /><Info label="Audit chain" value={audit.valid ? `Verified · ${events.length} events` : `Invalid at ${audit.invalidSequence}`} /></section>

    <Card><CardHeader><CardTitle>Operator controls</CardTitle><CardDescription>Every mutation is idempotent and appends audit evidence in the same database transaction. Proof actions require explicit approval.</CardDescription></CardHeader><CardContent><CaseControls caseId={item.id} batchId={item.batchId} mode={item.mode} state={item.recoveryState} proposedAction={latestPlan?.proposedAction} delayMinutes={latestPlan?.delayMinutes} /></CardContent></Card>

    <section className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Original payment evidence</CardTitle><CardDescription>Payment truth and recovery workflow state remain independent.</CardDescription></CardHeader><CardContent className="space-y-4 text-sm"><div className="grid gap-3 sm:grid-cols-2"><Row label="Payment method" value={item.paymentMethod} /><Row label="Failure code" value={item.failureCode} /><Row label="Attempted" value={formatTime(item.attemptedAt)} /><Row label="Stored UTC" value={item.attemptedAt.toISOString()} /></div><Table><TableHeader><TableRow><TableHead>Attempt</TableHead><TableHead>Provider payment</TableHead><TableHead>State</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader><TableBody>{item.paymentAttempts.map((attempt) => <TableRow key={attempt.id}><TableCell>#{attempt.attemptNumber}</TableCell><TableCell className="font-mono text-xs">{attempt.providerPaymentId ?? "not assigned"}</TableCell><TableCell>{attempt.state}</TableCell><TableCell className="font-mono">₹{(attempt.amountPaise / 100).toLocaleString("en-IN")}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      <Card><CardHeader><CardTitle>Latest frozen plan</CardTitle><CardDescription>{item.plans.length} immutable plan version{item.plans.length === 1 ? "" : "s"} retained.</CardDescription></CardHeader><CardContent>{latestPlan ? <div className="space-y-3 text-sm"><div className="flex items-center justify-between"><span className="text-muted-foreground">Planner</span><Badge variant={latestPlan.plannerType === "openai" ? "info" : "outline"}>{latestPlan.plannerType}</Badge></div><Row label="Diagnosis" value={latestPlan.diagnosis} /><Row label="Confidence" value={Number(latestPlan.confidence).toFixed(3)} /><Row label="Action" value={latestPlan.proposedAction} /><Row label="Delay" value={`${latestPlan.delayMinutes} minutes`} /><Row label="Frozen" value={latestPlan.frozenAt ? formatTime(latestPlan.frozenAt) : "Not frozen"} /><pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs">{JSON.stringify(latestPlan.policyDecision, null, 2)}</pre></div> : <p className="text-sm text-muted-foreground">No plan has been created.</p>}</CardContent></Card>
    </section>

    <Card>
      <CardHeader>
        <CardTitle>Planner recommendation evidence</CardTitle>
        <CardDescription>The model is advisory. This closed-schema recommendation was independently checked by the deterministic policy engine before any action.</CardDescription>
      </CardHeader>
      <CardContent>
        {recommendation ? (
          <div className="grid gap-5 text-sm lg:grid-cols-[1fr_1.4fr]">
            <div className="space-y-3">
              <Row label="Expected recovery" value={`${Math.round(recommendation.expected_recovery_probability * 100)}%`} />
              <Row label="Human review requested" value={recommendation.requires_human_review ? "Yes" : "No"} />
              <Row label="Model" value={stringValue(modelMetadata.model, "deterministic fallback")} />
              <Row label="Planner version" value={stringValue(modelMetadata.planner_version, latestPlan?.plannerVersion ?? "not available")} />
              <Row label="Prompt version" value={stringValue(modelMetadata.prompt_version)} />
              <Row label="Schema version" value={stringValue(modelMetadata.schema_version)} />
            </div>
            <div className="space-y-4">
              <div><p className="text-muted-foreground">Customer-safe explanation</p><p className="mt-2 rounded-md bg-muted/50 p-3 leading-6">{recommendation.customer_message || "No customer message proposed for this action."}</p></div>
              <div><p className="text-muted-foreground">Reason codes</p><div className="mt-2 flex flex-wrap gap-2">{recommendation.reason_codes.map((reason) => <Badge key={reason} variant="outline">{reason}</Badge>)}</div></div>
              {modelMetadata.fallback_reason ? <p className="text-xs text-muted-foreground">Fallback reason: {stringValue(modelMetadata.fallback_reason)}</p> : null}
            </div>
          </div>
        ) : <p className="text-sm text-muted-foreground">No planner recommendation was required or recorded for this ineligible case.</p>}
      </CardContent>
    </Card>

    <section className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Actions and simulated inbox</CardTitle></CardHeader><CardContent className="space-y-3">{item.actions.length ? item.actions.map((action) => <div key={action.id} className="rounded-md border p-3 text-sm"><div className="flex justify-between"><strong>{action.type}</strong><Badge variant="outline">{action.state}</Badge></div><p className="mt-2 text-xs text-muted-foreground">Created {formatTime(action.createdAt)}</p>{action.externalUrl ? <a className="mt-2 block break-all text-primary underline" href={action.externalUrl} target="_blank" rel="noreferrer">Open Razorpay test checkout</a> : null}{action.inboxMessage ? <p className="mt-2 text-muted-foreground">Inbox: {action.inboxMessage.body}</p> : null}</div>) : <p className="text-sm text-muted-foreground">No actions created.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Webhook and attribution evidence</CardTitle><CardDescription>A browser callback never marks a case recovered.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm">{item.webhookEvents.length ? item.webhookEvents.map((event) => <div key={event.id} className="rounded-md border p-3"><div className="flex justify-between gap-3"><strong>{event.eventType}</strong><Badge variant={event.signatureValid ? "success" : "warning"}>{event.signatureValid ? "signature valid" : "rejected"}</Badge></div><p className="mt-2 text-xs text-muted-foreground">Received {event.receivedAt.toISOString()} UTC · {event.processedAt ? "processed" : "pending"}</p></div>) : <p className="text-muted-foreground">No Razorpay webhook evidence.</p>}{item.attributions.map((attribution) => <div key={attribution.id} className="rounded-md border border-primary/30 p-3"><strong>API-verified attribution</strong><p className="mt-1 font-mono text-xs">{attribution.razorpayPaymentId} · ₹{(attribution.amountPaise / 100).toLocaleString("en-IN")}</p></div>)}</CardContent></Card>
    </section>

    {latestEscalation ? (
      <Card>
        <CardHeader><CardTitle>Exception review evidence</CardTitle><CardDescription>Customer contact remains stopped until an operator records an explicit disposition.</CardDescription></CardHeader>
        <CardContent className="grid gap-5 text-sm lg:grid-cols-2">
          <div className="space-y-3">
            <Row label="Reason" value={latestEscalation.reasonCode} />
            <Row label="State" value={latestEscalation.state} />
            <Row label="Opened" value={formatTime(latestEscalation.createdAt)} />
            <Row label="Resolution" value={latestEscalation.resolution ?? "Awaiting operator disposition"} />
          </div>
          <div><p className="text-muted-foreground">Suggested next safe step</p><p className="mt-2 rounded-md bg-muted/50 p-3 leading-6">{stringValue(escalationContext.suggested_next_safe_step, "Review payment truth, policy gates, and prior actions before disposition.")}</p></div>
        </CardContent>
      </Card>
    ) : null}

    <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>Immutable audit timeline</CardTitle><a className="text-sm text-primary underline" href={`/api/audit/${item.id}/export`}>Export JSON</a></div></CardHeader><CardContent className="space-y-3">{item.auditEvents.map((event) => <div key={event.id} className="grid gap-1 border-l-2 border-primary/30 pl-4 text-sm sm:grid-cols-[4rem_11rem_1fr_15rem]"><span className="font-mono text-xs text-muted-foreground">#{event.sequenceNumber}</span><span className="font-medium">{event.eventType}</span><span className="text-muted-foreground">{event.reasonCodes.join(", ")}</span><span className="text-xs text-muted-foreground">{formatTime(event.timestamp)}</span></div>)}</CardContent></Card>
  </main>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-medium">{value}</p></CardContent></Card>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = "not applicable"): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
