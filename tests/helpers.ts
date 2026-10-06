import { expect, type Locator, type Page } from "@playwright/test";
import type { Activity, Segment, Store } from "../lib/types";

export const STORE_KEY = "sema-planner-v1";
export const SHORT_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export async function seedActivities(page: Page, activities: (Omit<Activity, "segments"> & { segments?: Segment[] | { name: string; duration: number }[] })[]): Promise<void> {
  const store = {
    version: 2,
    activePlanId: "seed",
    preferences: { hintDismissed: true },
    plans: [{ id: "seed", name: "Focused week", weekOf: "Oct 5, 2026", activities }],
  };
  await page.addInitScript(({ key, store }) => {
    // Seed once so reloads still exercise the app's persisted changes.
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(store));
  }, { key: STORE_KEY, store });
}

/** Locate an activity block button by accessible name (e.g. "Reunión"). */
export function block(page: Page, name: string | RegExp): Locator {
  return page.getByRole("button", {
    name:
      typeof name === "string"
        ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`)
        : name,
  });
}

export async function gotoApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mis semanas" })).toBeVisible();
}

/** Parse the persisted store from localStorage. */
export async function readStore(page: Page): Promise<Store> {
  const raw = await page.evaluate((key: string) => localStorage.getItem(key), STORE_KEY);
  if (!raw) throw new Error("store not found in localStorage");
  return JSON.parse(raw) as Store;
}

export function dayChip(page: Page, day: string): Locator {
  return page.getByRole("button", { name: day, exact: true });
}

export async function openNewActivityDialog(page: Page): Promise<void> {
  const mobile = await page.evaluate(() => matchMedia("(max-width: 767px)").matches);
  await page.locator('div[class*="scrollbar"]').evaluate(el => { el.scrollTop = 300; });
  const columns = page.locator('div[class*="md:top-14"] > div.grid > div');
  const column = mobile ? columns.filter({ visible: true }).first() : columns.first();
  const box = (await column.boundingBox())!;
  const x = box.x + 2;
  const y = box.y + 432;
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (mobile) await page.waitForTimeout(350);
  else await page.mouse.move(x + 12, y);
  await page.mouse.move(x + 12, y + 48, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "Nueva actividad" })).toBeVisible();
}

/** Toggle the day multi-select chips so exactly `days` are pressed. */
export async function setDays(page: Page, days: readonly string[]): Promise<void> {
  for (const d of SHORT_DAYS) {
    const chip = dayChip(page, d);
    const pressed = (await chip.getAttribute("aria-pressed")) === "true";
    const want = days.includes(d);
    if (pressed !== want) await chip.click();
  }
  if (days.length > 0) {
    await expect(page.getByRole("button", { name: "Guardar" })).toBeEnabled();
  }
}

export async function fillActivityDialog(
  page: Page,
  opts: { name?: string; days?: readonly string[]; start?: string; duration?: number } = {},
): Promise<void> {
  if (opts.name !== undefined) await page.getByLabel(/Nombre/).fill(opts.name);
  if (opts.days !== undefined) await setDays(page, opts.days);
  if (opts.duration !== undefined) await page.getByLabel(/Duración/).fill(String(opts.duration));
  if (opts.start !== undefined) {
    // The start button's accessible name is "Inicio" (a wrapping <label> contributes
    // the name; the visible time is only its text content).
    await page.getByRole("button", { name: "Inicio", exact: true }).click();
    const input = page.locator('input[type="time"]');
    await input.fill(opts.start);
    // Tab only cycles the native hour/minute segments and never leaves the input.
    // blur() triggers onBlur, which commits the time editor back to the button.
    await input.evaluate((el) => (el as HTMLInputElement).blur());
    await expect(page.getByRole("button", { name: "Inicio", exact: true })).toContainText(opts.start);
  }
}

export async function saveActivityDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("heading", { name: "Nueva actividad" })).toBeHidden();
}

export async function createActivity(
  page: Page,
  opts: { name: string; days?: readonly string[]; start?: string; duration?: number },
): Promise<void> {
  await openNewActivityDialog(page);
  await fillActivityDialog(page, opts);
  await saveActivityDialog(page);
}

/**
 * Custom pointer drag: down, N interpolated moves with small delays, up.
 * Explicit mouse events exercise the app's pointer capture, thresholds and snapping.
 */
export async function dragBy(page: Page, locator: Locator, dx: number, dy: number, steps = 6): Promise<void> {
  const box = (await locator.boundingBox())!;
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + (dx * i) / steps, sy + (dy * i) / steps, { steps: 1 });
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}
