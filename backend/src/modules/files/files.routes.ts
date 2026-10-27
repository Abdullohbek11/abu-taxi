import path from 'node:path';
import express, { Router, type Request, type Response } from 'express';
import { AppError } from '../../lib/errors.js';
import { localRoot, safePath, verifyPrivateLink } from '../../lib/storage.js';

/**
 * Lokal saqlash (STORAGE_DRIVER=local) uchun fayllarni tarqatish.
 *  - /uploads/<kalit>        — public (avatar, mashina va yuk rasmlari), uzoq keshlanadi;
 *  - /files/private/<kalit>  — haydovchi hujjatlari, faqat 10 daqiqalik imzolangan havola bilan.
 */
export function filesRouter(): Router {
  const router = Router();

  router.use(
    '/uploads',
    express.static(path.join(localRoot(), 'public'), {
      index: false,
      dotfiles: 'deny',
      immutable: true,
      maxAge: '365d',
      fallthrough: false,
    }),
  );

  router.get('/files/private/*key', (req: Request, res: Response) => {
    const key = ([] as string[]).concat(req.params.key as unknown as string[]).join('/');
    const { exp, sig } = req.query as { exp?: string; sig?: string };
    const full = safePath('private', key);
    if (!full || !exp || !sig || !verifyPrivateLink(key, exp, sig)) throw new AppError('FORBIDDEN');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(full, (err) => {
      if (err && !res.headersSent) res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    });
  });

  return router;
}
