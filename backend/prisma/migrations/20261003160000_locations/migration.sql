-- Aniq joylashuv: yo'lovchini qayerga tushirish va yukni qayerdan olib, qayerga eltish (xaritadagi nuqta).
ALTER TABLE `Booking`
  ADD COLUMN `dropoffAddress` VARCHAR(300) NULL,
  ADD COLUMN `dropoffLat` DOUBLE NULL,
  ADD COLUMN `dropoffLng` DOUBLE NULL;
ALTER TABLE `CargoRequest`
  ADD COLUMN `pickupLat` DOUBLE NULL,
  ADD COLUMN `pickupLng` DOUBLE NULL,
  ADD COLUMN `dropoffLat` DOUBLE NULL,
  ADD COLUMN `dropoffLng` DOUBLE NULL;
