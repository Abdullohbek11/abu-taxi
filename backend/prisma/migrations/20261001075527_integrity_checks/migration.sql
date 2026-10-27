-- Ma'lumot yaxlitligi (MySQL 8.0.16+ CHECK cheklovlarini haqiqatan tekshiradi).
-- Prisma CHECK'larni boshqarmaydi, shuning uchun qo'lda yozilgan.
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_seats_check` CHECK (`availableSeats` >= 0 AND `availableSeats` <= `totalSeats`);
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_price_check` CHECK (`pricePerSeat` > 0);
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_seats_check` CHECK (`seats` > 0 AND `totalPrice` >= 0);
ALTER TABLE `Review` ADD CONSTRAINT `Review_rating_check` CHECK (`rating` BETWEEN 1 AND 5);
ALTER TABLE `CargoOffer` ADD CONSTRAINT `CargoOffer_price_check` CHECK (`price` > 0);
-- Eslatma: Review(bookingId XOR cargoRequestId) tekshiruvi ilovada (MySQL ON DELETE CASCADE ustunlarida CHECK'ni taqiqlaydi).
