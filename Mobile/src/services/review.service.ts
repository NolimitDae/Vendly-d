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

/** One completed booking on a planner's event, with the planner's review once they leave it. */
export interface EventVendorReview {
  booking_id: string;
  completed_at: string | null;
  listing: { id: string; title: string; category: string | null; image: string | null } | null;
  vendor: { id: string; name: string; avatar_url: string | null };
  review: { id: string; rating: number; comment: string | null; created_at: string } | null;
}

export interface EventVendorReviews {
  event: { id: string; name: string; status: string };
  items: EventVendorReview[];
  /** completed bookings not rated yet */
  to_rate: number;
}

export const ReviewService = {
  /** "Rate your vendors": completed bookings on one of the planner's events, rated or not. */
  forEvent: (eventId: string) => api.get<{ success: boolean; data: EventVendorReviews }>(`/events/${eventId}/vendor-reviews`),

  /** One review per completed booking, by the booking's customer. */
  create: (body: { booking_id: string; rating: number; comment?: string }) =>
    api.post<{ success: boolean; data: { id: string; created_at: string } }>('/reviews', body),

  /** The signed-in vendor's own reviews, newest first. */
  mine: (params?: { page?: number; limit?: number }) =>
    api.get<{ success: boolean; data: VendorReview[]; meta: VendorReviewsMeta }>('/reviews/my', { params }),

  /** A public reply under the review (one per review). */
  reply: (reviewId: string, reply: string) => api.patch<{ success: boolean; data: VendorReview }>(`/reviews/${reviewId}/reply`, { reply }),
};
