import type { Activity, Definition, Store } from "./types";

export const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const SHORT_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const DEFINITIONS: Definition[] = [
  { name: "Sleep", category: "Sleep", objective: "daily", min: 420, target: 480, max: 540, unit: "por noche", guidance: "Evidence-based", why: "7–9 horas consolidan memoria, regulan hormonas y refuerzan defensas. NSF 2026 reafirmado con 133 meta-análisis. Tanto dormir de más como de menos aumenta mortalidad (curva en U)." },
  { name: "Exercise", category: "Health", objective: "weekly", min: 75, target: 150, max: 450, unit: "por semana", guidance: "Evidence-based", why: "OMS 2024: 150–300 min moderada o 75–150 min vigorosa por semana. Beneficios continúan hasta 600 min. Inactividad vinculada al 31% de adultos insuficientemente activos." },
  { name: "Friends & family", category: "Life", objective: "weekly", min: 60, target: 180, max: 420, unit: "por semana", guidance: "Evidence-based", why: "7–21 horas semanales de contacto social reducen soledad y mortalidad un 29% (Holt-Lunstad et al. 2010, 2015). Valores aquí reflejan tiempo social dedicado — la interacción incidental durante trabajo/gimnasio/estudio es adicional." },
  { name: "Creative time", category: "Life", objective: "weekly", min: 45, target: 120, max: 300, unit: "por semana", guidance: "Practical", why: "Teoría de Restauración de Atención (Kaplan 1995): la expresión creativa restaura el foco agotado por atención sostenida. Tiempo creativo regular reduce fatiga cognitiva." },
  { name: "Lectura", category: "Learning", objective: "weekly", min: 60, target: 180, max: 420, unit: "por semana", guidance: "Evidence-informed", why: "Wilson et al. 2002: estimulación cognitiva frecuente reduce riesgo de demencia. La lectura regular se asocia con menor deterioro de memoria en mayores de 65. Beneficios acumulativos con el tiempo." },
];
const a = (id: string, name: string, category: Activity["category"], day: number, start: number, duration: number, color: string, source: Activity["source"] = "custom"): Activity => ({ id, name, category, day, start, duration, color, source });
export const DEMO: Store = {
  version: 2,
  activePlanId: "demo",
  templates: [],
  preferences: { hintDismissed: false },
  plans: [{ id: "demo", name: "Una semana equilibrada", weekOf: "Ago 17, 2026", activities: [
    ...Array.from({ length: 7 }, (_, d) => a(`sleep-${d}`, "Sleep", "Sleep", d, 0, 8 * 60, "#818cf8", "predefined")),
    a("lun-estudio", "Lectura", "Learning", 0, 14 * 60, 90, "#e0af52", "predefined"),
    a("mar-ejercicio", "Exercise", "Health", 1, 7 * 60 + 30, 45, "#71d49e", "predefined"),
    a("mar-social", "Friends & family", "Life", 1, 18 * 60, 120, "#e47b70", "predefined"),
    a("mie-estudio", "Lectura", "Learning", 2, 9 * 60, 120, "#e0af52", "predefined"),
    a("jue-ejercicio", "Exercise", "Health", 3, 7 * 60 + 30, 60, "#71d49e", "predefined"),
    a("vie-social", "Friends & family", "Life", 4, 18 * 60, 90, "#e47b70", "predefined"),
    a("sab-creativa", "Creative time", "Life", 5, 11 * 60, 120, "#f472b6", "predefined"),
    a("dom-lectura", "Lectura", "Learning", 6, 16 * 60, 60, "#e0af52", "predefined"),
  ] }],
};
