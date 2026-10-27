import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { SIGNED_URL_TTL_SEC, storage } from '../../lib/storage.js';

export const documentsService = {
  /**
   * Hujjat uchun 10 daqiqalik havola. Faqat admin yoki hujjat egasi.
   */
  async signedUrl(documentId: string, viewer: { id: string; role: string | null }) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { driver: { select: { userId: true } } },
    });
    if (!doc) throw new AppError('DOCUMENT_NOT_FOUND');
    if (viewer.role !== 'ADMIN' && doc.driver.userId !== viewer.id) throw new AppError('DOCUMENT_NOT_FOUND');

    return {
      id: doc.id,
      type: doc.type,
      status: doc.status,
      url: await storage.signedUrl(doc.fileKey),
      expiresIn: SIGNED_URL_TTL_SEC,
    };
  },
};
