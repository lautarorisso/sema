import { test, expect } from "@playwright/test";
import { createActivity, dayChip, gotoApp, readStore, saveActivityDialog } from "./helpers";

test("chevron navigation cycles the visible day", async ({ page }) => {
  await gotoApp(page);
  const dayLabel = page.locator("strong");
  await expect(dayLabel).toHaveText("Lunes");

  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(dayLabel).toHaveText("Martes");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(dayLabel).toHaveText("Miércoles");
  await page.getByRole("button", { name: "Anterior" }).click();
  await expect(dayLabel).toHaveText("Martes");

  // cycle past Sunday wraps around to Monday
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(dayLabel).toHaveText("Domingo");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(dayLabel).toHaveText("Lunes");
});

test("Agregar actividad prefills the currently visible day on mobile", async ({ page }) => {
  await gotoApp(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Siguiente" }).click(); // Jueves

  await page.getByRole("button", { name: "Agregar actividad" }).click();
  await expect(page.getByRole("heading", { name: "Nueva actividad" })).toBeVisible();

  await expect(dayChip(page, "Jue")).toHaveAttribute("aria-pressed", "true");
  await expect(dayChip(page, "Lun")).toHaveAttribute("aria-pressed", "false");
  // exactly one day pre-selected
  await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(1);

  await page.getByLabel(/Nombre/).fill("Viaje");
  await saveActivityDialog(page);

  const store = await readStore(page);
  expect(store.plans[0].activities).toHaveLength(1);
  expect(store.plans[0].activities[0].day).toBe(3);
});

/**
 * Long-press selection: the app arms a 260ms timer on pointerdown (mobile only).
 * Press, hold past the timer, then drag to extend and release → edit dialog
 * opens prefilled with the selected range.
 */
test("long-press on the day column creates a selection and opens the prefilled editor", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: "Siguiente" }).click(); // Martes, day index 1

  const col = page.locator('div[class*="md:top-14"]');
  const box = (await col.boundingBox())!;
  const x = box.x + 60;
  const yStart = box.y + (600 / 1440) * box.height; // 10:00
  const yEnd = yStart + 96; // +2h → 12:00

  await page.mouse.move(x, yStart);
  await page.mouse.down();
  await page.waitForTimeout(400); // well past the 260ms arm timer
  await page.mouse.move(x, yEnd, { steps: 3 });
  await page.mouse.up();

  await expect(page.getByRole("heading", { name: "Nueva actividad" })).toBeVisible();
  await expect(page.getByText("2h · 10:00–12:00")).toBeVisible();

  // Save and confirm the selection landed on Martes at 10:00–12:00
  await page.getByLabel(/Nombre/).fill("Bloqueo");
  await saveActivityDialog(page);
  const store = await readStore(page);
  expect(store.plans[0].activities[0]).toMatchObject({ day: 1, start: 600, duration: 120 });
});

/**
 * Cross-day drag on mobile: the gesture captures (setPointerCapture after the
 * threshold), so unlike desktop the events keep landing on the block and the
 * day actually changes. Verified live: a 185px right-drag moves the activity
 * from day 1 to day 2 (nav follows, store updated). This is the counterpart to
 * the desktop day-drag fixme in interactions.spec.ts.
 */
test("cross-day drag on mobile moves the activity to the next day", async ({ page }, testInfo) => {
  await gotoApp(page);
  await page.getByRole("button", { name: "Siguiente" }).click(); // Martes, day 1
  await createActivity(page, { name: "Móvil" }); // day 1, 09:00

  const b = page.getByRole("button", { name: /^Móvil,/ });
  const box = (await b.boundingBox())!;
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(sx + 185 * (i / 5), sy, { steps: 1 }); // ~half a mobile column width
    await page.waitForTimeout(16);
  }
  await page.mouse.up();

  const store = await readStore(page);
  const day = store.plans[0].activities[0].day;
  const nav = await page.locator("strong").textContent();
  const obs = `mobile cross-day drag: activity day=${day} (was 1, 185px right), nav label="${nav}", block count=${await b.count()}`;
  console.log(`[observation] ${obs}`);
  testInfo.annotations.push({ type: "observation", description: obs });

  expect(day).toBe(2);
  await expect(b).toHaveCount(1);
});

/**
 * BUG-3 regression: resize clamp keeps rendered blocks within the day grid
 * (FIXED). The resize clamp previously allowed durations up to 1440*7 and the
 * renderer drew oversized blocks. The fix clamps the duration to one day
 * (1440 min): the first portion fills the rest of the start day and the
 * overflow renders as a second block on the next day, so no rendered block can
 * exceed the 1152px day grid. Mid-drag heights and the persisted duration are
 * asserted below; the duration bound is 1440, NOT 1440-start, because the app
 * model deliberately supports activities that cross midnight (see BUG-1).
 */
test("BUG-3: resizing far beyond the day keeps rendered blocks within the grid height", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 3200 }); // tall viewport so the long drag stays on screen
  await gotoApp(page);
  await createActivity(page, { name: "Mega" }); // 09:00, 60min

  const b = page.getByRole("button", { name: /^Mega,/ });
  const box = (await b.boundingBox())!;
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height - 6; // resize handle

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // First move: +24px horizontal crosses the mobile capture threshold (|dx| > 20px).
  await page.mouse.move(sx + 24, sy, { steps: 1 });
  await page.waitForTimeout(30);
  const total = 2400; // px → ~3000min → stored duration 3060 (≈51h)
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(sx + 24, sy + (total * i) / 16, { steps: 1 });
    await page.waitForTimeout(10);
  }

  // Mid-drag: the preview must be clamped to one day. Assert the LABEL, not
  // boundingBox height — the mobile tap-feedback class `active:scale-105`
  // inflates the measured box by exactly 1.05× while the pointer is down
  // (1209.6px vs the true 1152px). The label reflects the real duration: with
  // the fix the clamp surfaces as "24h" (was 51h+ before the fix).
  console.log(`[observation] BUG-3 mid-drag label: "${(await b.textContent())?.trim()}"`);
  await expect(b).toContainText("24h");

  await page.mouse.up();
  await page.waitForTimeout(300);

  // Post-save: the persisted duration must not exceed one day (1440 min). It
  // may cross midnight — the app model supports that (see BUG-1) — but the
  // resize clamp is 1440, so the overflow block can never exceed a day column.
  const store = await readStore(page);
  expect(store.plans[0].activities[0].duration).toBeLessThanOrEqual(1440);

  // …and no rendered block may be taller than the 1152px day grid.
  const heights = await page
    .getByRole("button", { name: /^Mega,/ })
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
  console.log(`[observation] BUG-3 mobile block heights: ${heights.join(", ")} (day grid = 1152px)`);
  await expect(Math.max(...heights)).toBeLessThanOrEqual(1152);
});