import { test, expect } from "@playwright/test";
import { block, createActivity, dragBy, gotoApp, openNewActivityDialog, readStore, setDays } from "./helpers";

// The week ends at Sunday midnight; it never wraps overflow to Monday.
test("Sunday creation clamps duration at midnight instead of wrapping to Monday", async ({ page }) => {
  await gotoApp(page);
  await openNewActivityDialog(page);
  await page.getByLabel(/Nombre/).fill("Domingo");
  await setDays(page, ["Dom"]);
  await page.getByLabel(/Duración/).fill("180");
  await page.getByRole("button", { name: "Inicio", exact: true }).click();
  const input = page.locator('input[type="time"]');
  await input.fill("23:00");
  await input.evaluate((el) => (el as HTMLInputElement).blur());
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByRole("button", { name: /^Domingo, 23:00/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Domingo, (00:00|24:00)/ })).toHaveCount(0);
  expect((await readStore(page)).plans[0].activities[0]).toMatchObject({ day: 6, start: 1380, duration: 60 });
});

/**
 * BUG-2: Midnight label — VERIFIED NOT A BUG in this environment.
 * fmt() uses Intl.DateTimeFormat("es-AR", { hour12: false }). Live observation
 * (Chromium 153): 00:00 renders as "00:00" and the block label reads
 * "Madrugada, 00:00" — no "24:00" anywhere. Kept as a green guard test so a
 * CLDR/Intl change that flips the rendering to "24:00" fails loudly.
 */
test("BUG-2: activity at exactly 00:00 displays the label 00:00", async ({ page }) => {
  await gotoApp(page);
  await openNewActivityDialog(page);
  await page.getByLabel(/Nombre/).fill("Madrugada");
  await page.getByRole("button", { name: "Inicio", exact: true }).click();
  const input = page.locator('input[type="time"]');
  await input.fill("00:00");
  await input.evaluate((el) => (el as HTMLInputElement).blur());
  await page.getByRole("button", { name: "Guardar" }).click();

  const b = page.getByRole("button", { name: /^Madrugada, (00:00|24:00)/ });
  await expect(b).toHaveCount(1);
  const aria = await b.getAttribute("aria-label");
  const text = (await b.textContent()) ?? "";
  console.log(`[observation] BUG-2 label: aria-label="${aria}" text="${text.trim()}"`);

  await expect(b).toContainText("00:00");
});

test("desktop resize clamps the full duration to 24h and splits within the day grids", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 3200 });
  await gotoApp(page);
  await createActivity(page, { name: "Mega" }); // 09:00, 60min
  await expect(block(page, "Mega")).toHaveCount(1);
  await dragBy(page, block(page, "Mega").locator('span[class*="cursor-ns-resize"]'), 0, 1200);
  await expect(block(page, "Mega")).toHaveCount(2);
  await expect(block(page, /^Mega, 09:00/)).toContainText("09:00 · 15h");
  await expect(block(page, /^Mega, 00:00/)).toContainText("00:00 · 9h");
  expect((await readStore(page)).plans[0].activities[0]).toMatchObject({ start: 540, duration: 1440 });
  const heights = await block(page, "Mega").evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
  expect(Math.max(...heights)).toBeLessThanOrEqual(1152);
});

// A committed name edit must immediately replace the rendered label.
test("renaming an activity updates the rendered block immediately", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });

  await block(page, "Reunión").click();
  await page.getByLabel(/Nombre/).fill("Sprint");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("heading", { name: "Editar actividad" })).toBeHidden();

  await expect(block(page, "Sprint")).toBeVisible();
});
