import { expect, test } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

test.beforeAll(async () => {
  await fs.rm(path.join(process.cwd(), ".e2e-data"), {
    recursive: true,
    force: true,
  });
});

test("uploads a PDF and downloads the completed CSV", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Email").fill("browser@example.test");
  await page.getByLabel("Password").fill("LongPassword123!");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Operations dashboard")).toBeVisible();
  await page
    .locator('input[type="file"]')
    .setInputFiles("invoices/invoice_01_electricity_us_clean.pdf");
  await page.getByRole("button", { name: "Queue extraction" }).click();

  await expect(page.getByRole("link", { name: "Download CSV" })).toBeVisible({
    timeout: 20_000,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});
