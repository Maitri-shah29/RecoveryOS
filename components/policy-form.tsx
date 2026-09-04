"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PolicyConfig } from "@/lib/domain/policy";
const fields: { key: keyof PolicyConfig; label: string; step?: string }[] = [
  { key: "maxActionsPerOrder", label: "Maximum actions per order" }, { key: "maxContactsPerCustomer7d", label: "Maximum contacts in seven days" },
  { key: "recoveryWindowHours", label: "Recovery window (hours)" }, { key: "quietHoursStart", label: "Quiet hours start (local hour)" },
  { key: "quietHoursEnd", label: "Quiet hours end (local hour)" }, { key: "minimumAmountPaise", label: "Minimum amount (paise)" },
  { key: "humanReviewConfidence", label: "Human review below confidence", step: "0.01" }, { key: "highValueReviewPaise", label: "High-value review threshold (paise)" },
];
export function PolicyForm({ initial }: { initial: PolicyConfig }) { const router = useRouter(); const [config, setConfig] = useState(initial); const [status, setStatus] = useState(""); async function save() { setStatus("Saving…"); const response = await fetch("/api/policy", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(config) }); const body = await response.json(); setStatus(response.ok ? `Saved ${body.version}; ${body.preview_eligible_cases} cases eligible in preview.` : body.error ?? "Save failed"); if (response.ok) router.refresh(); } return <div className="grid gap-4 sm:grid-cols-2">{fields.map((field) => <label key={field.key} className="space-y-2 text-sm"><span className="text-muted-foreground">{field.label}</span><Input type="number" step={field.step ?? "1"} value={config[field.key]} onChange={(event) => setConfig((current) => ({ ...current, [field.key]: Number(event.target.value) }))} /></label>)}<div className="flex items-center gap-3 sm:col-span-2"><Button onClick={save}>Create policy version</Button>{status ? <p role="status" className="text-sm text-muted-foreground">{status}</p> : null}</div></div>; }
