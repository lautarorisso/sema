import type { Activity, Definition, Locale, Store } from "./types";

export const DAYS = {
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  es: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"],
} satisfies Record<Locale, string[]>;
export const SHORT_DAYS = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  es: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
} satisfies Record<Locale, string[]>;
export const DEFINITIONS: Definition[] = [
  { name: "Sleep", category: "Health", min: 420, target: 480, max: 540, unit: "per night", guidance: "Evidence-based", why: "Most adults benefit from at least 7 hours of sleep." },
  { name: "Exercise", category: "Health", min: 75, target: 150, max: 300, unit: "per week", guidance: "Evidence-based", why: "Based on widely used adult physical activity guidance." },
  { name: "Study", category: "Learning", min: 120, target: 300, max: 600, unit: "per week", guidance: "Evidence-informed", why: "Distributed sessions support retrieval and reduce fatigue." },
  { name: "Deep work", category: "Responsibilities", min: 180, target: 420, max: 720, unit: "per week", guidance: "Practical", why: "Protected focus blocks create room for demanding work." },
  { name: "Admin", category: "Responsibilities", min: 30, target: 90, max: 180, unit: "per week", guidance: "Practical", why: "Batching small tasks can reduce context switching." },
  { name: "Friends & family", category: "Life", min: 60, target: 180, max: 420, unit: "per week", guidance: "Evidence-informed", why: "Regular social connection is associated with wellbeing." },
  { name: "Creative time", category: "Life", min: 45, target: 120, max: 300, unit: "per week", guidance: "Practical", why: "Creative time restores attention and makes space for curiosity." },
];
const a = (id: string, name: string, category: Activity["category"], day: number, start: number, duration: number, source: Activity["source"] = "custom"): Activity => ({ id, name, category, day, start, duration, source });
export const DEMO: Store = {
  version: 2,
  activePlanId: "demo",
  templates: [],
  preferences: { density: "comfortable", showSleep: true, hintDismissed: false, locale: "en" },
  plans: [{ id: "demo", name: "A balanced week", weekOf: "Aug 17, 2026", activities: [
    ...Array.from({ length: 7 }, (_, d) => a(`sleep-${d}`, "Sleep", "Health", d, 0, 7 * 60, "predefined")),
    ...Array.from({ length: 7 }, (_, d) => a(`sleep-pm-${d}`, "Sleep", "Health", d, 23 * 60, 60, "predefined")),
    a("mon-focus", "Deep work", "Responsibilities", 0, 9 * 60, 120, "predefined"),
    a("mon-study", "Study", "Learning", 0, 14 * 60, 90, "predefined"),
    a("tue-ex", "Exercise", "Health", 1, 7 * 60 + 30, 45, "predefined"),
    a("tue-admin", "Admin", "Responsibilities", 1, 10 * 60, 90, "predefined"),
    a("wed-focus", "Deep work", "Responsibilities", 2, 9 * 60, 150, "predefined"),
    a("wed-social", "Friends & family", "Life", 2, 18 * 60, 120, "predefined"),
    a("thu-study", "Study", "Learning", 3, 13 * 60, 120, "predefined"),
    a("fri-focus", "Deep work", "Responsibilities", 4, 9 * 60, 120, "predefined"),
    a("sat-create", "Creative time", "Life", 5, 11 * 60, 120, "predefined"),
    a("sun-social", "Friends & family", "Life", 6, 16 * 60, 120, "predefined"),
  ] }],
};
