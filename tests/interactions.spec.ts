import { test, expect, type Locator, type Page } from "@playwright/test";
import { block, createActivity, dragBy, gotoApp, readStore } from "./helpers";

/** Drag the resize handle at the bottom of a block by dy pixels (15-min snap). */
async function resizeBy(page: Page, b: Locator, dy: number): Promise<void> {
  const box = (await b.boundingBox())!;
  const x = box.x + box.width / 2;
  // Press inside the resize handle; the stable grid captures subsequent moves.
  const press = box.y + box.height + (dy > 0 ? -11 : -6);
  await page.mouse.move(x, press);
  await page.mouse.down();
  // Intermediate moves exercise the 15-minute snapping preview.
  const pts = dy > 0 ? [6, 18, 30, 42, 54, 60] : [-6, -18, -30, -36];
  for (const p of pts) {
    await page.mouse.move(x, press + p, { steps: 1 });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(80); // allow the last preview render before release
  await page.mouse.up();
}

test("drag block vertically changes its time (15-min snap) and persists", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" }); // 09:00, 60min

  await dragBy(page, block(page, "Reunión"), 0, 48); // 48px = 1h

  await expect(block(page, /^Reunión, 10:00/)).toBeVisible();
  const store = await readStore(page);
  expect(store.plans[0].activities[0]).toMatchObject({ start: 600, duration: 60, day: 0 });

  await page.reload();
  await expect(block(page, /^Reunión, 10:00/)).toBeVisible();
});

// Grid-owned pointer capture keeps the gesture alive across day columns.
test("drag block horizontally changes the day, time unchanged", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" }); // day 0, 09:00

  const b = block(page, "Reunión");
  const colWidth = await b.evaluate((el) => (el.parentElement?.parentElement?.clientWidth ?? 700) / 7);
  await dragBy(page, b, colWidth * 1.35, 0, 8); // one full column to the right

  const store = await readStore(page);
  expect(store.plans[0].activities[0]).toMatchObject({ day: 1, start: 540, duration: 60 });
  await expect(block(page, /^Reunión, 09:00/)).toBeVisible();
});

test("resize down grows duration while the top stays fixed", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" }); // 09:00, 60min

  const b = block(page, "Reunión");
  const topBefore = (await b.boundingBox())!.y;

  await resizeBy(page, b, 60); // +60px = +75min → 135min

  await expect(b).toContainText("09:00 · 2h 15m");
  const boxAfter = (await b.boundingBox())!;
  expect(Math.abs(boxAfter.y - topBefore)).toBeLessThanOrEqual(1); // top unchanged
  const store = await readStore(page);
  expect(store.plans[0].activities[0]).toMatchObject({ start: 540, duration: 135 });
});

test("resize up shrinks duration down to the 15-minute minimum", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" }); // 09:00, 60min

  const b = block(page, "Reunión");
  await resizeBy(page, b, -36); // -36px = -45min → clamped to 15min

  await expect(b).toContainText("09:00 · 15m");
  const store = await readStore(page);
  expect(store.plans[0].activities[0].duration).toBe(15);
});

test("desktop drag on an empty column creates a time-range selection and opens the editor", async ({ page }) => {
  await gotoApp(page);

  // The day columns wrapper (absolute grid, starts below the sticky day header on desktop).
  const col = page.locator('div[class*="md:top-14"]');
  const box = (await col.boundingBox())!;
  const x = box.x + 60;
  const yPress = box.y + (570 / 1440) * box.height; // 9:30 → snaps to 9:30
  const yEnd = yPress + 96; // +96px = 2h

  // The selection anchor is set at the FIRST delivered move (not the press),
  // one step early: press 9:30 → first move 10:00 → end 11:30.
  await page.mouse.move(x, yPress);
  await page.mouse.down();
  await page.mouse.move(x, yEnd, { steps: 4 });
  await page.waitForTimeout(50);
  await page.mouse.up();

  await expect(page.getByRole("heading", { name: "Nueva actividad" })).toBeVisible();
  await expect(page.getByText("1h 30m · 10:00–11:30")).toBeVisible();
  // The start field shows the anchored time; the button's accessible name is "Inicio".
  await expect(page.getByRole("button", { name: "Inicio", exact: true })).toContainText("10:00");
});

test("clicking a block without dragging still opens the edit dialog (no accidental drag)", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });

  await block(page, "Reunión").click();
  await expect(page.getByRole("heading", { name: "Editar actividad" })).toBeVisible();
  await expect(page.getByLabel(/Nombre/)).toHaveValue("Reunión");
});
