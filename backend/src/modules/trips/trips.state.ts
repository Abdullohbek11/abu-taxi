import type { TripStatus } from '@prisma/client';
import type { Transitions } from '../../lib/stateMachine.js';

export const TRIP_TRANSITIONS: Transitions<TripStatus> = {
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Band qilishni qabul qiladigan (o'rin egallaydigan) holatlar. */
export const ACTIVE_TRIP_STATUSES: TripStatus[] = ['SCHEDULED', 'IN_PROGRESS'];
