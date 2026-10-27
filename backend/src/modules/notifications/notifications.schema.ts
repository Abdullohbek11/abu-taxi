import { z } from 'zod';
import { cursorQuery } from '../../lib/pagination.js';

export const listNotificationsQuery = cursorQuery.extend({
  unread: z.enum(['true', 'false']).transform((v) => v === 'true').default('false'),
});

export const notificationIdParams = z.object({ id: z.string().min(1).max(40) });
