import Link from "next/link";
import { Activity, FlaskConical, Inbox, Layers3, Settings2, ShieldAlert } from "lucide-react";

const items = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/comparison", label: "Comparison", icon: Layers3 },
  { href: "/batches", label: "Batches", icon: Inbox },
  { href: "/cases", label: "Recovery queue", icon: Inbox },
  { href: "/exceptions", label: "Exceptions", icon: ShieldAlert },
  { href: "/policy", label: "Policy", icon: Settings2 },
  { href: "/failure-lab", label: "Failure lab", icon: FlaskConical },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen"><div className="border-b bg-card/40"><nav aria-label="Primary navigation" className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Icon className="size-4" />{label}</Link>)}</nav></div>{children}</div>;
}
