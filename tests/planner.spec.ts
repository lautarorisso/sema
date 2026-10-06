import { test, expect } from "@playwright/test";
import { block, createActivity, dayChip, gotoApp, openNewActivityDialog, readStore, saveActivityDialog, setDays } from "./helpers";

test("add activity creates a block on the grid", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });

  await expect(block(page, "Reunión")).toHaveCount(1);
  const store = await readStore(page);
  expect(store.plans[0].activities).toHaveLength(1);
  expect(store.plans[0].activities[0]).toMatchObject({ name: "Reunión", day: 0, start: 540, duration: 60 });
});

test("clicking a block without dragging opens the edit dialog", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });

  await block(page, "Reunión").click();
  await expect(page.getByRole("heading", { name: "Editar actividad" })).toBeVisible();
  await expect(page.getByLabel(/Nombre/)).toHaveValue("Reunión");
});

test("editing an activity name persists after reload", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });

  await block(page, "Reunión").click();
  await page.getByLabel(/Nombre/).fill("Sprint");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("heading", { name: "Editar actividad" })).toBeHidden();

  // The store is updated immediately…
  const store = await readStore(page);
  expect(store.plans[0].activities[0].name).toBe("Sprint");

  // …and after a reload the block reflects the new name. (Before a reload the
  // rendered block stays stale — see the rename fixme in regressions.spec.ts.)
  await page.reload();
  await expect(block(page, "Sprint")).toBeVisible();
});

test("activities persist across reload via localStorage", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });

  await page.reload();
  await expect(block(page, "Reunión")).toBeVisible();

  const store = await readStore(page);
  expect(store.version).toBe(2);
  expect(store.plans[0].activities[0].name).toBe("Reunión");
});

test("day multi-select creates one block per selected day", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión", days: ["Lun", "Mié", "Vie"] });

  await expect(block(page, "Reunión")).toHaveCount(3);
  const store = await readStore(page);
  expect(store.plans[0].activities.map((a) => a.day).sort()).toEqual([0, 2, 4]);
});

test("save is disabled when no day is selected, enabled again after picking one", async ({ page }) => {
  await gotoApp(page);
  await openNewActivityDialog(page);
  await page.getByLabel(/Nombre/).fill("Sola");

  await setDays(page, []);
  await expect(page.getByRole("button", { name: "Guardar" })).toBeDisabled();

  await dayChip(page, "Lun").click();
  await expect(page.getByRole("button", { name: "Guardar" })).toBeEnabled();
  await saveActivityDialog(page);
  await expect(block(page, "Sola")).toHaveCount(1);
});

test("new week (blank) becomes active and is listed in the dropdown", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });

  await page.getByRole("button", { name: "Mis semanas" }).click();
  await page.getByRole("button", { name: "Nueva semana" }).click();
  await expect(page.getByRole("heading", { name: "Nueva semana" })).toBeVisible();
  await page.getByLabel(/Nombre de la semana/).fill("Vacaciones");
  await page.getByRole("button", { name: "Semana vacía" }).click();
  await page.getByRole("button", { name: "Crear semana" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Vacaciones");
  await expect(block(page, "Reunión")).toHaveCount(0);

  await page.getByRole("button", { name: "Mis semanas" }).click();
  await expect(page.getByRole("button", { name: /Mi semana/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Vacaciones/ })).toBeVisible();
});

test("switching weeks via the dropdown restores the other week's content", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });

  await page.getByRole("button", { name: "Mis semanas" }).click();
  await page.getByRole("button", { name: "Nueva semana" }).click();
  await page.getByLabel(/Nombre de la semana/).fill("Vacaciones");
  await page.getByRole("button", { name: "Crear semana" }).click();

  await page.getByRole("button", { name: "Mis semanas" }).click();
  await page.getByRole("button", { name: /Mi semana/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mi semana");
  await expect(block(page, "Reunión")).toBeVisible();
  await expect(block(page, "Reunión")).toHaveCount(1);
});

test("new week (copy current) duplicates activities", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });

  await page.getByRole("button", { name: "Mis semanas" }).click();
  await page.getByRole("button", { name: "Nueva semana" }).click();
  await page.getByLabel(/Nombre de la semana/).fill("Copia");
  await page.getByRole("button", { name: "Copiar semana actual" }).click();
  await page.getByRole("button", { name: "Crear semana" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Copia");
  await expect(block(page, "Reunión")).toHaveCount(1);

  const store = await readStore(page);
  expect(store.plans).toHaveLength(2);
  expect(store.plans[1].activities).toHaveLength(1);
});

test("deleting a week from the dropdown asks for confirmation and switches active plan", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });

  await page.getByRole("button", { name: "Mis semanas" }).click();
  await page.getByRole("button", { name: "Nueva semana" }).click();
  await page.getByLabel(/Nombre de la semana/).fill("Temp");
  await page.getByRole("button", { name: "Crear semana" }).click();

  await page.getByRole("button", { name: "Mis semanas" }).click();
  const tempRow = page.getByRole("button", { name: /Temp/ }).locator("..");

  let confirmMsg = "";
  page.once("dialog", async (d) => {
    confirmMsg = d.message();
    await d.accept();
  });
  await tempRow.getByRole("button", { name: "Eliminar" }).click();

  expect(confirmMsg).toContain("Temp");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mi semana");
  const store = await readStore(page);
  expect(store.plans).toHaveLength(1);
});

test("renaming a week via the heading input persists after reload", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("heading", { name: "Mi semana" }).click();

  const input = page.getByRole("textbox");
  await input.fill("Plan brutal");
  await input.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plan brutal");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plan brutal");
});

test("delete single activity removes only the clicked block", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });
  await createActivity(page, { name: "Reunión", start: "15:00" });
  await expect(block(page, "Reunión")).toHaveCount(2);

  await block(page, /^Reunión, 09:00/).click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();

  await expect(page.getByRole("button", { name: "Eliminar solo esta" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Eliminar todas/ })).toHaveCount(2);

  await page.getByRole("button", { name: "Eliminar solo esta" }).click();
  await expect(block(page, "Reunión")).toHaveCount(1);
  const store = await readStore(page);
  expect(store.plans[0].activities[0].start).toBe(900); // the 15:00 one survives
});

test("delete variants: Eliminar todas a esta hora removes only same name + start", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" }); // 09:00
  await createActivity(page, { name: "Foco", start: "09:00" });
  await createActivity(page, { name: "Reunión", start: "15:00" });

  await block(page, /^Reunión, 09:00/).click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.getByRole("button", { name: "Eliminar todas a esta hora" }).click();

  await expect(block(page, "Reunión")).toHaveCount(1); // 15:00 remains
  await expect(block(page, "Foco")).toHaveCount(1); // untouched
  const store = await readStore(page);
  expect(store.plans[0].activities.map((a) => a.name).sort()).toEqual(["Foco", "Reunión"]);
});

test("delete variants: Eliminar todas removes every block with that name", async ({ page }) => {
  await gotoApp(page);
  await createActivity(page, { name: "Reunión" });
  await createActivity(page, { name: "Reunión", start: "15:00" });
  await createActivity(page, { name: "Foco" });

  await block(page, /^Reunión, 09:00/).click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.getByRole("button", { name: /^Eliminar todas "Reunión"/ }).click();

  await expect(block(page, "Reunión")).toHaveCount(0);
  await expect(block(page, "Foco")).toHaveCount(1);
});
