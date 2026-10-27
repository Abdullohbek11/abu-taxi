import type { Request, Response } from 'express';
import { disconnectUser } from '../../lib/realtime.js';
import { ok } from '../../lib/response.js';
import { currentUser } from '../../middlewares/auth.js';
import { input } from '../../middlewares/validate.js';
import { documentsService } from '../documents/documents.service.js';
import { notify } from '../notifications/notifications.service.js';
import { adminRideRequestsQuery, assignRideRequestBody } from '../ride-requests/rideRequests.schema.js';
import { rideRequestsService } from '../ride-requests/rideRequests.service.js';
import { adminListQuery, blockBody, exportParams, idParams, listAuditQuery, listDriversQuery, listUsersQuery, rejectBody } from './admin.schema.js';
import { adminService, audit } from './admin.service.js';
import { adminStats } from './admin.stats.js';
import { adminDataService } from './admin.data.service.js';
import { adminPaymentsQuery, billingSettingsBody, grantSubscriptionBody, paymentIdParams, rejectPaymentBody } from '../billing/billing.schema.js';
import { billingService, grantTrialIfAny } from '../billing/billing.service.js';
import { changePasswordBody } from '../auth/auth.schema.js';
import { adminAuthService } from '../auth/adminAuth.service.js';

/** Har bir o'zgartiruvchi admin amali (va maxfiy hujjatni ko'rish) jurnalga yoziladi. */
const log = (req: Request, action: string, type: string, id: string, meta?: Record<string, unknown>) =>
  audit(currentUser(req).id, action, { type, id }, meta, req.ip);

export const adminController = {
  async stats(_req: Request, res: Response) {
    return ok(res, await adminStats());
  },

  async overview(_req: Request, res: Response) {
    const [data, billing] = await Promise.all([adminDataService.overview(), billingService.stats()]);
    return ok(res, { ...data, billing });
  },

  async billingSettings(_req: Request, res: Response) {
    return ok(res, await billingService.getSettings());
  },

  async saveBillingSettings(req: Request, res: Response) {
    const value = input(req, 'body', billingSettingsBody);
    const saved = await billingService.saveSettings(value);
    await log(req, 'billing.settings', 'billing', 'settings', { enabled: value.enabled, price: value.price, days: value.days });
    return ok(res, saved);
  },

  async listPayments(req: Request, res: Response) {
    const { items, nextCursor } = await billingService.list(input(req, 'query', adminPaymentsQuery));
    return ok(res, items, { nextCursor });
  },

  async paymentReceipt(req: Request, res: Response) {
    const { id } = input(req, 'params', paymentIdParams);
    const data = await billingService.receiptUrl(id);
    await log(req, 'payment.receipt.view', 'payment', id);
    return ok(res, data);
  },

  async confirmPayment(req: Request, res: Response) {
    const { id } = input(req, 'params', paymentIdParams);
    const r = await billingService.confirm(currentUser(req).id, id);
    await log(req, 'payment.confirm', 'payment', id, { userId: r.userId, amount: r.amount, until: r.until.toISOString() });
    return ok(res, { until: r.until });
  },

  async rejectPayment(req: Request, res: Response) {
    const { id } = input(req, 'params', paymentIdParams);
    const { reason } = input(req, 'body', rejectPaymentBody);
    const r = await billingService.reject(currentUser(req).id, id, reason);
    await log(req, 'payment.reject', 'payment', id, { userId: r.userId, reason });
    return ok(res, { rejected: true });
  },

  async grantSubscription(req: Request, res: Response) {
    const { id } = input(req, 'params', idParams);
    const { days, amount, note } = input(req, 'body', grantSubscriptionBody);
    const r = await billingService.grant(currentUser(req).id, id, days, amount, note);
    await log(req, 'subscription.grant', 'user', id, { days, amount, note });
    return ok(res, r);
  },

  async userDetail(req: Request, res: Response) {
    const { id } = input(req, 'params', idParams);
    const data = await adminDataService.userDetail(id);
    // Shaxsiy ma'lumotlarni ko'rish ham jurnalga yoziladi (hujjatni ko'rish kabi)
    await log(req, 'user.view', 'user', id);
    return ok(res, data);
  },

  async listTrips(req: Request, res: Response) {
    const { items, nextCursor } = await adminDataService.listTrips(input(req, 'query', adminListQuery));
    return ok(res, items, { nextCursor });
  },

  async listBookings(req: Request, res: Response) {
    const { items, nextCursor } = await adminDataService.listBookings(input(req, 'query', adminListQuery));
    return ok(res, items, { nextCursor });
  },

  async listCargo(req: Request, res: Response) {
    const { items, nextCursor } = await adminDataService.listCargo(input(req, 'query', adminListQuery));
    return ok(res, items, { nextCursor });
  },

  async listReviews(req: Request, res: Response) {
    const { items, nextCursor } = await adminDataService.listReviews(input(req, 'query', adminListQuery));
    return ok(res, items, { nextCursor });
  },

  async deleteReview(req: Request, res: Response) {
    const { id } = input(req, 'params', idParams);
    const r = await adminDataService.deleteReview(id);
    await log(req, 'review.delete', 'review', id, { targetUserId: r.targetUserId, rating: r.rating, text: r.text });
    return ok(res, { deleted: true });
  },

  async exportCsv(req: Request, res: Response) {
    const { entity } = input(req, 'params', exportParams);
    const { filename, csv, rows } = await adminDataService.exportCsv(entity);
    await log(req, 'export.csv', 'export', entity, { rows });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(csv);
  },

  async changePassword(req: Request, res: Response) {
    const { currentPassword, newPassword } = input(req, 'body', changePasswordBody);
    return ok(res, await adminAuthService.changePassword(currentUser(req).id, currentPassword, newPassword, req.ip));
  },

  async listDrivers(req: Request, res: Response) {
    const { status, limit, cursor } = input(req, 'query', listDriversQuery);
    const { items, nextCursor } = await adminService.listDrivers(status, limit, cursor);
    return ok(res, items, { nextCursor });
  },

  async listUsers(req: Request, res: Response) {
    const { items, nextCursor } = await adminService.listUsers(input(req, 'query', listUsersQuery));
    return ok(res, items, { nextCursor });
  },

  async listAudit(req: Request, res: Response) {
    const { items, nextCursor } = await adminService.listAudit(input(req, 'query', listAuditQuery));
    return ok(res, items, { nextCursor });
  },

  async approveDriver(req: Request, res: Response) {
    const { id } = input(req, 'params', idParams);
    const profile = await adminService.approveDriver(id);
    await log(req, 'driver.approve', 'driver', id);
    await grantTrialIfAny(id);
    await notify(profile.userId, 'driver:status', { status: profile.status });
    return ok(res, profile);
  },

  async rejectDriver(req: Request, res: Response) {
    const { id } = input(req, 'params', idParams);
    const { reason } = input(req, 'body', rejectBody);
    const profile = await adminService.rejectDriver(id, reason);
    await log(req, 'driver.reject', 'driver', id, { reason });
    await notify(profile.userId, 'driver:status', { status: profile.status, reason });
    return ok(res, profile);
  },

  async approveVehicle(req: Request, res: Response) {
    const { id } = input(req, 'params', idParams);
    const vehicle = await adminService.setVehicleStatus(id, 'APPROVED');
    await log(req, 'vehicle.approve', 'vehicle', id);
    return ok(res, vehicle);
  },

  async rejectVehicle(req: Request, res: Response) {
    const { id } = input(req, 'params', idParams);
    const vehicle = await adminService.setVehicleStatus(id, 'REJECTED');
    await log(req, 'vehicle.reject', 'vehicle', id);
    return ok(res, vehicle);
  },

  async getDocument(req: Request, res: Response) {
    const { id } = input(req, 'params', idParams);
    const doc = await documentsService.signedUrl(id, currentUser(req));
    await log(req, 'document.view', 'document', id, { type: doc.type });
    return ok(res, doc);
  },

  async block(req: Request, res: Response) {
    const { id } = input(req, 'params', idParams);
    const { reason } = input(req, 'body', blockBody);
    const { result, events } = await adminService.setBlocked(id, true, reason);
    await log(req, 'user.block', 'user', id, { affected: events.length, reason });
    disconnectUser(id);
    await Promise.all(events.map((e) => notify(e.userId, e.type, e.payload)));
    return ok(res, result);
  },

  async unblock(req: Request, res: Response) {
    const { id } = input(req, 'params', idParams);
    const { result } = await adminService.setBlocked(id, false);
    await log(req, 'user.unblock', 'user', id);
    return ok(res, result);
  },

  async listRideRequests(req: Request, res: Response) {
    const { items, nextCursor } = await rideRequestsService.adminList(input(req, 'query', adminRideRequestsQuery));
    return ok(res, items, { nextCursor });
  },

  async assignRideRequest(req: Request, res: Response) {
    const { id } = input(req, 'params', idParams);
    const r = await rideRequestsService.adminAssign(currentUser(req).id, id, input(req, 'body', assignRideRequestBody));
    await log(req, 'rideRequest.assign', 'rideRequest', id, { driverPhone: r.toPassenger.phone });
    await notify(r.passengerId, 'ride:request:assigned', r.toPassenger);
    return ok(res, r.request);
  },

  async cancelRideRequest(req: Request, res: Response) {
    const { id } = input(req, 'params', idParams);
    const r = await rideRequestsService.adminCancel(id);
    await log(req, 'rideRequest.cancel', 'rideRequest', id);
    await notify(r.passengerId, 'ride:request:updated', { requestId: id, status: 'CANCELLED' });
    await notify(r.driverUserId, 'ride:request:updated', { requestId: id, status: 'CANCELLED' });
    return ok(res, r.request);
  },
};
