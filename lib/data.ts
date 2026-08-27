import type { Activity, Store } from "./types";

export const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const SHORT_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export const emptyStore = (): Store => ({
  version: 2,
  activePlanId: "first",
  preferences: { hintDismissed: false },
  plans: [{ id: "first", name: "Mi semana", weekOf: new Date().toLocaleDateString("es-AR", { month: "short", day: "numeric", year: "numeric" }), activities: [] as Activity[] }],
});