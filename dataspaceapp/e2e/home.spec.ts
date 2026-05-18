import { expect, test } from "@playwright/test"

test("home page loads hero", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Break Manufacturing Data Silos/i })).toBeVisible()
})
