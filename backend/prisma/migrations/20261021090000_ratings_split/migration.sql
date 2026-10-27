-- AlterTable
ALTER TABLE `DriverProfile` ADD COLUMN `ratingScore` DECIMAL(4, 3) NOT NULL DEFAULT 4.3;

-- AlterTable
ALTER TABLE `Review` ADD COLUMN `rideRequestId` VARCHAR(191) NULL,
    ADD COLUMN `targetRole` ENUM('DRIVER', 'CLIENT') NOT NULL DEFAULT 'DRIVER';

-- AlterTable
ALTER TABLE `User` ADD COLUMN `clientRatingAvg` DECIMAL(3, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `clientRatingCount` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `Review_targetUserId_targetRole_idx` ON `Review`(`targetUserId`, `targetRole`);

-- CreateIndex
CREATE UNIQUE INDEX `Review_authorId_rideRequestId_key` ON `Review`(`authorId`, `rideRequestId`);

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_rideRequestId_fkey` FOREIGN KEY (`rideRequestId`) REFERENCES `RideRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Mavjud sharhlar: kimga qo'yilganini aniqlash ──
UPDATE `Review` r JOIN `Booking` b ON b.`id` = r.`bookingId`
  SET r.`targetRole` = IF(r.`targetUserId` = b.`passengerId`, 'CLIENT', 'DRIVER');
UPDATE `Review` r JOIN `CargoRequest` c ON c.`id` = r.`cargoRequestId`
  SET r.`targetRole` = IF(r.`targetUserId` = c.`senderId`, 'CLIENT', 'DRIVER');

-- ── Haydovchi reytingi faqat haydovchi sifatidagi baholardan ──
UPDATE `DriverProfile` d
  LEFT JOIN (SELECT `targetUserId`, AVG(`rating`) a, COUNT(*) n FROM `Review` WHERE `targetRole` = 'DRIVER' GROUP BY `targetUserId`) x
    ON x.`targetUserId` = d.`userId`
  SET d.`ratingAvg` = ROUND(COALESCE(x.a, 0), 2),
      d.`ratingCount` = COALESCE(x.n, 0),
      d.`ratingScore` = ROUND((COALESCE(x.a, 0) * COALESCE(x.n, 0) + 4.3 * 5) / (COALESCE(x.n, 0) + 5), 3);

-- ── Mijoz reytingi ──
UPDATE `User` u
  JOIN (SELECT `targetUserId`, AVG(`rating`) a, COUNT(*) n FROM `Review` WHERE `targetRole` = 'CLIENT' GROUP BY `targetUserId`) x
    ON x.`targetUserId` = u.`id`
  SET u.`clientRatingAvg` = ROUND(x.a, 2), u.`clientRatingCount` = x.n;
