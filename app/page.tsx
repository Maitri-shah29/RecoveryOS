import { readFile } from "node:fs/promises";
import path from "node:path";
import { ArrowUpRight, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import type { BenchmarkReport, PolicyMetrics } from "@/lib/benchmark/evaluator";
import { RecoveryCurve, ResultsChart } from "@/components/results-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProofEvidenceCard } from "@/components/proof-evidence-card";

async function getReport(): Promise<BenchmarkReport> {
  const file = await readFile(path.join(process.cwd(), "reports", "heldout-v1.0.0.json"), "utf8");
  return JSON.parse(file) as BenchmarkReport;
}

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const policyLabels: Record<PolicyMetrics["policy"], string> = {
  NO_INTERVENTION: "No intervention",
  REMINDER_EVERYONE: "Reminder everyone",
  FIXED_RULE: "Fixed rule · 30 min",
  RECOVERY_OS: "RecoveryOS",
};

function rupees(paise: number) {
  return money.format(paise / 100);
}

export default async function Home() {
  const report = await getReport();
  const recovery = report.policies.find((metric) => metric.policy === "RECOVERY_OS");
  if (!recovery) throw new Error("RecoveryOS policy result is missing");
  const chartData = report.policies.map((metric) => ({ name: policyLabels[metric.policy].replace(" · 30 min", ""), gross: metric.gross_recovered_paise / 100, net: metric.net_recovered_paise / 100 }));
  const checksPassed = report.identical_dataset_checksum_for_all_policies && report.all_cases_accounted_for && report.policies.every((metric) => metric.unauthorized_contacts === 0);
  const contactRate = recovery.contacts / report.heldout_case_count;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col justify-between gap-5 border-b pb-7 sm:flex-row sm:items-end">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 rounded-full bg-primary shadow-[0_0_16px_var(--primary)]" aria-hidden="true" />
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">RecoveryOS / foundation</span>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Held-out recovery benchmark</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Four policies. One frozen 100-case batch. Deterministic outcomes and visible cost assumptions.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success"><CheckCircle2 className="mr-1 size-3" /> Reproducible</Badge>
          <Badge variant="outline">Benchmark mode</Badge>
          <Badge variant="secondary">v1.0.0</Badge>
        </div>
      </header>

      <section aria-label="RecoveryOS summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Revenue at risk" value={rupees(recovery.revenue_at_risk_paise)} detail={`${report.heldout_case_count} frozen cases`} icon={<Database className="size-4" />} />
        <MetricCard label="Net recovered · simulated" value={rupees(recovery.net_recovered_paise)} detail={`${recovery.recovered_cases} recovered cases`} icon={<ArrowUpRight className="size-4" />} />
        <MetricCard label="Incremental vs fixed rule" value={rupees(recovery.incremental_net_vs_fixed_paise)} detail="After illustrative costs" icon={<ArrowUpRight className="size-4" />} accent />
        <MetricCard label="Safety gates" value={checksPassed ? "Passed" : "Needs review"} detail={`${recovery.unauthorized_contacts} unauthorized contacts`} icon={<ShieldCheck className="size-4" />} />
        <MetricCard label="Contact rate" value={`${(contactRate * 100).toFixed(0)}%`} detail={`${recovery.contacts} / ${report.heldout_case_count} cases`} icon={<ArrowUpRight className="size-4" />} />
        <MetricCard label="Unresolved" value={String(recovery.unresolved_cases)} detail={`${recovery.escalations} escalations`} icon={<ShieldCheck className="size-4" />} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Gross and net recovery</CardTitle>
            <CardDescription>Recovered — simulation. Net values subtract the declared 1× intervention-cost assumption.</CardDescription>
          </CardHeader>
          <CardContent><ResultsChart data={chartData} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Run integrity</CardTitle>
            <CardDescription>Evidence binding every policy to the same held-out input.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <IntegrityRow label="Cases accounted for" value={`${report.heldout_case_count} / ${report.heldout_case_count}`} />
            <IntegrityRow label="Policy version" value={report.policy_version} mono />
            <IntegrityRow label="Dataset version" value={report.dataset_version} mono />
            <div className="space-y-2">
              <span className="text-muted-foreground">Held-out SHA-256</span>
              <p className="break-all rounded-md bg-muted/60 p-3 font-mono text-xs leading-5">{report.dataset_checksum}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader><CardTitle>Recovery curve over time</CardTitle><CardDescription>Cumulative gross simulated RecoveryOS recovery across the frozen 48-hour evaluation window.</CardDescription></CardHeader>
        <CardContent><RecoveryCurve data={recovery.recovery_curve} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Four-policy comparison</CardTitle>
          <CardDescription>{report.cost_assumption_label}. Costs: no action ₹0, reminder/retry ₹1, fresh link ₹2, assisted review ₹50.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Policy</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Net</TableHead><TableHead className="text-right">Contacts</TableHead><TableHead className="text-right">Blocked</TableHead><TableHead className="text-right">Exceptions</TableHead><TableHead className="text-right">Violations</TableHead></TableRow></TableHeader>
            <TableBody>
              {report.policies.map((metric) => (
                <TableRow key={metric.policy} className={metric.policy === "RECOVERY_OS" ? "bg-primary/[0.04]" : undefined}>
                  <TableCell className="font-medium">{policyLabels[metric.policy]} {metric.policy === "RECOVERY_OS" ? <Badge className="ml-2" variant="success">Policy</Badge> : null}</TableCell>
                  <TableCell className="text-right font-mono">{rupees(metric.gross_recovered_paise)}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{rupees(metric.assumed_cost_paise)}</TableCell>
                  <TableCell className="text-right font-mono">{rupees(metric.net_recovered_paise)}</TableCell>
                  <TableCell className="text-right font-mono">{metric.contacts}</TableCell>
                  <TableCell className="text-right font-mono">{metric.blocked_cases}</TableCell>
                  <TableCell className="text-right font-mono">{metric.unresolved_cases}</TableCell>
                  <TableCell className="text-right font-mono">{metric.unauthorized_contacts + metric.duplicate_external_actions + metric.successful_payment_double_attributions}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="gap-4 py-5">
          <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">Benchmark evidence</CardTitle><Badge variant="success">Active</Badge></div></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Virtual clock, simulated inbox, frozen potential outcomes. This mode makes no Razorpay or messaging network calls.</CardContent>
        </Card>
        <ProofEvidenceCard />
      </section>

      <footer className="flex flex-col justify-between gap-2 border-t py-5 text-xs text-muted-foreground sm:flex-row">
        <span>Controlled benchmark evidence, not production uplift.</span>
        <span className="font-mono">Seed {report.seed_id.slice(0, 23)}…</span>
      </footer>
    </main>
  );
}

function MetricCard({ label, value, detail, icon, accent = false }: { label: string; value: string; detail: string; icon: React.ReactNode; accent?: boolean }) {
  return <Card className={accent ? "border-primary/30" : undefined}><CardHeader className="flex-row items-center justify-between"><CardDescription>{label}</CardDescription><span className={accent ? "text-primary" : "text-muted-foreground"}>{icon}</span></CardHeader><CardContent><div className="text-2xl font-semibold tracking-tight">{value}</div><p className="mt-2 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

function IntegrityRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-center justify-between gap-4 border-b pb-4"><span className="text-muted-foreground">{label}</span><span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span></div>;
}
