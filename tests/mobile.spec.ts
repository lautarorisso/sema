import { test, expect } from "@playwright/test";
import { block, createActivity, dayChip, gotoApp, openNewActivityDialog, readStore, saveActivityDialog, seedActivities } from "./helpers";

test("chevron navigation cycles the visible day", async ({ page }) => {
  await gotoApp(page);
  const dayLabel = page.locator("strong:visible");
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

test("grid creation prefills the currently visible day on mobile", async ({ page }) => {
  await gotoApp(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Siguiente" }).click(); // Jueves

  await openNewActivityDialog(page);
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

// Grid-owned capture keeps the drag active across days; mobile navigation follows.
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
  const nav = await page.locator("strong:visible").textContent();
  const obs = `mobile cross-day drag: activity day=${day} (was 1, 185px right), nav label="${nav}", block count=${await b.count()}`;
  console.log(`[observation] ${obs}`);
  testInfo.annotations.push({ type: "observation", description: obs });

  expect(day).toBe(2);
  await expect(b).toHaveCount(1);
});

// A 24-hour activity starting at 09:00 splits into 15h Monday and 9h Tuesday.
test("BUG-3: resizing far beyond the day keeps rendered blocks within the grid height", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 3200 }); // tall viewport so the long drag stays on screen
  await seedActivities(page, [{ id: "mega", name: "Mega", day: 0, start: 540, duration: 60, color: "#818cf8", source: "custom" }]);
  await gotoApp(page);

  const b = page.getByRole("button", { name: /^Mega,/ });
  const box = (await b.boundingBox())!;
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height - 6; // resize handle

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // Mark the gesture as moved without changing the resize duration yet.
  await page.mouse.move(sx + 24, sy, { steps: 1 });
  await page.waitForTimeout(30);
  const total = 2400; // Attempts ~3000 extra minutes; stored duration must clamp to 1440.
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(sx + 24, sy + (total * i) / 16, { steps: 1 });
    await page.waitForTimeout(10);
  }

  await expect(b).toHaveCount(1); // Only the selected day's portion is accessible.
  await expect(b).toContainText("09:00 · 15h");
  expect((await readStore(page)).plans[0].activities[0].duration).toBe(60);

  await page.mouse.up();
  await page.waitForTimeout(300);

  const store = await readStore(page);
  expect(store.plans[0].activities[0]).toMatchObject({ day: 0, start: 540, duration: 1440 });
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.locator("strong:visible")).toHaveText("Martes");
  await expect(b).toHaveCount(1);
  await expect(b).toContainText("00:00 · 9h");

  // …and no rendered block may be taller than the 1152px day grid.
  const heights = await page
    .getByRole("button", { name: /^Mega,/ })
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
  console.log(`[observation] BUG-3 mobile block heights: ${heights.join(", ")} (day grid = 1152px)`);
  await expect(Math.max(...heights)).toBeLessThanOrEqual(1152);
});

test("mobile hides other-day blocks and columns without overflowing the viewport", async ({ page }) => {
  await seedActivities(page, Array.from({ length: 7 }, (_, day) => ({
    id: `day-${day}`, name: `Day ${day}`, day, start: 540, duration: 60, color: "#818cf8", source: "custom" as const,
  })));
  await gotoApp(page);
  const allBlocks = page.locator('button[aria-label^="Day "]');
  const columns = page.locator('div[class*="grid-cols-7"] > div');
  for (let day = 0; day < 7; day++) {
    await expect(block(page, `Day ${day}`)).toBeVisible();
    await expect(allBlocks.filter({ visible: true })).toHaveCount(1);
    await expect(columns.filter({ visible: true })).toHaveCount(1);
    for (let other = 0; other < 7; other++) {
      if (other !== day) await expect(allBlocks.nth(other)).toBeHidden();
    }
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      scrollers: Array.from(document.querySelectorAll<HTMLElement>(".overflow-auto")).map(el => ({ width: el.clientWidth, scroll: el.scrollWidth })),
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    for (const scroller of dimensions.scrollers) expect(scroller.scroll).toBeLessThanOrEqual(scroller.width);
    const box = (await block(page, `Day ${day}`).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(dimensions.viewport);
    if (day < 6) await page.getByRole("button", { name: "Siguiente" }).click();
  }
});

test("segment calendar supports real touch scroll, long-press selection, move and resize", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await seedActivities(page, [{ id: "touch", name: "Touch", day: 0, start: 540, duration: 600, color: "#818cf8" }]);
  await gotoApp(page); await block(page, "Touch").click();
  await page.getByRole("button", { name: /Abrir calendario de segmentos/ }).click();
  const cdp = await context.newCDPSession(page);
  const touch = async (type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", x = 0, y = 0) => {
    await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y, id: 1 }] });
  };
  const scroller = page.getByTestId("segment-scroll");
  const box = (await scroller.boundingBox())!; const x = box.x + box.width / 2;
  await touch("touchStart", x, box.y + 200);
  for (let i = 1; i <= 5; i++) await touch("touchMove", x, box.y + 200 - i * 25);
  await touch("touchEnd");
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByRole("dialog", { name: "Editar segmento", exact: true })).toHaveCount(0);
  await page.waitForTimeout(400); await scroller.evaluate(el => { el.scrollTop = 0; });
  const grid = (await page.getByTestId("segment-grid").boundingBox())!;
  await touch("touchStart", x, grid.y + 30); await page.waitForTimeout(400);
  await touch("touchMove", x, grid.y + 105); await touch("touchEnd");
  const editor = page.getByRole("dialog", { name: "Editar segmento", exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Hora de inicio")).toHaveValue("09:10");
  await expect(editor.getByLabel("Duración (minutos)")).toHaveValue("25");
  await editor.getByLabel("Nombre del segmento").fill("Touch segment");
  await page.getByRole("button", { name: "Guardar segmento" }).click();
  const segment = page.getByRole("button", { name: /^Touch segment,/ });
  let segmentBox = (await segment.boundingBox())!;
  await touch("touchStart", x, segmentBox.y + 20); await touch("touchMove", x, segmentBox.y + 50); await touch("touchEnd");
  await expect(segment).toHaveAccessibleName("Touch segment, 09:20, 25 minutos");
  segmentBox = (await segment.boundingBox())!;
  await touch("touchStart", x, segmentBox.y + segmentBox.height - 3);
  await touch("touchMove", x, segmentBox.y + segmentBox.height + 12); await touch("touchEnd");
  await expect(segment).toHaveAccessibleName("Touch segment, 09:20, 30 minutos");
  segmentBox = (await segment.boundingBox())!;
  await touch("touchStart", x, segmentBox.y + 20); await touch("touchMove", x, segmentBox.y + 50); await touch("touchCancel");
  await expect(segment).toHaveAccessibleName("Touch segment, 09:20, 30 minutos");
  // Unmount an active long-press selection; reopening must not leave a scroll blocker.
  await touch("touchStart", x, grid.y + 250); await page.waitForTimeout(400);
  await page.keyboard.press("Escape"); await touch("touchEnd");
  await page.getByRole("button", { name: /Abrir calendario de segmentos/ }).click();
  await touch("touchStart", x, box.y + 200);
  for (let i = 1; i <= 5; i++) await touch("touchMove", x, box.y + 200 - i * 25);
  await touch("touchEnd");
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Volver a la actividad" }).click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  expect((await readStore(page)).plans[0].activities[0].segments?.[0]).toMatchObject({ start: 20, duration: 30 });
  await cdp.detach();
});
