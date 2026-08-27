export type Activity = {
  id: string;
  name: string;
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
  preferences: Preferences;
};