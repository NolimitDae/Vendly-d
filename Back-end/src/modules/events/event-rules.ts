import { BadRequestException } from '@nestjs/common';

export const COMPLETED_CANT_CANCEL = "This event is already completed, so it can't be cancelled.";
export const CANCELLED_READ_ONLY = "This event was cancelled, so it can't be changed. You can still view everything on it.";

export const CANCELLED_NO_BOOKINGS = "This event was cancelled, so vendors can't be booked for it.";

/** A cancelled event is read-only: tasks, budget, run of show, files, invites and bookings can't change. */
export function assertNotCancelled(event: { status: string | null }, message = CANCELLED_READ_ONLY) {
  if (event.status === 'CANCELLED') throw new BadRequestException(message);
}
