"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Result = {
  passed: boolean;
  evidence_scope: string;
  checks: { name: string; expected: string; actual: string; passed: boolean }[];
};

export function FailureLabRunner() {
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setMessage("");
    try {
      const response = await fetch("/api/failure-lab/run", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() } });
      const body = await response.json().catch(() => null) as Result | { error?: string } | null;
      if (!response.ok || !body || !("checks" in body)) {
        setResult(null);
        setMessage(body && "error" in body ? body.error ?? "Failure lab request failed." : "Failure lab request failed.");
        return;
      }
      setResult(body);
      setMessage(body.passed ? `Passed ${body.checks.length}/${body.checks.length} checks.` : "One or more invariants need review.");
    } catch {
      setResult(null);
      setMessage("The failure lab could not reach the application API.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={running}>{running ? "Injecting fixtures…" : "Run safe failure fixtures"}</Button>
        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
      {result ? (
        <>
          <p className="text-xs text-muted-foreground">Evidence scope: {result.evidence_scope}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {result.checks.map((check) => (
              <Card key={check.name} className="gap-3 py-4">
                <CardContent className="flex gap-3">
                  {check.passed ? <CheckCircle2 aria-label="Passed" className="size-5 shrink-0 text-emerald-300" /> : <XCircle aria-label="Failed" className="size-5 shrink-0 text-red-300" />}
                  <div><h2 className="font-medium">{check.name.replaceAll("_", " ")}</h2><p className="mt-1 text-xs text-muted-foreground">Expected: {check.expected}</p><p className="text-xs text-muted-foreground">Actual: {check.actual}</p></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
