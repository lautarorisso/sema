export type Category = "Sleep" | "Health" | "Learning" | "Life";
export type Activity = {
  id: string;
  name: string;
  category: Category;
  day: number;
  start: number;
  duration: number;
  color: string;
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
  hintDismissed: boolean;
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
  objective: "daily" | "weekly";
  min: number;
  target: number;
  max: number;
  unit: string;
  guidance: "Evidence-based" | "Evidence-informed" | "Practical";
  why: string;
};
