import { api } from './api';

export type OnboardingRole = 'CUSTOMER' | 'VENDOR' | 'EVENT_PLANNER';
export type StepState = 'todo' | 'pending' | 'done';

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
  popup: 'intro' | 'complete' | null;
  /** whether the checklist still belongs in notifications */
  visible: boolean;
}

export const OnboardingService = {
  get: () => api.get<{ success: boolean; data: Onboarding | null }>('/onboarding'),
  seen: (kind: 'intro' | 'complete') => api.post('/onboarding/seen', { kind }),
};
