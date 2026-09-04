import Link from "next/link";
import type { RecoveryState } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
export const dynamic = "force-dynamic";
const states = ["ALL", "DETECTED", "ACTION_SCHEDULED", "AWAITING_APPROVAL", "RECOVERED", "POLICY_BLOCKED", "ESCALATED"] as const;
export default async function CasesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const selected = (await searchParams).state ?? "ALL";
  let items: Awaited<ReturnType<typeof prisma.recoveryCase.findMany>> = [];
  let error: string | null = null;
  try { items = await prisma.recoveryCase.findMany({ where: { merchantId: SYNTHETIC_MERCHANT_ID, ...(selected !== "ALL" ? { recoveryState: selected as RecoveryState } : {}) }, orderBy: [{ mode: "desc" }, { externalCaseId: "asc" }], take: 100 }); } catch { error = "PostgreSQL is unavailable. The frozen benchmark dashboard remains available, but the operational queue needs the database."; }
  return <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8"><PageHeader eyebrow="Operations" title="Recovery queue" description="Inspect payment truth and recovery workflow state independently. Monetary proof actions cannot be bulk-approved." badge={`${items.length} shown`} /><div className="flex flex-wrap gap-2">{states.map((state) => <Link key={state} href={state === "ALL" ? "/cases" : `/cases?state=${state}`} className={`rounded-md border px-3 py-1.5 text-xs ${selected === state ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{state.replaceAll("_", " ")}</Link>)}</div>{error ? <Alert className="border-amber-400/30"><AlertTitle>Database unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : <Card><CardContent className="pt-1"><Table><TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Mode</TableHead><TableHead>Failure</TableHead><TableHead>Amount</TableHead><TableHead>Payment</TableHead><TableHead>Recovery</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell><Link className="font-mono text-xs text-primary hover:underline" href={`/cases/${item.id}`}>{item.externalCaseId}</Link><div className="text-xs text-muted-foreground">{item.orderId}</div></TableCell><TableCell><Badge variant={item.mode === "BENCHMARK" ? "info" : "warning"}>{item.mode}</Badge></TableCell><TableCell>{item.failureCode.replaceAll("_", " ")}</TableCell><TableCell className="font-mono">₹{(item.amountPaise / 100).toLocaleString("en-IN")}</TableCell><TableCell>{item.paymentState}</TableCell><TableCell><Badge variant={item.recoveryState === "RECOVERED" ? "success" : item.recoveryState === "ESCALATED" ? "warning" : "outline"}>{item.recoveryState}</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}</main>;
}
