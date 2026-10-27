import type { RideRequestStatus } from '@prisma/client';
import type { Transitions } from '../../lib/stateMachine.js';

export const RIDE_REQUEST_TRANSITIONS: Transitions<RideRequestStatus> = {
  OPEN: ['ASSIGNED', 'CANCELLED', 'EXPIRED'],
  ASSIGNED: ['CANCELLED'],
  CANCELLED: [],
  EXPIRED: [],
};
