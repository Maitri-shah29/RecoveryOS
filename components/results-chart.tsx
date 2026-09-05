"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ChartDatum = { name: string; gross: number; net: number };

const compactRupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });

export function ResultsChart({ data }: { data: ChartDatum[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Gross and net simulated recovery by policy">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(251,146,60,0.13)" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#d6a38b", fontSize: 12 }} />
          <YAxis tickFormatter={(value: number) => compactRupees.format(value)} tickLine={false} axisLine={false} width={72} tick={{ fill: "#d6a38b", fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: "rgba(251,146,60,0.06)" }}
            contentStyle={{ background: "#2a1110", border: "1px solid rgba(251,146,60,0.24)", borderRadius: 10 }}
            formatter={(value) => [compactRupees.format(Number(value)), undefined]}
          />
          <Bar dataKey="gross" name="Gross recovery" fill="#dc2626" radius={[4, 4, 0, 0]} />
          <Bar dataKey="net" name="Net recovery" fill="#fb923c" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RecoveryCurve({ data }: { data: { elapsed_minutes: number; gross_recovered_paise: number }[] }) {
  const points = data.map((item) => ({ elapsed: item.elapsed_minutes, recovered: item.gross_recovered_paise / 100 }));
  return (
    <div className="h-72 w-full" role="img" aria-label="Cumulative simulated RecoveryOS revenue over 48 hours">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(251,146,60,0.13)" />
          <XAxis dataKey="elapsed" tickFormatter={(value: number) => value === 0 ? "0h" : `${value / 60}h`} tickLine={false} axisLine={false} tick={{ fill: "#d6a38b", fontSize: 12 }} />
          <YAxis tickFormatter={(value: number) => compactRupees.format(value)} tickLine={false} axisLine={false} width={72} tick={{ fill: "#d6a38b", fontSize: 12 }} />
          <Tooltip labelFormatter={(value) => `${Number(value) / 60} hours`} formatter={(value) => [compactRupees.format(Number(value)), "Cumulative gross"]} contentStyle={{ background: "#2a1110", border: "1px solid rgba(251,146,60,0.24)", borderRadius: 10 }} />
          <Line type="monotone" dataKey="recovered" name="Cumulative gross" stroke="#fb923c" strokeWidth={3} dot={{ fill: "#fb923c", stroke: "#7f1d1d", strokeWidth: 2, r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
