import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const auth = () => ({ headers: { Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` } });

export type OnboardingRole = "CUSTOMER" | "VENDOR" | "EVENT_PLANNER";
export type StepState = "todo" | "pending" | "done";

export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  state: StepState;
  note?: string;
}

export interface Onboarding {
  role: OnboardingRole;
  steps: OnboardingStep[];
  completed: number;
  total: number;
  complete: boolean;
  /** which popup to show now, if any */
  popup: "intro" | "complete" | null;
  /** whether the checklist still belongs in notifications */
  visible: boolean;
}

/** The "get set up" checklist for the role in use. */
export const OnboardingService = {
  get: async () => Fetch.get("/onboarding", auth()),
  seen: async (kind: "intro" | "complete") => Fetch.post("/onboarding/seen", { kind }, auth()),
};
