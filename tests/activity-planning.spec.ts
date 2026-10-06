import { test, expect, type Page } from "@playwright/test";
import type { Activity } from "../lib/types";
import { block, dayChip, fillActivityDialog, gotoApp, openNewActivityDialog, readStore, seedActivities, setDays, SHORT_DAYS, dragBy } from "./helpers";

const original: Activity = { id: "original", name: "Study", day: 0, start: 540, duration: 120, color: "#818cf8" };
const sibling: Activity = { ...original, id: "sibling", day: 2 };
const activities = async (page: Page) => (await readStore(page)).plans[0].activities;
const calendar = (page: Page) => page.getByRole("dialog", { name: "Calendario de segmentos", exact: true });
const editor = (page: Page) => page.getByRole("dialog", { name: "Editar segmento", exact: true });
const openCalendar = async (page: Page) => { await page.getByRole("button", { name: /Abrir calendario de segmentos/ }).click(); };
async function addSegment(page: Page, name: string, start: number, duration: number) {
  await page.getByRole("button", { name: "Nuevo segmento" }).click();
  await editor(page).getByLabel("Nombre del segmento").fill(name);
  const initialTime = await editor(page).getByLabel("Hora de inicio").inputValue();
  const [hours, minutes] = initialTime.split(":").map(Number);
  const minute = (hours * 60 + minutes + start) % 1440;
  await editor(page).getByLabel("Hora de inicio").fill(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
  await editor(page).getByLabel("Duración (minutos)").fill(String(duration));
  await page.getByRole("button", { name: "Guardar segmento", exact: true }).click();
}
const back = async (page: Page) => { await page.getByRole("button", { name: "Volver a la actividad" }).click(); };

test("editing retains IDs and copies segment positions without touching siblings", async ({ page }) => {
  await seedActivities(page, [original, sibling]); await gotoApp(page);
  await block(page, "Study").first().click();
  await expect(dayChip(page, "Lun")).toHaveAttribute("aria-pressed", "true");
  await fillActivityDialog(page, { name: "Changed", days: ["Lun", "Mar", "Mié"] });
  await openCalendar(page); await addSegment(page, "Practice", 30, 25); await back(page);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const saved = await activities(page); const segments = saved[0].segments!;
  expect(saved).toHaveLength(4);
  expect(segments[0]).toMatchObject({ name: "Practice", start: 30, duration: 25 });
  expect(segments[0].id).toBeTruthy();
  expect(saved.find(a => a.id === original.id)).toEqual({ ...original, name: "Changed", segments });
  expect(saved.find(a => a.id === sibling.id)).toEqual(sibling);
  expect(saved.filter(a => ![original.id, sibling.id].includes(a.id)).map(a => a.segments)).toEqual([segments, segments]);
  expect(new Set(saved.map(a => a.id)).size).toBe(4);
});

test("deselecting original day removes only that ID; empty selection disables save", async ({ page }) => {
  await seedActivities(page, [original, sibling]); await gotoApp(page); await block(page, "Study").first().click();
  await setDays(page, []); await expect(page.getByRole("button", { name: "Guardar" })).toBeDisabled();
  await setDays(page, ["Mar"]); await page.getByRole("button", { name: "Guardar" }).click();
  const saved = await activities(page);
  expect(saved.find(a => a.id === original.id)).toBeUndefined(); expect(saved.find(a => a.id === sibling.id)).toEqual(sibling);
});

test("apply-all preserves segment offsets without propagating day selection", async ({ page }) => {
  await seedActivities(page, [original, sibling]); await gotoApp(page); await block(page, "Study").first().click();
  await page.getByRole("checkbox", { name: /Aplicar a todas/ }).check();
  await fillActivityDialog(page, { name: "Shared", days: ["Mar"], duration: 90 });
  await openCalendar(page); await addSegment(page, "Shared plan", 50, 25); await back(page);
  await page.getByRole("button", { name: "Guardar" }).click();
  const saved = await activities(page);
  expect(saved.map(a => a.day).sort()).toEqual([1, 2]);
  expect(saved.every(a => a.segments?.[0].start === 50 && a.segments[0].duration === 25)).toBe(true);
});

test("legacy segments migrate sequentially once and retain their IDs after reload", async ({ page }) => {
  await seedActivities(page, [{ ...original, segments: [{ name: "Read", duration: 25 }, { name: "Rest", duration: 5 }] }]);
  await gotoApp(page);
  const migrated = (await activities(page))[0].segments!;
  expect(migrated.map(s => s.start)).toEqual([0, 25]); expect(new Set(migrated.map(s => s.id)).size).toBe(2);
  await page.reload(); await gotoApp(page); expect((await activities(page))[0].segments).toEqual(migrated);
  await block(page, "Study").click(); await openCalendar(page);
  await expect(calendar(page).getByRole("button", { name: "Rest, 09:25, 5 minutos" })).toBeVisible();
});

test("new activity supports gaps, overlapping segments and extent rather than sum", async ({ page }) => {
  await seedActivities(page, []); await gotoApp(page); await openNewActivityDialog(page);
  await fillActivityDialog(page, { name: "Planned", duration: 120 }); await openCalendar(page);
  await addSegment(page, "Read", 30, 60); await addSegment(page, "Practice", 45, 60); await addSegment(page, "Rest", 105, 5);
  await expect(page.locator("form form")).toHaveCount(0);
  const positions = await calendar(page).locator("button[data-segment-id]").evaluateAll(els => els.map(el => ({ top: (el as HTMLElement).style.top, left: (el as HTMLElement).style.left })));
  expect(positions.map(p => p.top)).toEqual(["90px", "135px", "315px"]); expect(positions[0].left).not.toEqual(positions[1].left);
  await back(page); await page.getByLabel(/Duración/).fill("15");
  await expect(page.getByLabel(/Duración/)).toHaveValue("120");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  expect((await activities(page))[0].duration).toBe(120);
  expect((await activities(page))[0].segments?.reduce((sum, s) => sum + s.duration, 0)).toBe(125);
});

test("segment editor validates exact minutes and bounds; edit and delete persist", async ({ page }) => {
  await seedActivities(page, [original]); await gotoApp(page); await block(page, "Study").click(); await openCalendar(page);
  await page.getByRole("button", { name: "Nuevo segmento" }).click();
  await expect(page.getByRole("button", { name: "Guardar segmento" })).toBeDisabled();
  await editor(page).getByLabel("Nombre del segmento").fill("Read");
  for (const value of ["0", "-1", "1.5", "121"]) {
    await editor(page).getByLabel("Duración (minutos)").fill(value);
    await expect(page.getByRole("button", { name: "Guardar segmento" })).toBeDisabled();
  }
  await editor(page).getByLabel("Duración (minutos)").fill("25");
  for (const value of ["08:59", "10:40", "11:00", ""]) {
    await editor(page).getByLabel("Hora de inicio").fill(value);
    await expect(page.getByRole("button", { name: "Guardar segmento" })).toBeDisabled();
  }
  await editor(page).getByLabel("Hora de inicio").fill("09:30");
  await page.getByRole("button", { name: "Guardar segmento" }).click();
  await calendar(page).getByRole("button", { name: /^Read,/ }).click();
  await expect(editor(page).getByLabel("Hora de inicio")).toHaveValue("09:30");
  await editor(page).getByLabel("Nombre del segmento").fill("Changed");
  await page.getByRole("button", { name: "Guardar segmento" }).click(); await back(page);
  await page.getByRole("button", { name: "Guardar", exact: true }).click(); await page.reload();
  await block(page, "Study").click(); await openCalendar(page);
  await calendar(page).getByRole("button", { name: /^Changed,/ }).focus(); await page.keyboard.press("Enter");
  await expect(editor(page)).toBeVisible(); await page.getByRole("button", { name: "Eliminar segmento", exact: true }).click();
  await back(page); await page.getByRole("button", { name: "Guardar", exact: true }).click();
  expect((await activities(page))[0].segments).toEqual([]);
});

test("segment start time after midnight saves its relative offset", async ({ page }) => {
  await seedActivities(page, [{ ...original, start: 1380, duration: 180 }]);
  await gotoApp(page); await block(page, /^Study, 23:00/).click(); await openCalendar(page);
  await addSegment(page, "Night reading", 90, 25);
  await calendar(page).getByRole("button", { name: /^Night reading,/ }).click();
  await expect(editor(page).getByLabel("Hora de inicio")).toHaveValue("00:30");
  await expect(editor(page)).toContainText("Día siguiente");
  await editor(page).getByLabel("Hora de inicio").fill("02:00");
  await expect(page.getByRole("button", { name: "Guardar segmento" })).toBeDisabled();
  await editor(page).getByLabel("Hora de inicio").fill("00:45");
  await page.getByRole("button", { name: "Guardar segmento" }).click();
  await back(page); await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.reload();
  expect((await activities(page))[0].segments?.[0]).toMatchObject({ name: "Night reading", start: 105, duration: 25 });
});

test("selection creates a segment; move and bottom resize retain stable IDs", async ({ page }) => {
  await seedActivities(page, [original]); await gotoApp(page); await block(page, "Study").click(); await openCalendar(page);
  const grid = (await page.getByTestId("segment-grid").boundingBox())!;
  await page.mouse.move(grid.x + 10, grid.y + 30); await page.mouse.down();
  await page.mouse.move(grid.x + 10, grid.y + 105); await page.mouse.up();
  await expect(editor(page).getByLabel("Hora de inicio")).toHaveValue("09:10");
  await expect(editor(page).getByLabel("Duración (minutos)")).toHaveValue("25");
  await editor(page).getByLabel("Nombre del segmento").fill("Selected"); await page.getByRole("button", { name: "Guardar segmento" }).click();
  const segment = calendar(page).getByRole("button", { name: /^Selected,/ }); const id = await segment.getAttribute("data-segment-id");
  await dragBy(page, segment, 0, 60); await expect(segment).toHaveAccessibleName("Selected, 09:30, 25 minutos");
  const box = (await segment.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 3); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 27); await page.mouse.up();
  await expect(segment).toHaveAccessibleName("Selected, 09:30, 35 minutos");
  await back(page); await page.getByRole("button", { name: "Guardar", exact: true }).click();
  expect((await activities(page))[0].segments).toEqual([{ id, name: "Selected", start: 30, duration: 35 }]);
});

test("cancelled gesture, segment menu and parent discard only their own drafts", async ({ page }) => {
  const segments = [{ id: "read", name: "Read", start: 10, duration: 25 }];
  await seedActivities(page, [{ ...original, segments }]); await gotoApp(page); await block(page, "Study").click(); await openCalendar(page);
  const segment = calendar(page).getByRole("button", { name: /^Read,/ });
  const box = (await segment.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x + 20, box.y + 50);
  await page.getByTestId("segment-grid").dispatchEvent("pointercancel", { pointerId: 1 }); await page.mouse.up();
  await expect(segment).toHaveAccessibleName("Read, 09:10, 25 minutos");
  await segment.click(); await editor(page).getByLabel("Nombre del segmento").fill("Discarded");
  await page.getByRole("button", { name: "Cancelar segmento" }).click(); await expect(segment).toBeVisible();
  await addSegment(page, "Draft", 70, 5); await back(page); await openCalendar(page);
  await expect(calendar(page).getByRole("button", { name: /^Draft,/ })).toBeVisible();
  expect((await activities(page))[0].segments).toEqual(segments);
  await back(page); await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await block(page, "Study").click(); await openCalendar(page);
  await expect(calendar(page).getByRole("button", { name: /^Draft,/ })).toHaveCount(0);
});

test("capture loss rolls back gestures and keyboard dialog navigation restores focus", async ({ page }) => {
  await seedActivities(page, [{ ...original, segments: [{ id: "read", name: "Read", start: 10, duration: 25 }] }]);
  await gotoApp(page); await block(page, "Study").click(); await openCalendar(page);
  const segment = calendar(page).getByRole("button", { name: /^Read,/ });
  const box = (await segment.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x + 20, box.y + 50);
  await page.getByTestId("segment-grid").evaluate(el => { if (el.hasPointerCapture(1)) el.releasePointerCapture(1); });
  await page.mouse.up(); await expect(segment).toHaveAccessibleName("Read, 09:10, 25 minutos");
  await segment.focus(); await page.keyboard.press("Enter");
  await expect(editor(page).getByLabel("Nombre del segmento")).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(page.getByRole("button", { name: "Guardar segmento" })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(editor(page).getByLabel("Nombre del segmento")).toBeFocused();
  await page.keyboard.press("Escape"); await expect(editor(page)).toHaveCount(0);
  await expect(page.getByTestId("segment-grid")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Abrir calendario de segmentos/ })).toBeFocused();
});

test("segment movement and resizing clamp to the activity boundaries", async ({ page }) => {
  await seedActivities(page, [{ ...original, segments: [{ id: "read", name: "Read", start: 10, duration: 25 }] }]);
  await gotoApp(page); await block(page, "Study").click(); await openCalendar(page);
  const segment = calendar(page).getByRole("button", { name: /^Read,/ });
  await dragBy(page, segment, 0, -90); await expect(segment).toHaveAccessibleName("Read, 09:00, 25 minutos");
  await dragBy(page, segment, 0, 330); await expect(segment).toHaveAccessibleName("Read, 10:35, 25 minutos");
  let box = (await segment.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height - 3); await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + box.height + 90); await page.mouse.up();
  await expect(segment).toHaveAccessibleName("Read, 10:35, 25 minutos");
  box = (await segment.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height - 3); await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y - 20); await page.mouse.up();
  await expect(segment).toHaveAccessibleName("Read, 10:35, 1 minutos");
});

test("parent save rejects invalid persisted segment offsets, names and durations", async ({ page }) => {
  await seedActivities(page, [{ ...original, segments: [{ id: "invalid", name: "", start: -1, duration: 1.5 }] }]);
  await gotoApp(page); await block(page, "Study").click();
  await expect(page.locator("form").getByRole("alert")).toContainText("inicio válido");
  await expect(page.getByRole("button", { name: "Guardar", exact: true })).toBeDisabled();
});

test("apply-all cannot shorten a sibling below its retained plan extent", async ({ page }) => {
  await seedActivities(page, [original, { ...sibling, segments: [{ id: "practice", name: "Practice", start: 50, duration: 50 }] }]);
  await gotoApp(page); await block(page, "Study").first().click(); await page.getByRole("checkbox", { name: /Aplicar a todas/ }).check();
  await fillActivityDialog(page, { duration: 90 }); await expect(page.locator("form").getByRole("alert")).toContainText("superan");
  await expect(page.getByRole("button", { name: "Guardar" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /Aplicar a todas/ }).uncheck(); await expect(page.getByRole("button", { name: "Guardar" })).toBeEnabled();
});

test("midnight markers use independent offsets and parent resize cannot cut the last end", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1800 });
  const night = { ...original, start: 1380, duration: 180, segments: [{ id: "first", name: "First", start: 30, duration: 60 }, { id: "second", name: "Second", start: 120, duration: 30 }] };
  await seedActivities(page, [night]); await gotoApp(page);
  const first = block(page, /^Study, 23:00/); const second = block(page, /^Study, 00:00/);
  const firstMarker = (await first.locator('[data-segment-id="first"]').boundingBox())!; const firstRail = (await first.locator(".segment-timeline").boundingBox())!;
  expect((firstMarker.y - firstRail.y) / firstRail.height).toBeCloseTo(.5, 2); expect(firstMarker.height / firstRail.height).toBeCloseTo(.5, 2);
  const secondMarker = await second.locator('[data-segment-id="second"]').boundingBox(); const box = (await second.boundingBox())!;
  const secondRail = (await second.locator(".segment-timeline").boundingBox())!;
  expect((secondMarker!.y - secondRail.y) / secondRail.height).toBeCloseTo(.5, 2);
  await expect(second.locator('[data-segment-id="first"]')).toHaveAttribute("title", "First: 23:30 · 1h");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 6); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 96); await page.mouse.up();
  await expect.poll(async () => (await activities(page))[0].duration).toBe(150);
  await first.click(); await dayChip(page, "Dom").click();
  await expect(page.locator("form").getByRole("alert")).toContainText("superan"); await expect(page.getByRole("button", { name: "Guardar" })).toBeDisabled();
});

test("320px day chips remain compact and mini calendar scrolls without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 }); await seedActivities(page, []); await gotoApp(page); await openNewActivityDialog(page);
  const boxes = await Promise.all(SHORT_DAYS.map(day => dayChip(page, day).boundingBox()));
  expect(new Set(boxes.map(box => box!.y)).size).toBe(1); expect(boxes.every(box => box!.x >= 0 && box!.x + box!.width <= 320)).toBe(true);
  await fillActivityDialog(page, { duration: 600 }); await openCalendar(page); await addSegment(page, "Small", 0, 5);
  const dimensions = await page.getByTestId("segment-scroll").evaluate(el => ({ height: el.clientHeight, scrollHeight: el.scrollHeight, width: el.clientWidth, scrollWidth: el.scrollWidth }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height); expect(dimensions.scrollWidth).toBe(dimensions.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
