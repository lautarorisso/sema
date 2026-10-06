import { test, expect, type Locator, type Page } from "@playwright/test";
import type { Activity } from "../lib/types";
import { block, fillActivityDialog, gotoApp, openNewActivityDialog, readStore, seedActivities, setDays } from "./helpers";

const activity = (id: string, day = 0, start = 540, duration = 120): Activity => ({
  id, name: id, day, start, duration, color: "#818cf8", source: "custom",
});
const grid = (page: Page) => page.locator('div[class*="md:top-14"]');
const activities = async (page: Page) => (await readStore(page)).plans[0].activities;

async function press(page: Page, target: Locator, resize = false) {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + (resize ? box.height - 6 : Math.min(box.height / 3, 30));
  await page.mouse.move(x, y);
  await page.mouse.down();
  return { x, y };
}

async function expectWidth(target: Locator, width: number) {
  await expect.poll(async () => Math.abs((await target.boundingBox())!.width - width)).toBeLessThan(2);
}

test.beforeEach(async ({ page }) => {
  // Keep midnight and boundary gestures on screen without edge auto-scroll.
  await page.setViewportSize({ width: 1280, height: 1800 });
});

test("week heading hit box hugs the text and adjacent whitespace does not rename", async ({ page }) => {
  await seedActivities(page, []);
  await gotoApp(page);
  const heading = page.getByRole("heading", { level: 1 });
  const dimensions = await heading.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return { box: el.getBoundingClientRect().width, text: range.getBoundingClientRect().width };
  });
  expect(Math.abs(dimensions.box - dimensions.text)).toBeLessThan(2);
  const box = (await heading.boundingBox())!;
  await page.mouse.click(box.x + box.width + 30, box.y + box.height / 2);
  await expect(heading).toBeVisible();
  await expect(page.locator('input[type="text"], input:not([type])')).toHaveCount(0);
  await heading.click();
  await expect(page.getByRole("textbox")).toHaveValue("Focused week");
});

test("selecting Sunday saves the displayed clamped duration for every selected day", async ({ page }) => {
  await seedActivities(page, []);
  await gotoApp(page);
  await openNewActivityDialog(page);
  await fillActivityDialog(page, { name: "Bounded", start: "23:00", duration: 180 });
  await setDays(page, ["Lun", "Dom"]);
  await expect(page.getByLabel(/Duración/)).toHaveAttribute("max", "60");
  await expect(page.getByLabel(/Duración/)).toHaveValue("60");
  await page.getByRole("button", { name: "Guardar" }).click();
  const saved = await activities(page);
  expect(saved.map(a => ({ day: a.day, start: a.start, duration: a.duration }))).toEqual([
    { day: 0, start: 1380, duration: 60 }, { day: 6, start: 1380, duration: 60 },
  ]);
  await expect(block(page, "Bounded")).toHaveCount(2);
});

test("Sunday editing clamps crossing duration and the last possible start", async ({ page }) => {
  await seedActivities(page, [activity("Sunday", 6, 1260, 180)]);
  await gotoApp(page);
  await block(page, "Sunday").click();
  await fillActivityDialog(page, { start: "23:30" });
  await expect(page.getByLabel(/Duración/)).toHaveAttribute("max", "30");
  await expect(page.getByLabel(/Duración/)).toHaveValue("30");
  await page.getByRole("button", { name: "Inicio", exact: true }).click();
  await page.locator('input[type="time"]').fill("23:59");
  await page.locator('input[type="time"]').evaluate(el => (el as HTMLInputElement).blur());
  await expect(page.getByRole("button", { name: "Inicio", exact: true })).toContainText("23:45");
  await expect(page.getByLabel(/Duración/)).toHaveAttribute("max", "15");
  await page.getByRole("button", { name: "Guardar" }).click();
  expect(await activities(page)).toEqual([activity("Sunday", 6, 1425, 15)]);
  await expect(block(page, "Sunday")).toHaveCount(1);
});

test("legacy Sunday overflow renders only the Sunday portion, never Monday", async ({ page }) => {
  const original = activity("Legacy", 6, 1380, 180);
  await seedActivities(page, [original]);
  await gotoApp(page);
  await expect(block(page, "Legacy")).toHaveCount(1);
  await expect(block(page, "Legacy")).toContainText("23:00 · 1h");
  const sunday = await grid(page).evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.x + 40 + (r.width - 40) * 6 / 7;
  });
  expect((await block(page, "Legacy").boundingBox())!.x).toBeGreaterThan(sunday);
  expect(await activities(page)).toEqual([original]);
  await block(page, "Legacy").click();
  await expect(page.getByLabel(/Duración/)).toHaveValue("60");
  await page.getByRole("button", { name: "Guardar" }).click();
  expect(await activities(page)).toEqual([{ ...original, duration: 60 }]);
});

for (const boundary of ["Monday", "Sunday"] as const) {
  test(`${boundary} move clamp shifts the full event without shortening it`, async ({ page }) => {
    const original = boundary === "Monday" ? activity("Moving", 1, 30, 120) : activity("Moving", 5, 1380, 180);
    await seedActivities(page, [original]);
    await gotoApp(page);
    const colWidth = await grid(page).evaluate(el => (el.clientWidth - 40) / 7);
    const { x, y } = await press(page, block(page, /^Moving, (00:30|23:00)/));
    await page.mouse.move(x + (boundary === "Monday" ? -colWidth : colWidth), y + (boundary === "Monday" ? -96 : 96));
    const expected = { ...original, day: boundary === "Monday" ? 0 : 6, start: boundary === "Monday" ? 0 : 1260 };
    await expect(block(page, "Moving")).toHaveCount(1);
    await expect(block(page, "Moving")).toContainText(boundary === "Monday" ? "00:00 · 2h" : "21:00 · 3h");
    expect(await activities(page)).toEqual([original]);
    await page.mouse.up();
    await expect.poll(() => activities(page)).toEqual([expected]);
    await page.reload();
    await expect(block(page, "Moving")).toContainText(boundary === "Monday" ? "00:00 · 2h" : "21:00 · 3h");
  });
}

test("horizontal preview recalculates source and destination overlap widths and restores them on return", async ({ page }) => {
  const originals = [activity("Moving"), activity("Source"), activity("Destination", 1)];
  await seedActivities(page, originals);
  await gotoApp(page);
  const colWidth = await grid(page).evaluate(el => (el.clientWidth - 40) / 7);
  const half = colWidth / 2 - 8;
  const full = colWidth - 8;
  await expectWidth(block(page, "Moving"), half);
  await expectWidth(block(page, "Source"), half);
  await expectWidth(block(page, "Destination"), full);
  const { x, y } = await press(page, block(page, "Moving"));
  await page.mouse.move(x + colWidth, y);
  await expectWidth(block(page, "Source"), full);
  await expectWidth(block(page, "Destination"), half);
  await expectWidth(block(page, "Moving"), half);
  expect(await activities(page)).toEqual(originals);
  await page.mouse.move(x, y);
  await expectWidth(block(page, "Source"), half);
  await expectWidth(block(page, "Moving"), half);
  await expectWidth(block(page, "Destination"), full);
  expect(await activities(page)).toEqual(originals);
  await page.mouse.up();
  expect(await activities(page)).toEqual(originals);
});

test("resize previews split across midnight and reverse before release", async ({ page }) => {
  const original = activity("Night", 0, 1380, 30);
  await seedActivities(page, [original]);
  await gotoApp(page);
  const { x, y } = await press(page, block(page, "Night"), true);
  await page.mouse.move(x, y + 72);
  await expect(block(page, "Night")).toHaveCount(2);
  await expect(block(page, /^Night, 23:00/)).toContainText("23:00 · 1h");
  await expect(block(page, /^Night, 00:00/)).toContainText("00:00 · 1h");
  expect(await activities(page)).toEqual([original]);
  await page.mouse.move(x, y - 12);
  await expect(block(page, "Night")).toHaveCount(1);
  await expect(block(page, "Night")).toContainText("23:00 · 15m");
  expect(await activities(page)).toEqual([original]);
  await page.mouse.move(x, y + 72);
  await expect(block(page, "Night")).toHaveCount(2);
  await page.mouse.up();
  await expect.poll(() => activities(page)).toEqual([{ ...original, duration: 120 }]);
});

test("dragging the second portion preserves the full event and its original start offset", async ({ page }) => {
  const original = activity("Night", 0, 1380, 180);
  await seedActivities(page, [original]);
  await gotoApp(page);
  const colWidth = await grid(page).evaluate(el => (el.clientWidth - 40) / 7);
  const { x, y } = await press(page, block(page, /^Night, 00:00/));
  await page.mouse.move(x + colWidth, y + 24);
  await expect(block(page, /^Night, 23:30/)).toContainText("23:30 · 30m");
  await expect(block(page, /^Night, 00:00/)).toContainText("00:00 · 2h 30m");
  const positions = await block(page, "Night").evaluateAll(els => els.map(el => el.getBoundingClientRect().x));
  const gridX = (await grid(page).boundingBox())!.x;
  expect(positions[0]).toBeCloseTo(gridX + 40 + colWidth + 4, 0);
  expect(positions[1]).toBeCloseTo(gridX + 40 + colWidth * 2 + 4, 0);
  expect(await activities(page)).toEqual([original]);
  await page.mouse.up();
  await expect.poll(() => activities(page)).toEqual([{ ...original, day: 1, start: 1410 }]);
});

test("resizing the second portion can remove and recreate it in the same gesture", async ({ page }) => {
  const original = activity("Night", 0, 1380, 120);
  await seedActivities(page, [original]);
  await gotoApp(page);
  const { x, y } = await press(page, block(page, /^Night, 00:00/), true);
  await page.mouse.move(x, y - 60);
  await expect(block(page, "Night")).toHaveCount(1);
  await expect(block(page, "Night")).toContainText("23:00 · 45m");
  expect(await activities(page)).toEqual([original]);
  await page.mouse.move(x, y + 24);
  await expect(block(page, "Night")).toHaveCount(2);
  await expect(block(page, /^Night, 23:00/)).toContainText("23:00 · 1h");
  await expect(block(page, /^Night, 00:00/)).toContainText("00:00 · 1h 30m");
  expect(await activities(page)).toEqual([original]);
  await page.mouse.up();
  await expect.poll(() => activities(page)).toEqual([{ ...original, duration: 150 }]);
});

for (const mode of ["move", "resize"] as const) {
  test(`pointer cancellation reverts the ${mode} preview without persistence`, async ({ page }) => {
    const original = activity("Cancel", 0, 1380, 30);
    await seedActivities(page, [original]);
    await gotoApp(page);
    // Record the real mouse pointer ID rather than assuming a browser-specific ID.
    await grid(page).evaluate(el => el.addEventListener("pointerdown", event => {
      (el as HTMLElement).dataset.pointerId = String((event as PointerEvent).pointerId);
    }, { capture: true, once: true }));
    const colWidth = await grid(page).evaluate(el => (el.clientWidth - 40) / 7);
    const { x, y } = await press(page, block(page, "Cancel"), mode === "resize");
    await page.mouse.move(x + (mode === "move" ? colWidth : 0), y + 72);
    await expect(block(page, "Cancel")).toHaveCount(mode === "resize" ? 2 : 1);
    await expect(block(page, "Cancel").first()).not.toContainText("23:00 · 30m");
    expect(await activities(page)).toEqual([original]);
    const pointerId = Number(await grid(page).getAttribute("data-pointer-id"));
    await grid(page).dispatchEvent("pointercancel", { pointerId, pointerType: "mouse", bubbles: true });
    await expect(block(page, "Cancel")).toHaveCount(1);
    await expect(block(page, "Cancel")).toContainText("23:00 · 30m");
    await page.mouse.up();
    expect(await activities(page)).toEqual([original]);
    await page.reload();
    await expect(block(page, "Cancel")).toContainText("23:00 · 30m");
  });
}

test("individual editing leaves a truly identical twin untouched", async ({ page }) => {
  const first = activity("first");
  first.name = "Twin";
  const twin = { ...first, id: "second" };
  await seedActivities(page, [first, twin]);
  await gotoApp(page);
  await expect(block(page, "Twin")).toHaveCount(2);
  await block(page, "Twin").first().click();
  await fillActivityDialog(page, { name: "Changed", start: "10:00", duration: 90 });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => activities(page)).toEqual([{ ...first, name: "Changed", start: 600, duration: 90 }, twin]);
  await expect(block(page, "Twin")).toHaveCount(1);
  await expect(block(page, "Changed")).toHaveCount(1);
  await page.reload();
  await expect(block(page, "Twin")).toHaveCount(1);
  expect((await activities(page)).find(a => a.id === twin.id)).toEqual(twin);
});

test("individual deletion of an identical event removes only its ID", async ({ page }) => {
  const first = { ...activity("first"), name: "Twin" };
  const twin = { ...first, id: "second" };
  await seedActivities(page, [first, twin]);
  await gotoApp(page);
  await expect(block(page, "Twin")).toHaveCount(2);
  await block(page, "Twin").first().click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.getByRole("button", { name: "Eliminar solo esta", exact: true }).click();
  await expect.poll(() => activities(page)).toEqual([twin]);
  await expect(block(page, "Twin")).toHaveCount(1);
  await page.reload();
  await expect(block(page, "Twin")).toHaveCount(1);
  expect(await activities(page)).toEqual([twin]);
});

test("explicit editAll updates both identical events while retaining distinct IDs", async ({ page }) => {
  const first = { ...activity("first"), name: "Twin" };
  const twin = { ...first, id: "second" };
  await seedActivities(page, [first, twin]);
  await gotoApp(page);
  await block(page, "Twin").last().click();
  await page.getByRole("checkbox", { name: /Aplicar a todas/ }).check();
  await fillActivityDialog(page, { name: "Both", start: "10:00", duration: 90 });
  await page.getByRole("button", { name: "Guardar" }).click();
  const expected = [first, twin].map(a => ({ ...a, name: "Both", start: 600, duration: 90 }));
  await expect.poll(() => activities(page)).toEqual(expected);
  await expect(block(page, "Both")).toHaveCount(2);
  await page.reload();
  await expect(block(page, "Both")).toHaveCount(2);
  expect(await activities(page)).toEqual(expected);
});
