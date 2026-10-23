import { api } from './api';

export interface Faq {
  id: string;
  question: string | null;
  answer: string | null;
}

export const FaqService = {
  /** Public: no sign-in needed. Admins manage the list from the dashboard. */
  list: async (): Promise<Faq[]> => {
    const res = await api.get<{ success: boolean; data?: Faq[]; message?: string }>('/faq');
    // the endpoint answers 200 with success: false when it fails
    if (res.data?.success === false) throw new Error(res.data.message || 'Could not load FAQs');
    return (res.data?.data ?? []).filter((f) => f.question?.trim());
  },
};
