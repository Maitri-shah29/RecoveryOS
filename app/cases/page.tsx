import Link from "next/link";
import type { ActionType, OperatingMode, Prisma, RecoveryState } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const states = ["ALL", "DETECTED", "ACTION_SCHEDULED", "AWAITING_APPROVAL", "RECOVERED", "POLICY_BLOCKED", "ESCALATED"] as const;
const modes = ["ALL", "BENCHMARK", "RAZORPAY_PROOF"] as const;
const diagnoses = ["ALL", "TRANSIENT", "INSUFFICIENT_FUNDS", "AUTHENTICATION_INCOMPLETE", "ABANDONED", "METHOD_UNAVAILABLE", "ALREADY_PAID", "RISK_BLOCKED", "UNKNOWN"] as const;
const actions = ["ALL", "NO_ACTION", "REMINDER", "RETRY_INVITATION", "FRESH_CHECKOUT_LINK", "ASSISTED_REVIEW"] as const;
const confidenceRanges = {
  ALL: undefined,
  LOW: { lt: 0.65 },
  MEDIUM: { gte: 0.65, lt: 0.85 },
  HIGH: { gte: 0.85 },
} as const;

type CaseFilters = {
  state?: string;
  mode?: string;
  diagnosis?: string;
  action?: string;
  confidence?: keyof typeof confidenceRanges;
  escalated?: string;
};

function selectedOrAll<T extends readonly string[]>(value: string | undefined, allowed: T): T[number] {
  return allowed.includes(value as T[number]) ? value as T[number] : "ALL" as T[number];
}

export default async function CasesPage({ searchParams }: { searchParams: Promise<CaseFilters> }) {
  const params = await searchParams;
  const state = selectedOrAll(params.state, states);
  const mode = selectedOrAll(params.mode, modes);
  const diagnosis = selectedOrAll(params.diagnosis, diagnoses);
  const action = selectedOrAll(params.action, actions);
  const confidence = params.confidence && params.confidence in confidenceRanges ? params.confidence : "ALL";
  const escalated = params.escalated === "true" ? "true" : params.escalated === "false" ? "false" : "ALL";
  const planFilter: Prisma.RecoveryPlanWhereInput = {
    ...(diagnosis !== "ALL" ? { diagnosis } : {}),
    ...(action !== "ALL" ? { proposedAction: action as ActionType } : {}),
    ...(confidence !== "ALL" ? { confidence: confidenceRanges[confidence] } : {}),
  };
  const where: Prisma.RecoveryCaseWhereInput = {
    merchantId: SYNTHETIC_MERCHANT_ID,
    ...(state !== "ALL" ? { recoveryState: state as RecoveryState } : {}),
    ...(mode !== "ALL" ? { mode: mode as OperatingMode } : {}),
    ...(Object.keys(planFilter).length ? { plans: { some: planFilter } } : {}),
    ...(escalated === "true" ? { escalations: { some: { state: "OPEN" } } } : {}),
    ...(escalated === "false" ? { escalations: { none: { state: "OPEN" } } } : {}),
  };
  let items: Prisma.RecoveryCaseGetPayload<{ include: { plans: true; escalations: true } }>[] = [];
  let error: string | null = null;
  try {
    items = await prisma.recoveryCase.findMany({
      where,
      orderBy: [{ mode: "desc" }, { externalCaseId: "asc" }],
      take: 100,
      include: {
        plans: { orderBy: { createdAt: "desc" }, take: 1 },
        escalations: { where: { state: "OPEN" } },
      },
    });
  } catch {
    error = "PostgreSQL is unavailable. The frozen benchmark dashboard remains available, but the operational queue needs the database.";
  }
  return <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Operations" title="Recovery queue" description="Inspect payment truth and recovery workflow state independently. Monetary proof actions cannot be bulk-approved." badge={`${items.length} shown`} />
    <Card><CardContent className="pt-5"><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" method="get">
      <FilterSelect label="State" name="state" value={state} options={states} />
      <FilterSelect label="Mode" name="mode" value={mode} options={modes} />
      <FilterSelect label="Diagnosis" name="diagnosis" value={diagnosis} options={diagnoses} />
      <FilterSelect label="Action" name="action" value={action} options={actions} />
      <FilterSelect label="Confidence" name="confidence" value={confidence} options={Object.keys(confidenceRanges)} />
      <FilterSelect label="Escalation" name="escalated" value={escalated} options={["ALL", "true", "false"]} />
      <div className="flex gap-2 sm:col-span-2 lg:col-span-6"><Button type="submit">Apply filters</Button><Link className="inline-flex h-9 items-center rounded-md border px-4 text-sm hover:bg-accent" href="/cases">Reset</Link></div>
    </form></CardContent></Card>
    {error ? <Alert className="border-amber-400/30"><AlertTitle>Database unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : <Card><CardContent className="pt-1"><Table><TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Mode</TableHead><TableHead>Failure</TableHead><TableHead>Diagnosis</TableHead><TableHead>Action</TableHead><TableHead>Confidence</TableHead><TableHead>Payment</TableHead><TableHead>Recovery</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => {
      const plan = item.plans[0];
      return <TableRow key={item.id}><TableCell><Link className="font-mono text-xs text-primary hover:underline" href={`/cases/${item.id}`}>{item.externalCaseId}</Link><div className="text-xs text-muted-foreground">₹{(item.amountPaise / 100).toLocaleString("en-IN")}</div></TableCell><TableCell><Badge variant={item.mode === "BENCHMARK" ? "info" : "warning"}>{item.mode}</Badge></TableCell><TableCell>{item.failureCode.replaceAll("_", " ")}</TableCell><TableCell>{plan?.diagnosis.replaceAll("_", " ") ?? "—"}</TableCell><TableCell>{plan?.proposedAction.replaceAll("_", " ") ?? "—"}</TableCell><TableCell className="font-mono">{plan ? Number(plan.confidence).toFixed(3) : "—"}</TableCell><TableCell>{item.paymentState}</TableCell><TableCell><div className="flex items-center gap-2"><Badge variant={item.recoveryState === "RECOVERED" ? "success" : item.recoveryState === "ESCALATED" ? "warning" : "outline"}>{item.recoveryState}</Badge>{item.escalations.length ? <span title="Open escalation" className="size-2 rounded-full bg-amber-400" /> : null}</div></TableCell></TableRow>;
    })}</TableBody></Table></CardContent></Card>}
  </main>;
}

function FilterSelect({ label, name, value, options }: { label: string; name: string; value: string; options: readonly string[] }) {
  const id = `filter-${name}`;
  return <div className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor={id}>{label}</label><select id={id} className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground" name={name} defaultValue={value}>{options.map((option) => <option key={option} value={option}>{option === "true" ? "OPEN" : option === "false" ? "NONE" : option.replaceAll("_", " ")}</option>)}</select></div>;
}
