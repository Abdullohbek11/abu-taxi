import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/role.js';
import { validate } from '../../middlewares/validate.js';
import { changePasswordBody } from '../auth/auth.schema.js';
import { adminPaymentsQuery, billingSettingsBody, grantSubscriptionBody, paymentIdParams, rejectPaymentBody } from '../billing/billing.schema.js';
import { adminController } from './admin.controller.js';
import { adminRideRequestsQuery, assignRideRequestBody } from '../ride-requests/rideRequests.schema.js';
import { adminListQuery, blockBody, exportParams, idParams, listAuditQuery, listDriversQuery, listUsersQuery, rejectBody } from './admin.schema.js';
import { rateLimit } from '../../middlewares/rateLimit.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole('ADMIN'));

adminRouter.get('/stats', adminController.stats);
adminRouter.get('/overview', adminController.overview);
// Tarif va to'lovlar
adminRouter.get('/billing/settings', adminController.billingSettings);
adminRouter.put('/billing/settings', validate({ body: billingSettingsBody }), adminController.saveBillingSettings);
adminRouter.get('/payments', validate({ query: adminPaymentsQuery }), adminController.listPayments);
adminRouter.get('/payments/:id/receipt', validate({ params: paymentIdParams }), adminController.paymentReceipt);
adminRouter.post('/payments/:id/confirm', validate({ params: paymentIdParams }), adminController.confirmPayment);
adminRouter.post('/payments/:id/reject', validate({ params: paymentIdParams, body: rejectPaymentBody }), adminController.rejectPayment);
adminRouter.post('/users/:id/subscription', validate({ params: idParams, body: grantSubscriptionBody }), adminController.grantSubscription);
adminRouter.get('/users/:id', validate({ params: idParams }), adminController.userDetail);
adminRouter.get('/trips', validate({ query: adminListQuery }), adminController.listTrips);
adminRouter.get('/bookings', validate({ query: adminListQuery }), adminController.listBookings);
adminRouter.get('/cargo', validate({ query: adminListQuery }), adminController.listCargo);
adminRouter.get('/reviews', validate({ query: adminListQuery }), adminController.listReviews);
adminRouter.delete('/reviews/:id', validate({ params: idParams }), adminController.deleteReview);
// Mijozlar bazasini ommaviy yuklab olish — soatiga 20 ta (o'g'irlangan sessiya bilan bazani tez ko'chirib bo'lmasin)
adminRouter.get('/export/:entity', rateLimit({ name: 'admin-export', limit: 20, windowSec: 3600, by: 'user' }), validate({ params: exportParams }), adminController.exportCsv);
adminRouter.post('/me/password', validate({ body: changePasswordBody }), adminController.changePassword);
adminRouter.get('/users', validate({ query: listUsersQuery }), adminController.listUsers);
adminRouter.get('/audit', validate({ query: listAuditQuery }), adminController.listAudit);
adminRouter.get('/drivers', validate({ query: listDriversQuery }), adminController.listDrivers);
adminRouter.post('/drivers/:id/approve', validate({ params: idParams }), adminController.approveDriver);
adminRouter.post('/drivers/:id/reject', validate({ params: idParams, body: rejectBody }), adminController.rejectDriver);
adminRouter.post('/vehicles/:id/approve', validate({ params: idParams }), adminController.approveVehicle);
adminRouter.post('/vehicles/:id/reject', validate({ params: idParams }), adminController.rejectVehicle);
adminRouter.get('/documents/:id', validate({ params: idParams }), adminController.getDocument);
adminRouter.post('/users/:id/block', validate({ params: idParams, body: blockBody }), adminController.block);
adminRouter.post('/users/:id/unblock', validate({ params: idParams }), adminController.unblock);
adminRouter.get('/ride-requests', validate({ query: adminRideRequestsQuery }), adminController.listRideRequests);
adminRouter.post('/ride-requests/:id/assign', validate({ params: idParams, body: assignRideRequestBody }), adminController.assignRideRequest);
adminRouter.post('/ride-requests/:id/cancel', validate({ params: idParams }), adminController.cancelRideRequest);
