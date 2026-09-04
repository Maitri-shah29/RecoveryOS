import { benchmarkCaseSchema, type BenchmarkCase } from "@/lib/domain/schemas";

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { field += '"'; index += 1; } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  return rows;
}

export function parseCasesCsv(input: string): { accepted: BenchmarkCase[]; rejected: { row: number; issues: string[] }[] } {
  const rows = parseCsvRows(input);
  const headers = rows[0];
  if (!headers?.length) throw new Error("CSV header row is required");
  const accepted: BenchmarkCase[] = [];
  const rejected: { row: number; issues: string[] }[] = [];
  for (const [index, values] of rows.slice(1).entries()) {
    const raw = Object.fromEntries(headers.map((header, position) => [header.trim(), values[position] ?? ""]));
    const candidate = {
      ...raw,
      razorpay_payment_id: raw.razorpay_payment_id || null,
      amount_paise: Number(raw.amount_paise),
      prior_attempts: Number(raw.prior_attempts),
      recovery_contacts_7d: Number(raw.recovery_contacts_7d),
      order_paid: raw.order_paid === "true",
      action_in_flight: raw.action_in_flight === "true",
      required_data_complete: raw.required_data_complete === "true",
    };
    const parsed = benchmarkCaseSchema.safeParse(candidate);
    if (parsed.success) accepted.push(parsed.data);
    else rejected.push({ row: index + 2, issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) });
  }
  return { accepted, rejected };
}
