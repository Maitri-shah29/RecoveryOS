import { expect, test } from "@playwright/test";

test("keeps simulated benchmark and proof evidence visibly separate", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Held-out recovery benchmark" })).toBeVisible();
  await expect(page.getByText("Benchmark evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("Razorpay proof evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("This value is never combined with simulated recovery", { exact: false })).toBeVisible();
  await expect(page.getByRole("cell", { name: "RecoveryOS Policy" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Cumulative simulated RecoveryOS revenue over 48 hours" })).toBeVisible();
});

test("renders comparison evidence and the database-backed queue", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/comparison");
  await expect(page.getByRole("heading", { name: "Recovery by failure category" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "AUTHENTICATION_INCOMPLETE" })).toBeVisible();

  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Recovery queue" })).toBeVisible();
  await expect(page.getByText("PostgreSQL is unavailable", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByLabel("Diagnosis")).toBeVisible();
  await expect(page.getByLabel("Action")).toBeVisible();
  await expect(page.getByLabel("Confidence")).toBeVisible();
  await expect(page.getByLabel("Escalation")).toBeVisible();
});

test("shows provider proof and complete operator review evidence", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await Promise.all([
    page.waitForURL(/\/cases\/36425e4e-bf35-4138-8269-59b967065453$/, { timeout: 30_000 }),
    page.getByRole("link", { name: "Open verified proof case" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "proof-case_059-39627dee" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Planner recommendation evidence" })).toBeVisible();
  await expect(page.getByText("Expected recovery", { exact: true })).toBeVisible();
  await expect(page.getByText("API-verified attribution", { exact: true })).toBeVisible();
  await expect(page.getByText("signature valid", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Verified · 8 events", { exact: true })).toBeVisible();

  await page.goto("/exceptions");
  await expect(page.getByRole("heading", { name: "Unresolved exceptions" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Attempts" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Suggested next safe step" })).toBeVisible();
});

test("runs all safe failure injections in the browser", async ({ page }) => {
  await page.goto("/failure-lab");
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.url().endsWith("/api/failure-lab/run") && candidate.request().method() === "POST", { timeout: 30_000 }),
    page.getByRole("button", { name: "Run safe failure fixtures" }).click(),
  ]);
  expect(response.ok()).toBe(true);

  for (const name of [
    "duplicate webhook",
    "out of order webhook",
    "invalid signature",
    "model timeout",
    "database unique guards",
    "database terminal and audit guards",
  ]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByText("Actual: 2 attempts then fallback_rule", { exact: true })).toBeVisible();
  await expect(page.getByText("Passed 6/6 checks.", { exact: true })).toBeVisible();
});
