import type { CargoStatus, OfferStatus } from '@prisma/client';
import type { Transitions } from '../../lib/stateMachine.js';

export const CARGO_TRANSITIONS: Transitions<CargoStatus> = {
  OPEN: ['MATCHED', 'CANCELLED'],
  MATCHED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const OFFER_TRANSITIONS: Transitions<OfferStatus> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: [],
};
