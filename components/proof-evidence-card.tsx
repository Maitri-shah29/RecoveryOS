"use client";

import Link from "next/link";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProofSummary = {
  proof_mode_enabled: boolean;
  reason: string | null;
  recovered_paise: number;
  payment_count: number;
  latest_case_id: string | null;
};

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

async function fetchSummary(url: string): Promise<ProofSummary> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Proof summary is unavailable.");
  return response.json() as Promise<ProofSummary>;
}

export function ProofEvidenceCard() {
  const { data, error, isLoading } = useSWR("/api/proof/summary", fetchSummary, {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
    onErrorRetry: (_error, _key, _config, revalidate, { retryCount }) => {
      if (retryCount < 2) setTimeout(() => revalidate({ retryCount }), 2_000);
    },
  });
  const badge = isLoading ? "Checking" : error ? "Unavailable" : data?.proof_mode_enabled ? "Test mode ready" : "Not configured";

  return (
    <Card className="gap-4 py-5">
      <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">Razorpay proof evidence</CardTitle><Badge variant={data?.proof_mode_enabled ? "warning" : "outline"}>{badge}</Badge></div></CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {isLoading ? <p role="status">Loading isolated proof evidence…</p> : null}
        {error ? <p role="status">Proof evidence is temporarily unavailable. Benchmark results are unaffected.</p> : null}
        {data ? (
          <>
            <p><span className="font-mono text-foreground">{money.format(data.recovered_paise / 100)} test mode</span> · {data.payment_count} API-verified {data.payment_count === 1 ? "payment" : "payments"}. This value is never combined with simulated recovery.{data.reason ? ` ${data.reason}` : ""}</p>
            {data.latest_case_id ? <Link className="inline-flex text-primary underline" href={`/cases/${data.latest_case_id}`}>Open verified proof case</Link> : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
