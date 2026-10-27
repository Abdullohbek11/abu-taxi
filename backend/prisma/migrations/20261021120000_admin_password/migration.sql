-- AlterTable
ALTER TABLE `User` ADD COLUMN `passwordChangedAt` DATETIME(3) NULL,
    ADD COLUMN `passwordHash` VARCHAR(255) NULL;

