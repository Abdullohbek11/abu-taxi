-- O'rin tanlash: har bir o'rinning narxi (safar) va tanlangan o'rin raqamlari (band qilish).
-- seatPrices: int[] (uzunligi totalSeats; i-element = (i+1)-o'rin narxi); NULL — hamma o'rin pricePerSeat.
-- seatNumbers: int[] (1 dan boshlab); o'rin raqami 1 — haydovchi yonidagi old o'rin.
ALTER TABLE `Trip` ADD COLUMN `seatPrices` JSON NULL;
ALTER TABLE `Booking` ADD COLUMN `seatNumbers` JSON NULL;
