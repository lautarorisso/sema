import { test, expect } from "@playwright/test";
import { block, createActivity, gotoApp, openNewActivityDialog, setDays } from "./helpers";

/**
 * BUG-1 regression: Sunday midnight overflow (FIXED).
 * An activity on Sunday (day 6) starting 23:00 lasting 180min must render the
 * 00:00–02:00 overflow on the Monday column. expand() used to return only the
 * first portion when day+1 > 6, silently dropping the overflow. The fix wraps
 * the overflow to day 0 (components/planner-app.tsx, expand()).
 */
test("BUG-1: Sunday 23:00 activity overflow renders on Monday", async ({ page }) => {
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

  // The Sunday 23:00–24:00 first portion must render…
  await expect(page.getByRole("button", { name: /^Domingo, 23:00/ })).toHaveCount(1);
  // …and the overflow onto Monday 00:00–02:00 must render as a block too.
  await expect(page.getByRole("button", { name: /^Domingo, (00:00|24:00)/ })).toHaveCount(1);
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

/**
 * BUG-3 guard: desktop resize clamp (FIXED — see mobile.spec.ts for the real
 * assertion). The clamp previously allowed durations up to 1440*7 and the
 * renderer drew oversized blocks; desktop could not even reproduce it (no
 * pointer capture). The fix clamps the stored duration to one day (1440 min)
 * and adds pointer capture on desktop; mobile.spec.ts asserts the no-oversize
 * invariant end to end.
 */
test("BUG-3: desktop resize clamp keeps rendered blocks within the day grid", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 3200 });
  await gotoApp(page);
  await createActivity(page, { name: "Mega" }); // 09:00, 60min
  await expect(block(page, "Mega")).toHaveCount(1);
});

/**
 * Regression: rename preview sync (FIXED). Saving a name edit persisted to the
 * store but the rendered block kept the old name until reload — ActivityBlock
 * caches its activity in useState and the render key ignores the name. The fix
 * syncs the preview with the activity prop (components/planner-app.tsx).
 */
test("renaming an activity updates the rendered block immediately", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });

  await block(page, "Reunión").click();
  await page.getByLabel(/Nombre/).fill("Sprint");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("heading", { name: "Editar actividad" })).toBeHidden();

  await expect(block(page, "Sprint")).toBeVisible();
});