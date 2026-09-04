import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { datasetManifestSchema, policyNames } from "@/lib/domain/schemas";
import { checksum, stableJson, type EvaluatorFixture } from "@/lib/benchmark/generator";
import { freezePlans } from "@/lib/benchmark/planner";
import { evaluateFrozenPlans, type FrozenPolicyPlans } from "@/lib/benchmark/evaluator";
import { PLANNER_VERSION } from "@/lib/benchmark/constants";

const root = process.cwd();
const dataset = datasetManifestSchema.parse(JSON.parse(await readFile(path.join(root, "fixtures", "public", "recovery-cases-v1.0.0.json"), "utf8")));
const fixture = JSON.parse(await readFile(path.join(root, "fixtures", "evaluator", "potential-outcomes-v1.0.0.json"), "utf8")) as EvaluatorFixture;
const heldout = dataset.cases.filter((item) => item.split === "heldout");
const datasetChecksum = checksum(heldout);
const planSets: FrozenPolicyPlans[] = policyNames.map((policy) => {
  const plans = freezePlans(policy, heldout);
  return { policy, dataset_checksum: datasetChecksum, planner_version: PLANNER_VERSION, plan_checksum: checksum(plans), plans };
});

const planDir = path.join(root, "fixtures", "public", "frozen-plans");
await mkdir(planDir, { recursive: true });
await Promise.all(planSets.map((planSet) => writeFile(path.join(planDir, `${planSet.policy.toLowerCase()}.json`), `${JSON.stringify(planSet, null, 2)}\n`)));

const report = evaluateFrozenPlans(dataset.dataset_version, datasetChecksum, heldout, planSets, fixture);
await mkdir(path.join(root, "reports"), { recursive: true });
await writeFile(path.join(root, "reports", "heldout-v1.0.0.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(root, "reports", "heldout-v1.0.0.canonical.json"), `${stableJson(report)}\n`);
console.log(`Evaluated ${heldout.length} held-out cases across ${planSets.length} policies.`);
console.log(`Dataset checksum: ${datasetChecksum}`);
