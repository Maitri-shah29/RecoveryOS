import { readFile } from "node:fs/promises";
import path from "node:path";
import { datasetManifestSchema, policyNames } from "@/lib/domain/schemas";
import { checksum, stableJson, type EvaluatorFixture } from "@/lib/benchmark/generator";
import { evaluateFrozenPlans, type BenchmarkReport, type FrozenPolicyPlans } from "@/lib/benchmark/evaluator";

const root = process.cwd();
const dataset = datasetManifestSchema.parse(JSON.parse(await readFile(path.join(root, "fixtures", "public", "recovery-cases-v1.0.0.json"), "utf8")));
const heldout = dataset.cases.filter((item) => item.split === "heldout");
const datasetChecksum = checksum(heldout);
const fixture = JSON.parse(await readFile(path.join(root, "fixtures", "evaluator", "potential-outcomes-v1.0.0.json"), "utf8")) as EvaluatorFixture;
const planSets = await Promise.all(policyNames.map(async (policy) => JSON.parse(await readFile(path.join(root, "fixtures", "public", "frozen-plans", `${policy.toLowerCase()}.json`), "utf8")) as FrozenPolicyPlans));
const persisted = JSON.parse(await readFile(path.join(root, "reports", "heldout-v1.0.0.json"), "utf8")) as BenchmarkReport;
const rerun = evaluateFrozenPlans(dataset.dataset_version, datasetChecksum, heldout, planSets, fixture);
if (stableJson(persisted) !== stableJson(rerun)) throw new Error("Benchmark report is not byte-reproducible after canonicalization");
if (!rerun.identical_dataset_checksum_for_all_policies || !rerun.all_cases_accounted_for) throw new Error("Benchmark completeness invariant failed");
if (rerun.policies.some((metric) => metric.unauthorized_contacts !== 0)) throw new Error("Unauthorized contact invariant failed");
console.log(`Verified deterministic report for ${rerun.heldout_case_count} held-out cases; checksum ${checksum(rerun)}.`);
