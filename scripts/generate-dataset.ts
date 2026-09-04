import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { datasetManifestSchema } from "@/lib/domain/schemas";
import { generateEvaluatorFixture, generatePublicDataset } from "@/lib/benchmark/generator";

const root = process.cwd();
const publicDir = path.join(root, "fixtures", "public");
const evaluatorDir = path.join(root, "fixtures", "evaluator");
await Promise.all([mkdir(publicDir, { recursive: true }), mkdir(evaluatorDir, { recursive: true })]);

const dataset = datasetManifestSchema.parse(generatePublicDataset(process.env.BENCHMARK_SEED));
const fixture = generateEvaluatorFixture(dataset, process.env.BENCHMARK_SEED);
await Promise.all([
  writeFile(path.join(publicDir, "recovery-cases-v1.0.0.json"), `${JSON.stringify(dataset, null, 2)}\n`),
  writeFile(path.join(evaluatorDir, "potential-outcomes-v1.0.0.json"), `${JSON.stringify(fixture, null, 2)}\n`),
]);
console.log(`Generated ${dataset.case_count} cases (${dataset.split_counts.heldout} held out) and ${fixture.outcomes.length} evaluator-only outcomes.`);
