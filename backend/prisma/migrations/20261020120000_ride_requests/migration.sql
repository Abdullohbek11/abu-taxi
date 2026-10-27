-- AlterTable
ALTER TABLE `User` ADD COLUMN `blockReason` VARCHAR(500) NULL;

-- CreateTable
CREATE TABLE `RideRequest` (
    `id` VARCHAR(191) NOT NULL,
    `passengerId` VARCHAR(191) NOT NULL,
    `fromCityId` VARCHAR(191) NOT NULL,
    `toCityId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `seats` INTEGER NOT NULL,
    `offeredPrice` INTEGER NULL,
    `note` VARCHAR(500) NULL,
    `status` ENUM('OPEN', 'ASSIGNED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'OPEN',
    `driverId` VARCHAR(191) NULL,
    `vehicleId` VARCHAR(191) NULL,
    `pricePerSeat` INTEGER NULL,
    `driverName` VARCHAR(100) NULL,
    `driverPhone` VARCHAR(20) NULL,
    `driverTelegram` VARCHAR(64) NULL,
    `carModel` VARCHAR(100) NULL,
    `carColor` VARCHAR(50) NULL,
    `carPlate` VARCHAR(20) NULL,
    `assignedAt` DATETIME(3) NULL,
    `assignedById` VARCHAR(191) NULL,
    `notifiedDrivers` INTEGER NOT NULL DEFAULT 0,
    `groupPostedAt` DATETIME(3) NULL,
    `groupChatId` VARCHAR(32) NULL,
    `groupMessageId` INTEGER NULL,
    `groupClosedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RideRequest_status_groupPostedAt_createdAt_idx`(`status`, `groupPostedAt`, `createdAt`),
    INDEX `RideRequest_status_fromCityId_toCityId_date_idx`(`status`, `fromCityId`, `toCityId`, `date`),
    INDEX `RideRequest_passengerId_status_idx`(`passengerId`, `status`),
    INDEX `RideRequest_driverId_status_idx`(`driverId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RideRequest` ADD CONSTRAINT `RideRequest_passengerId_fkey` FOREIGN KEY (`passengerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RideRequest` ADD CONSTRAINT `RideRequest_fromCityId_fkey` FOREIGN KEY (`fromCityId`) REFERENCES `City`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RideRequest` ADD CONSTRAINT `RideRequest_toCityId_fkey` FOREIGN KEY (`toCityId`) REFERENCES `City`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RideRequest` ADD CONSTRAINT `RideRequest_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `DriverProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RideRequest` ADD CONSTRAINT `RideRequest_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

