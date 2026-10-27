import { z } from 'zod';

import { personName } from '../../lib/validators.js';

export const registerDriverBody = z.object({ firstName: personName, lastName: personName }).strict();

export const uploadDocumentBody = z.object({ type: z.enum(['LICENSE', 'TECH_PASSPORT', 'CAR_PHOTO']) });
