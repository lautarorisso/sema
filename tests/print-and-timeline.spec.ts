import { test, expect } from "@playwright/test";
import type { Activity } from "../lib/types";
import { block, gotoApp, readStore, seedActivities } from "./helpers";

const study: Activity = { id: "study", name: "Study", day: 0, start: 540, duration: 240, color: "#818cf8" };

test("download menu uses native print for both actions and explains the PDF destination", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await seedActivities(page, []); await gotoApp(page);
  await page.evaluate(() => { window.print = () => { document.body.dataset.printCalls = String(Number(document.body.dataset.printCalls ?? 0) + 1); }; });
  const trigger = page.getByRole("button", { name: "Descargar", exact: true });
  await trigger.focus(); await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Imprimir", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Guardar como PDF", exact: true })).toBeFocused();
  await expect(page.locator("#pdf-hint")).toContainText("Save as PDF");
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).toHaveAttribute("data-print-calls", "1");
  await expect(trigger).toBeFocused(); await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click(); await page.getByRole("menuitem", { name: "Imprimir", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-print-calls", "2");
  await trigger.click(); await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Guardar como PDF" })).toBeFocused();
  await page.keyboard.press("Home"); await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: "Guardar como PDF" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  await trigger.click(); await page.locator("header").first().click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click(); await page.keyboard.press("Tab"); await expect(page.getByRole("menu")).toHaveCount(0);
  const box = (await trigger.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

for (const width of [320, 1280]) {
  test(`native print keeps the colored full week on one A4 page at ${width}px without controls or clipping`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1800 });
    const activities: Activity[] = Array.from({ length: 7 }, (_, day) => ({ ...study, id: `day-${day}`, name: `Day ${day}`, day, start: day === 6 ? 1425 : 0, duration: day === 6 ? 15 : 1440 }));
    activities.push({ ...study, id: "night", name: "Night", color: "#34d399", start: 1380, duration: 120, segments: [{ id: "tiny", name: "Tiny midnight detail", start: 58, duration: 5 }] });
    await seedActivities(page, activities); await gotoApp(page);
    if (width === 320) await page.getByRole("button", { name: "Siguiente" }).click();
    await block(page, "Day 1").click();
    // Emulating print without the download menu also exercises Ctrl+P's layout.
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".print-title h2")).toHaveText("Focused week");
    await expect(page.locator(".print-days strong")).toHaveCount(7);
    for (const day of ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]) await expect(page.locator(".print-days").getByText(day, { exact: true })).toBeVisible();
    await expect(page.locator(".print-hour")).toHaveCount(25);
    await expect(page.locator(".print-hour").last()).toHaveText("24:00");
    await expect(page.locator(".print-activity")).toHaveCount(9);
    await expect(page.locator(".print-details")).toHaveCount(0);
    await expect(page.locator('[data-print-activity="night"]')).toHaveCount(2);
    await expect(page.locator('[data-print-activity="day-6"] b')).toHaveText("Day 6");
    const colors = await page.locator(".print-activity").evaluateAll(elements => elements.map(el => ({ border: getComputedStyle(el).borderLeftColor, fill: getComputedStyle(el).backgroundColor, exact: getComputedStyle(el).printColorAdjust })));
    expect(new Set(colors.map(color => color.fill)).size).toBe(2);
    expect(colors.some(color => color.border === "rgb(52, 211, 153)")).toBe(true);
    expect(colors.every(color => color.exact === "exact")).toBe(true);
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const dimensions = await page.locator(".print-grid").evaluate(el => {
      const grid = el.getBoundingClientRect();
      return { height: grid.height, overflow: getComputedStyle(document.body).overflow, background: getComputedStyle(document.body).backgroundColor, blocks: Array.from(el.querySelectorAll(".print-activity")).map(child => { const r = child.getBoundingClientRect(); return { top: r.top - grid.top, bottom: r.bottom - grid.top, left: r.left - grid.left, right: r.right - grid.left }; }), width: grid.width };
    });
    expect(dimensions.height).toBeCloseTo(170 * 96 / 25.4, 0);
    expect(dimensions.width).toBeCloseTo(281 * 96 / 25.4, 0);
    expect(dimensions.overflow).toBe("visible"); expect(dimensions.background).toBe("rgb(255, 255, 255)");
    expect(dimensions.blocks.every(b => b.top >= 0 && b.bottom <= dimensions.height + 1 && b.left >= 0 && b.right <= dimensions.width + 1)).toBe(true);
    const pdf = await page.pdf({ path: testInfo.outputPath("week.pdf"), preferCSSPageSize: true, printBackground: true });
    const source = pdf.toString("latin1");
    expect(source.match(/\/Type \/Page\b/g)).toHaveLength(1);
    const size = source.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/)!;
    expect(Number(size[1])).toBeCloseTo(842, -1); expect(Number(size[2])).toBeCloseTo(595, -1);
    await page.setViewportSize({ width: 1123, height: 900 });
    await page.screenshot({ path: testInfo.outputPath("print-preview.png"), fullPage: true });
    await page.emulateMedia({ media: "screen" });
    await expect(page.getByRole("dialog", { name: "Editar actividad" })).toBeVisible();
  });
}

for (const width of [320, 1280]) {
test(`empty print week produces one A4 landscape page and follows the active week at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await seedActivities(page, []); await gotoApp(page);
  await page.getByRole("button", { name: "Mis semanas" }).click();
  await page.getByRole("button", { name: "Nueva semana" }).click();
  await page.getByLabel("Nombre de la semana").fill("Printable active week");
  await page.getByRole("button", { name: "Crear semana" }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-title h2")).toHaveText("Printable active week");
  await expect(page.locator(".print-days strong")).toHaveCount(7);
  await expect(page.locator(".print-hour").first()).toHaveText("08:00");
  await expect(page.locator(".print-hour").last()).toHaveText("20:00");
  const pdf = await page.pdf({ preferCSSPageSize: true });
  const source = pdf.toString("latin1");
  expect(source.match(/\/Type \/Page\b/g)).toHaveLength(1);
  const size = source.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/)!;
  expect(Number(size[1])).toBeCloseTo(842, -1); expect(Number(size[2])).toBeCloseTo(595, -1);
});

test(`print trims unused whole hours and keeps feasible segment details at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await seedActivities(page, [{ ...study, start: 555, segments: [{ id: "reading", name: "Reading", start: 30, duration: 60 }] }, { ...study, id: "overlap", name: "Overlap", start: 600, duration: 60, color: "#f87171" }]);
  await gotoApp(page); await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-hour").first()).toHaveText("09:00");
  await expect(page.locator(".print-hour").last()).toHaveText("14:00");
  await expect(page.locator('[data-print-activity="study"]')).toContainText("09:15–13:15");
  await expect(page.locator(".print-segment")).toHaveText("Reading · 09:45");
  const studyBox = (await page.locator('[data-print-activity="study"]').boundingBox())!;
  const overlapBox = (await page.locator('[data-print-activity="overlap"]').boundingBox())!;
  expect(studyBox.x + studyBox.width).toBeLessThanOrEqual(overlapBox.x + 1);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
});
}

test("mini timeline keeps titles clear, exposes full details and retains move and resize gestures", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1800 });
  const segments = [{ id: "large", name: "Large", start: 0, duration: 120 }, { id: "tiny", name: "Tiny", start: 150, duration: 5 }];
  await seedActivities(page, [{ ...study, segments }]); await gotoApp(page);
  const parent = block(page, "Study"); const large = parent.locator('[data-segment-id="large"]'); const tiny = parent.locator('[data-segment-id="tiny"]');
  await expect(large).toHaveAttribute("title", "Large: 09:00 · 2h");
  await expect(tiny).toHaveAttribute("title", "Tiny: 11:30 · 5m");
  await expect(parent.locator(".segment-label, .segment-band")).toHaveCount(0);
  await expect(parent).toHaveAccessibleDescription("Large: 09:00 · 2h; Tiny: 11:30 · 5m");
  const rail = (await parent.locator(".segment-timeline").boundingBox())!;
  const heading = (await parent.locator(".activity-heading").first().boundingBox())!;
  const big = (await large.boundingBox())!; const small = (await tiny.boundingBox())!;
  expect(rail.width).toBe(10); expect(rail.x).toBeGreaterThanOrEqual(heading.x + heading.width);
  expect(big.y).toBeCloseTo(rail.y, 1); expect(big.height / rail.height).toBeCloseTo(.5, 2);
  expect((small.y - rail.y) / rail.height).toBeCloseTo(150 / 240, 2);
  expect(small.height / rail.height).toBeCloseTo(5 / 240, 2);
  expect(small.y).toBeGreaterThan(big.y + big.height);
  expect(await large.evaluate(el => getComputedStyle(el).pointerEvents)).toBe("auto");
  await large.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Large: 09:00 · 2h");
  expect(await page.getByRole("tooltip").evaluate(el => el.parentElement === document.body)).toBe(true);
  await tiny.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Tiny: 11:30 · 5m");
  const borders = await large.evaluate(el => {
    const style = getComputedStyle(el);
    return { top: style.borderTopColor, bottom: style.borderBottomColor, background: style.backgroundColor, topWidth: style.borderTopWidth, bottomWidth: style.borderBottomWidth };
  });
  expect(borders.topWidth).toBe("1px"); expect(borders.bottomWidth).toBe("1px");
  expect(borders.top).toBe(borders.bottom); expect(borders.top).not.toBe(borders.background);
  // Resolve modern CSS color syntax through canvas before comparing luminance.
  const darkness = await large.evaluate(el => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const luminance = (color: string) => {
      context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return .2126 * r + .7152 * g + .0722 * b;
    };
    const style = getComputedStyle(el);
    return { edge: luminance(style.borderTopColor), fill: luminance(style.backgroundColor) };
  });
  expect(darkness.edge).toBeLessThan(darkness.fill);
  await page.keyboard.press("Escape");
  await parent.focus();
  await expect(page.getByRole("tooltip")).toContainText("Large: 09:00 · 2h; Tiny: 11:30 · 5m");
  await page.keyboard.press("Escape"); await expect(page.getByRole("tooltip")).toHaveCount(0);
  await parent.blur();
  const tone = await large.evaluate(el => getComputedStyle(el).backgroundColor);
  await page.reload(); await expect(large).toBeVisible();
  expect(await large.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(tone);
  const markBox = (await large.boundingBox())!;
  const x = markBox.x + markBox.width / 2; const y = markBox.y + markBox.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y + 24, { steps: 4 });
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.mouse.up();
  await expect.poll(async () => (await readStore(page)).plans[0].activities[0].start).toBe(570);
  expect((await readStore(page)).plans[0].activities[0].segments).toEqual(segments);
  const box = (await parent.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 22, { steps: 4 }); await page.mouse.up();
  await expect.poll(async () => (await readStore(page)).plans[0].activities[0].duration).toBe(270);
  expect((await readStore(page)).plans[0].activities[0].segments).toEqual(segments);
  await page.setViewportSize({ width: 320, height: 1800 });
  await expect(large).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await parent.click(); await expect(page.getByRole("dialog", { name: "Editar actividad" })).toBeVisible();
  await page.getByRole("button", { name: /Abrir calendario de segmentos/ }).click();
  await expect(page.getByRole("button", { name: /^Large,/ })).toBeVisible();
});

test("adjacent segments have distinct endpoints and immediate individual tooltips", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedActivities(page, [{ ...study, segments: [{ id: "first", name: "First", start: 0, duration: 60 }, { id: "next", name: "Next", start: 60, duration: 60 }] }]);
  await gotoApp(page);
  const parent = block(page, "Study");
  const first = parent.locator('[data-segment-id="first"]'); const next = parent.locator('[data-segment-id="next"]');
  const a = (await first.boundingBox())!; const b = (await next.boundingBox())!;
  expect(a.y + a.height).toBeCloseTo(b.y, 1);
  await first.hover(); await expect(page.getByRole("tooltip")).toHaveText("First: 09:00 · 1h");
  await next.hover(); await expect(page.getByRole("tooltip")).toHaveText("Next: 10:00 · 1h");
  expect(await next.evaluate(el => getComputedStyle(el).borderTopStyle)).toBe("solid");
  expect(await first.evaluate(el => getComputedStyle(el).borderBottomStyle)).toBe("solid");
  await page.locator(".scrollbar").evaluate(el => { el.scrollTop = 400; });
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(parent.locator("button")).toHaveCount(0);
});

test("touching a timeline segment opens parent details and keeps the segment calendar usable", async ({ browser }) => {
  const page = await browser.newPage({ baseURL: "http://localhost:3000", viewport: { width: 390, height: 1800 }, isMobile: true, hasTouch: true });
  try {
    await seedActivities(page, [{ ...study, segments: [{ id: "touch", name: "Touch detail", start: 60, duration: 60 }] }]);
    await gotoApp(page);
    await block(page, "Study").locator('[data-segment-id="touch"]').tap();
    await expect(page.getByRole("dialog", { name: "Editar actividad" })).toBeVisible();
    await page.getByRole("button", { name: /Abrir calendario de segmentos/ }).tap();
    await expect(page.getByRole("button", { name: /^Touch detail,/ })).toBeVisible();
  } finally { await page.close(); }
});

test("overlapping timeline marks use tiny lanes, gaps remain empty, and midnight portions clip exactly", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1800 });
  const night = { ...study, start: 1380, duration: 180, segments: [{ id: "cross", name: "Cross", start: 30, duration: 60 }, { id: "overlap", name: "Overlap", start: 45, duration: 30 }, { id: "later", name: "Later", start: 120, duration: 30 }] };
  await seedActivities(page, [night]); await gotoApp(page);
  const first = block(page, /^Study, 23:00/); const second = block(page, /^Study, 00:00/);
  const cross = (await first.locator('[data-segment-id="cross"]').boundingBox())!;
  const overlap = (await first.locator('[data-segment-id="overlap"]').boundingBox())!;
  const firstRail = (await first.locator(".segment-timeline").boundingBox())!;
  expect(cross.width).toBe(5); expect(overlap.width).toBe(5);
  expect(cross.x + cross.width).toBeLessThanOrEqual(overlap.x + 1);
  expect(cross.height / firstRail.height).toBeCloseTo(.5, 2); expect(overlap.height / firstRail.height).toBeCloseTo(.25, 2);
  const continuation = (await second.locator('[data-segment-id="cross"]').boundingBox())!;
  const rail = (await second.locator(".segment-timeline").boundingBox())!;
  expect(continuation.y).toBeCloseTo(rail.y, 1); expect(continuation.height / rail.height).toBeCloseTo(.25, 2);
  const later = (await second.locator('[data-segment-id="later"]').boundingBox())!;
  expect((later.y - rail.y) / rail.height).toBeCloseTo(.5, 2); expect(later.y).toBeGreaterThan(continuation.y + continuation.height);
  await expect(first.locator('[data-segment-id="later"]')).toBeHidden();
  await expect(second.locator('[data-segment-id="cross"]')).toHaveAttribute("title", "Cross: 23:30 · 1h");
});

for (const width of [320, 1280]) {
  test(`minimal activity keeps the timeline inside its block and away from its title at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1800 });
    await seedActivities(page, [{ ...study, duration: 15, segments: [{ id: "short", name: "Short", start: 0, duration: 15 }] }]); await gotoApp(page);
    const parent = block(page, "Study");
    const box = (await parent.boundingBox())!; const rail = (await parent.locator(".segment-timeline").boundingBox())!;
    const heading = (await parent.locator(".activity-heading").boundingBox())!;
    expect(box.height).toBe(18); expect(rail.width).toBe(10);
    expect(rail.y).toBeGreaterThan(box.y); expect(rail.y + rail.height).toBeLessThan(box.y + box.height);
    expect(heading.x + heading.width).toBeLessThanOrEqual(rail.x);
    expect(heading.y).toBeGreaterThanOrEqual(box.y); expect(heading.y + heading.height).toBeLessThanOrEqual(box.y + box.height);
    await expect(parent).toHaveAccessibleDescription("Short: 09:00 · 15m");
    await parent.click(); await expect(page.getByRole("dialog", { name: "Editar actividad" })).toBeVisible();
  });
}
