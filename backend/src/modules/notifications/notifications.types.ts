/**
 * Bildirishnoma turlari = Socket.IO hodisa nomlari.
 * Har hodisa `notification:new` bilan ham yuboriladi.
 */
export type NotificationType =
  | 'booking:new'
  | 'booking:updated'
  | 'trip:updated'
  | 'cargo:offer:new'
  | 'cargo:offer:updated'
  | 'cargo:updated'
  | 'driver:status'
  /** Haydovchiga: yo'nalishida yangi safar so'rovi ("Olaman" tugmasi bilan) */
  | 'ride:request:new'
  /** Yo'lovchiga: haydovchi topildi (ism, mashina, narx, telefon) */
  | 'ride:request:assigned'
  /** Haydovchiga: so'rov sizga biriktirildi (yo'lovchi kontakti) */
  | 'ride:request:taken'
  /** Bekor qilindi / muddati o'tdi */
  | 'ride:request:updated'
  /** Adminga: admin panelga parol bilan kirildi (IP bilan) */
  | 'security:admin-login'
  /** Haydovchiga: tarif faollashdi / to'lov rad etildi / tugashiga 3 kun qoldi / tugadi */
  | 'billing:activated'
  | 'billing:rejected'
  | 'billing:expiring'
  | 'billing:expired'
  /** Adminlarga: yangi to'lov (chek) tekshiruv kutmoqda */
  | 'billing:payment:new';

export type NotificationPayload = Record<string, unknown> & { status?: string };
