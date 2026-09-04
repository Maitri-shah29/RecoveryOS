import { expect, test } from "@playwright/test";

test("keeps simulated benchmark and proof evidence visibly separate", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Held-out recovery benchmark" })).toBeVisible();
  await expect(page.getByText("Benchmark evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("Razorpay proof evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("This value is never combined with simulated recovery", { exact: false })).toBeVisible();
  await expect(page.getByRole("cell", { name: "RecoveryOS Policy" })).toBeVisible();
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
  ]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByText("Actual: 2 attempts then fallback_rule", { exact: true })).toBeVisible();
});
