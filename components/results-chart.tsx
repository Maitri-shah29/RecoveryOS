"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ChartDatum = { name: string; gross: number; net: number };

const compactRupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });

export function ResultsChart({ data }: { data: ChartDatum[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Gross and net simulated recovery by policy">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#a1a1aa", fontSize: 12 }} />
          <YAxis tickFormatter={(value: number) => compactRupees.format(value)} tickLine={false} axisLine={false} width={72} tick={{ fill: "#a1a1aa", fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10 }}
            formatter={(value) => [compactRupees.format(Number(value)), undefined]}
          />
          <Bar dataKey="gross" name="Gross recovery" fill="#71717a" radius={[4, 4, 0, 0]} />
          <Bar dataKey="net" name="Net recovery" fill="#5ee9a5" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
