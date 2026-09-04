import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { datasetManifestSchema, policyNames } from "@/lib/domain/schemas";
import { checksum, generateEvaluatorFixture, generatePublicDataset, stableJson, type EvaluatorFixture } from "@/lib/benchmark/generator";
import { evaluateFrozenPlans, type BenchmarkReport, type FrozenPolicyPlans } from "@/lib/benchmark/evaluator";

const root = process.cwd();

describe("versioned dataset", () => {
  it("generates the locked 60/20/100 split deterministically", () => {
    const first = generatePublicDataset();
    const second = generatePublicDataset();
    expect(datasetManifestSchema.parse(first).split_counts).toEqual({ development: 60, validation: 20, heldout: 100 });
    expect(stableJson(first)).toBe(stableJson(second));
    expect(generateEvaluatorFixture(first).outcomes).toHaveLength(4_500);
  });

  it("does not leak potential outcomes into agent-visible fixtures", async () => {
    const publicFixture = await readFile(path.join(root, "fixtures", "public", "recovery-cases-v1.0.0.json"), "utf8");
    expect(publicFixture).not.toMatch(/recovery_probability|deterministic_draw|recovered\"|recovery_delay_minutes/);
  });
});

describe("held-out evaluation", () => {
  it("re-evaluates frozen plans to the committed byte-equivalent report", async () => {
    const dataset = datasetManifestSchema.parse(JSON.parse(await readFile(path.join(root, "fixtures", "public", "recovery-cases-v1.0.0.json"), "utf8")));
    const cases = dataset.cases.filter((item) => item.split === "heldout");
    const fixture = JSON.parse(await readFile(path.join(root, "fixtures", "evaluator", "potential-outcomes-v1.0.0.json"), "utf8")) as EvaluatorFixture;
    const sets = await Promise.all(policyNames.map(async (policy) => JSON.parse(await readFile(path.join(root, "fixtures", "public", "frozen-plans", `${policy.toLowerCase()}.json`), "utf8")) as FrozenPolicyPlans));
    const report = JSON.parse(await readFile(path.join(root, "reports", "heldout-v1.0.0.json"), "utf8")) as BenchmarkReport;
    const rerun = evaluateFrozenPlans(dataset.dataset_version, checksum(cases), cases, sets, fixture);
    expect(stableJson(rerun)).toBe(stableJson(report));
    expect(rerun.heldout_case_count).toBe(100);
    expect(rerun.identical_dataset_checksum_for_all_policies).toBe(true);
    expect(rerun.all_cases_accounted_for).toBe(true);
    expect(rerun.policies).toHaveLength(4);
    expect(rerun.policies.every((metric) => metric.unauthorized_contacts === 0 && metric.duplicate_external_actions === 0 && metric.successful_payment_double_attributions === 0)).toBe(true);
  });
});
