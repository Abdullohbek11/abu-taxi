import type { BookingStatus } from '@prisma/client';
import type { Transitions } from '../../lib/stateMachine.js';

export const BOOKING_TRANSITIONS: Transitions<BookingStatus> = {
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED', 'COMPLETED'],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};

/** O'rin egallab turgan band qilishlar. */
export const SEAT_HOLDING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED'];
