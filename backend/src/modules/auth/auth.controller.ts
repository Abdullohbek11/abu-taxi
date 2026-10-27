import type { CookieOptions, Request, Response } from 'express';
import { env, isProd } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { REFRESH_TTL_SEC } from '../../lib/jwt.js';
import { ok } from '../../lib/response.js';
import { currentUser } from '../../middlewares/auth.js';
import { input } from '../../middlewares/validate.js';
import { adminLoginBody, loginCodeBody, refreshBody } from './auth.schema.js';
import { adminAuthService } from './adminAuth.service.js';
import { authService, type SessionResult } from './auth.service.js';

export const REFRESH_COOKIE = 'refresh_token';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd || env.COOKIE_SAMESITE === 'none',
  sameSite: env.COOKIE_SAMESITE,
  domain: env.COOKIE_DOMAIN,
  path: '/api/v1/auth',
  maxAge: REFRESH_TTL_SEC * 1000,
};
const clearOptions: CookieOptions = { ...cookieOptions, maxAge: undefined };

/**
 * Refresh token body'da faqat haqiqiy mobil klientga qaytariladi.
 * Brauzer har doim `Origin` yuboradi va cookie'dan foydalanadi — aks holda XSS orqali
 * `X-Client: mobile` bilan httpOnly cookie'dagi uzoq muddatli token o'g'irlanishi mumkin edi.
 */
function isMobileClient(req: Request): boolean {
  return req.headers['x-client'] === 'mobile' && !req.headers.origin && !req.cookies?.[REFRESH_COOKIE];
}

function sendSession(req: Request, res: Response, session: SessionResult, mobile = isMobileClient(req)) {
  if (!mobile) res.cookie(REFRESH_COOKIE, session.refreshToken, cookieOptions);
  return ok(res, {
    accessToken: session.accessToken,
    user: session.user,
    isNew: session.isNew,
    ...(mobile ? { refreshToken: session.refreshToken } : {}),
  });
}

/** Cookie (brauzer) yoki body (mobil). Qaysi manbadan kelgani javob shaklini belgilaydi. */
function readRefreshToken(req: Request): { token?: string; fromBody: boolean } {
  const cookie = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (cookie) return { token: cookie, fromBody: false };
  const body = input(req, 'body', refreshBody);
  return { token: body?.refreshToken, fromBody: !!body?.refreshToken && !req.headers.origin };
}

export const authController = {
  /** POST /auth/code — botdan olingan kod bilan kirish (ro'yxatdan o'tish ham shu: hisob bot tomonidan yaratiladi). */
  async loginWithCode(req: Request, res: Response) {
    const { code } = input(req, 'body', loginCodeBody);
    return sendSession(req, res, await authService.loginWithCode(code, req.ip, req.headers['user-agent']));
  },

  /** POST /auth/admin/login — faqat ADMIN, parol bilan (oddiy foydalanuvchilar uchun parol yo'q). */
  async adminLogin(req: Request, res: Response) {
    const { login, password } = input(req, 'body', adminLoginBody);
    return sendSession(req, res, await adminAuthService.login(login, password, req.ip, req.headers['user-agent']), false);
  },

  async refresh(req: Request, res: Response) {
    const { token, fromBody } = readRefreshToken(req);
    if (!token) throw new AppError('UNAUTHORIZED');
    try {
      return sendSession(req, res, await authService.refresh(token, req.headers['user-agent']), fromBody);
    } catch (err) {
      // Parallel yangilashda cookie'da boshqa tab olgan YANGI token turibdi — uni o'chirmaymiz
      const racing = err instanceof AppError && err.code === 'REFRESH_IN_PROGRESS';
      if (!fromBody && !racing) res.clearCookie(REFRESH_COOKIE, clearOptions);
      throw err;
    }
  },

  async logout(req: Request, res: Response) {
    await authService.logout(readRefreshToken(req).token);
    res.clearCookie(REFRESH_COOKIE, clearOptions);
    return ok(res, null);
  },

  async logoutAll(req: Request, res: Response) {
    await authService.logoutAll(currentUser(req).id);
    res.clearCookie(REFRESH_COOKIE, clearOptions);
    return ok(res, null);
  },
};
