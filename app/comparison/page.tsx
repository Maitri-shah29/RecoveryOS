import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BenchmarkReport } from "@/lib/benchmark/evaluator";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

async function comparisonData() {
  const report = JSON.parse(await readFile(path.join(process.cwd(), "reports", "heldout-v1.0.0.json"), "utf8")) as BenchmarkReport;
  const recovery = report.policies.find((item) => item.policy === "RECOVERY_OS");
  if (!recovery) throw new Error("RecoveryOS result is missing.");
  return recovery;
}

export default async function ComparisonPage() {
  const recovery = await comparisonData();
  return <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Benchmark evidence" title="Recovery by failure category" description="Published aggregates from only the selected RecoveryOS action and delay on the frozen held-out batch. Evaluator-only fixtures are never loaded by this page." badge="Recovered — simulation" />
    <Card><CardHeader><CardTitle>Category breakdown</CardTitle><CardDescription>Projected probability never counts as recovered revenue.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Failure category</TableHead><TableHead>Cases</TableHead><TableHead>Recovered</TableHead><TableHead>Gross recovery</TableHead></TableRow></TableHeader><TableBody>{recovery.recovery_by_failure.map((row) => <TableRow key={row.failure_code}><TableCell><Badge variant="outline">{row.failure_code}</Badge></TableCell><TableCell>{row.cases}</TableCell><TableCell>{row.recovered_cases}</TableCell><TableCell className="font-mono">₹{(row.gross_recovered_paise / 100).toLocaleString("en-IN")}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    <Card><CardHeader><CardTitle>Recovery by action</CardTitle><CardDescription>Gross, declared intervention cost, and net result for each chosen action.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Cases</TableHead><TableHead>Recovered</TableHead><TableHead>Gross</TableHead><TableHead>Cost</TableHead><TableHead>Net</TableHead></TableRow></TableHeader><TableBody>{recovery.recovery_by_action.map((row) => <TableRow key={row.action}><TableCell><Badge variant="outline">{row.action}</Badge></TableCell><TableCell>{row.cases}</TableCell><TableCell>{row.recovered_cases}</TableCell><TableCell className="font-mono">₹{(row.gross_recovered_paise / 100).toLocaleString("en-IN")}</TableCell><TableCell className="font-mono">₹{(row.assumed_cost_paise / 100).toLocaleString("en-IN")}</TableCell><TableCell className="font-mono">₹{(row.net_recovered_paise / 100).toLocaleString("en-IN")}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
  </main>;
}
