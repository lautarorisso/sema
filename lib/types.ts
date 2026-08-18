export type Category = "Health" | "Learning" | "Responsibilities" | "Life";
export type Locale = "en" | "es";
export type Activity = {
  id: string;
  name: string;
  category: Category;
  day: number;
  start: number;
  duration: number;
  completed?: boolean;
  source?: "predefined" | "custom";
};
export type Plan = {
  id: string;
  name: string;
  weekOf: string;
  activities: Activity[];
  archived?: boolean;
};
export type Preferences = {
  density: "compact" | "comfortable" | "detailed";
  showSleep: boolean;
  hintDismissed: boolean;
  locale: Locale;
};
export type Store = {
  version: 2;
  plans: Plan[];
  activePlanId: string;
  templates: Plan[];
  preferences: Preferences;
};
export type Definition = {
  name: string;
  category: Category;
  min: number;
  target: number;
  max: number;
  unit: string;
  guidance: "Evidence-based" | "Evidence-informed" | "Practical";
  why: string;
};
