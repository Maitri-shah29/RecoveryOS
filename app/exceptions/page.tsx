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
  try {
    exceptions = await prisma.escalation.findMany({
      where: { recoveryCase: { merchantId: SYNTHETIC_MERCHANT_ID }, state: "OPEN" },
      include: { recoveryCase: true },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    unavailable = true;
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Safety" title="Unresolved exceptions" description="Escalated cases are honest unresolved work. No further customer contact occurs while an exception remains open." badge={`${exceptions.length} open`} />
      {unavailable ? (
        <Alert><AlertTitle>Database unavailable</AlertTitle><AlertDescription>Start PostgreSQL to load the exception queue.</AlertDescription></Alert>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Reason</TableHead><TableHead>Amount</TableHead><TableHead>Attempts</TableHead><TableHead>Suggested next safe step</TableHead><TableHead>State</TableHead></TableRow></TableHeader>
              <TableBody>
                {exceptions.map((exception) => {
                  const context = jsonRecord(exception.context);
                  const attempted = Array.isArray(context.actions_already_attempted) ? context.actions_already_attempted.length : 0;
                  return (
                    <TableRow key={exception.id}>
                      <TableCell><Link href={`/cases/${exception.caseId}`} className="font-mono text-xs text-primary hover:underline">{exception.recoveryCase.externalCaseId}</Link><p className="mt-1 text-xs text-muted-foreground">{exception.recoveryCase.mode} · {exception.recoveryCase.datasetSplit ?? "proof"}</p></TableCell>
                      <TableCell className="max-w-52 break-words">{exception.reasonCode}</TableCell>
                      <TableCell>₹{(exception.recoveryCase.amountPaise / 100).toLocaleString("en-IN")}</TableCell>
                      <TableCell>{attempted}</TableCell>
                      <TableCell className="max-w-md text-sm text-muted-foreground">{stringValue(context.suggested_next_safe_step, "Review the case timeline and record an operator disposition.")}</TableCell>
                      <TableCell><Badge variant="warning">{exception.state}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {exceptions.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No open exceptions.</p> : null}
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
