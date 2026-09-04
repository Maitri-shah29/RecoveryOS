import { prisma } from "@/lib/db/prisma";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { PageHeader } from "@/components/page-header";
import { BatchImporter, PlanBatchButton } from "@/components/batch-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
export const dynamic = "force-dynamic";
export default async function BatchesPage() {
  let batches: Awaited<ReturnType<typeof prisma.batch.findMany>> = [];
  let error: string | null = null;
  try { batches = await prisma.batch.findMany({ where: { merchantId: SYNTHETIC_MERCHANT_ID }, orderBy: { createdAt: "desc" } }); } catch { error = "PostgreSQL is unavailable. Start it and apply the migrations before importing or planning batches."; }
  return <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8"><PageHeader eyebrow="Operations" title="Batches" description="Import validated JSON or CSV cases, then freeze planner output behind the deterministic policy engine." badge="No bulk monetary execution" />{error ? <Alert className="border-amber-400/30"><AlertTitle>Database unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}<Card><CardHeader><CardTitle>Import a versioned batch</CardTitle></CardHeader><CardContent><BatchImporter /></CardContent></Card><Card><CardHeader><CardTitle>Imported batches</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Dataset</TableHead><TableHead>Mode</TableHead><TableHead>Cases</TableHead><TableHead>State</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{batches.map((batch) => <TableRow key={batch.id}><TableCell><div className="font-medium">{batch.datasetVersion}</div><div className="font-mono text-xs text-muted-foreground">{batch.datasetChecksum.slice(0, 16)}…</div></TableCell><TableCell><Badge variant={batch.mode === "BENCHMARK" ? "info" : "warning"}>{batch.mode}</Badge></TableCell><TableCell>{batch.caseCount}</TableCell><TableCell>{batch.state}</TableCell><TableCell className="text-right"><PlanBatchButton batchId={batch.id} disabled={batch.state !== "IMPORTED"} /></TableCell></TableRow>)}</TableBody></Table>{batches.length === 0 && !error ? <p className="py-8 text-center text-sm text-muted-foreground">No batches imported.</p> : null}</CardContent></Card></main>;
}
