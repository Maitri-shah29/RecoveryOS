import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
export const dynamic = "force-dynamic";
export default async function ExceptionsPage() {
  let exceptions: Prisma.EscalationGetPayload<{ include: { recoveryCase: true } }>[] = [];
  let unavailable = false;
  try { exceptions = await prisma.escalation.findMany({ where: { recoveryCase: { merchantId: SYNTHETIC_MERCHANT_ID }, state: "OPEN" }, include: { recoveryCase: true }, orderBy: { createdAt: "desc" } }); } catch { unavailable = true; }
  return <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8"><PageHeader eyebrow="Safety" title="Unresolved exceptions" description="Escalated cases are honest unresolved work. No further customer contact occurs while an exception remains open." badge={`${exceptions.length} open`} />{unavailable ? <Alert><AlertTitle>Database unavailable</AlertTitle><AlertDescription>Start PostgreSQL to load the exception queue.</AlertDescription></Alert> : <Card><CardContent><Table><TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Reason</TableHead><TableHead>Amount</TableHead><TableHead>Mode</TableHead><TableHead>State</TableHead></TableRow></TableHeader><TableBody>{exceptions.map((exception) => <TableRow key={exception.id}><TableCell><Link href={`/cases/${exception.caseId}`} className="font-mono text-xs text-primary hover:underline">{exception.recoveryCase.externalCaseId}</Link></TableCell><TableCell>{exception.reasonCode}</TableCell><TableCell>₹{(exception.recoveryCase.amountPaise / 100).toLocaleString("en-IN")}</TableCell><TableCell>{exception.recoveryCase.mode}</TableCell><TableCell><Badge variant="warning">{exception.state}</Badge></TableCell></TableRow>)}</TableBody></Table>{exceptions.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No open exceptions.</p> : null}</CardContent></Card>}</main>;
}
