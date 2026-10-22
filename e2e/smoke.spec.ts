import { test, expect } from "@playwright/test";

/**
 * Smoke test: the app loads, the board renders, and the core flows
 * (place a part, route, flip, 3D) don't throw. Catches render crashes the
 * engine unit tests can't — the UI layer has no unit tests by design.
 */
test("app loads and core flows don't crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");

  // Board canvas is present.
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();

  // Place a component: arm DIP-8 from the palette, then click the board.
  await page.getByRole("button", { name: "DIP-8" }).click();
  const box = await canvas.boundingBox();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // Routing mode toggles without error.
  await page.getByRole("button", { name: /Route/ }).first().click();
  await page.keyboard.press("Escape");

  // Flip to bottom view and back.
  await page.getByRole("button", { name: /view/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /view/ }).click();

  // 3D view and back.
  await page.getByRole("button", { name: /^(2D|3D)$/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^(2D|3D)$/ }).click();

  expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([]);
});
