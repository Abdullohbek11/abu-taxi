/*
  Warnings:

  - You are about to drop the `OtpCode` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `telegramSentAt` DATETIME(3) NULL;

-- DropTable
DROP TABLE `OtpCode`;

-- CreateTable
CREATE TABLE `LoginCode` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `codeHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LoginCode_codeHash_key`(`codeHash`),
    INDEX `LoginCode_userId_idx`(`userId`),
    INDEX `LoginCode_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Notification_telegramSentAt_createdAt_idx` ON `Notification`(`telegramSentAt`, `createdAt`);

-- AddForeignKey
ALTER TABLE `LoginCode` ADD CONSTRAINT `LoginCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
