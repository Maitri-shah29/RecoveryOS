"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Feedback = { kind: "idle" | "loading" | "success" | "error"; message: string };

export function BatchImporter() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle", message: "" });
  async function upload() {
    if (!file) return;
    setFeedback({ kind: "loading", message: "Validating and importing…" });
    const response = await fetch("/api/batches/import", { method: "POST", headers: { "content-type": file.type.includes("csv") ? "text/csv" : "application/json", "x-dataset-version": `manual-${file.name}`, "x-recovery-mode": "BENCHMARK", "idempotency-key": crypto.randomUUID() }, body: await file.text() });
    const body = await response.json();
    setFeedback(response.ok ? { kind: "success", message: `Imported ${body.accepted} cases.` } : { kind: "error", message: body.error ?? "Import failed." });
    if (response.ok) router.refresh();
  }
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Input aria-label="Dataset file" type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><Button onClick={upload} disabled={!file || feedback.kind === "loading"}>Import batch</Button>{feedback.message ? <span className={feedback.kind === "error" ? "text-sm text-red-300" : "text-sm text-muted-foreground"}>{feedback.message}</span> : null}</div>;
}

export function PlanBatchButton({ batchId, disabled }: { batchId: string; disabled: boolean }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle", message: "" });
  async function plan() {
    setFeedback({ kind: "loading", message: "Planning…" });
    const response = await fetch(`/api/batches/${batchId}/plan`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() } });
    const body = await response.json();
    setFeedback(response.ok ? { kind: "success", message: `${body.planned} planned` } : { kind: "error", message: body.error ?? "Planning failed" });
    if (response.ok) router.refresh();
  }
  return <div className="flex items-center justify-end gap-2"><Button size="sm" variant="outline" onClick={plan} disabled={disabled || feedback.kind === "loading"}>Plan</Button>{feedback.message ? <span className="max-w-36 text-xs text-muted-foreground">{feedback.message}</span> : null}</div>;
}
