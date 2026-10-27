import { prisma } from '../../lib/prisma.js';

export const citiesService = {
  list() {
    return prisma.city.findMany({
      orderBy: [{ region: 'asc' }, { nameUz: 'asc' }],
      select: { id: true, nameUz: true, nameRu: true, region: true },
    });
  },
};
