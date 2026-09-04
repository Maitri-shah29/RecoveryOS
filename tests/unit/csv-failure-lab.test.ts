import { describe, expect, it } from "vitest";
import { parseCasesCsv } from "@/lib/ingestion/csv";
import { runFailureLab } from "@/lib/services/failure-lab";
import { benchmarkCase } from "./fixtures";

describe("CSV ingestion", () => {
  it("separates valid rows from rejected rows", () => {
    const item = benchmarkCase();
    const headers = Object.keys(item);
    const row = headers.map((key) => String(item[key as keyof typeof item] ?? "")).join(",");
    const invalid = row.replace("25000", "not-money");
    const result = parseCasesCsv(`${headers.join(",")}\n${row}\n${invalid}\n`);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });
});

describe("failure lab", () => {
  it("passes all four injected invariants", async () => {
    const result = await runFailureLab();
    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(4);
  });
});
