import { api } from './api';

export interface VendorReview {
  id: string;
  rating: number;
  comment?: string | null;
  reply?: string | null;
  created_at: string;
  author: { id: string; name: string | null; avatar_url: string | null } | null;
  listing: { id: string; title: string } | null;
}

export interface VendorReviewsMeta {
  total: number;
  page: number;
  limit: number;
  last_page: number;
  avg_rating: number | null;
  /** reviews without a reply yet */
  unanswered: number;
}

export const ReviewService = {
  /** The signed-in vendor's own reviews, newest first. */
  mine: (params?: { page?: number; limit?: number }) =>
    api.get<{ success: boolean; data: VendorReview[]; meta: VendorReviewsMeta }>('/reviews/my', { params }),

  /** A public reply under the review (one per review). */
  reply: (reviewId: string, reply: string) => api.patch<{ success: boolean; data: VendorReview }>(`/reviews/${reviewId}/reply`, { reply }),
};
