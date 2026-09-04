import type { PolicyConfig } from "@/lib/domain/policy";
import { getActivePolicy } from "@/lib/services/policy-config";
import { PageHeader } from "@/components/page-header";
import { PolicyForm } from "@/components/policy-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
export const dynamic = "force-dynamic";
export default async function PolicyPage() { let active: Awaited<ReturnType<typeof getActivePolicy>> | null = null; try { active = await getActivePolicy(); } catch {} return <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8"><PageHeader eyebrow="Guardrails" title="Policy configuration" description="Changes create immutable versions. Approval always rechecks current payment truth, consent, limits, quiet hours, and active-link uniqueness." badge={active?.version ?? "Unavailable"} />{active ? <Card><CardHeader><CardTitle>Safe defaults</CardTitle><CardDescription>All monetary values remain integer paise until presentation.</CardDescription></CardHeader><CardContent><PolicyForm initial={active.config as unknown as PolicyConfig} /></CardContent></Card> : <Alert><AlertTitle>Database unavailable</AlertTitle><AlertDescription>Start PostgreSQL to view or version policy.</AlertDescription></Alert>}</main>; }
