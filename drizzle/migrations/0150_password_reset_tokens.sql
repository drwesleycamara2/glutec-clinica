CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `tokenHash` VARCHAR(128) NOT NULL UNIQUE,
  `requestedIp` VARCHAR(64) NULL,
  `userAgent` VARCHAR(255) NULL,
  `expiresAt` TIMESTAMP NOT NULL,
  `usedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_password_reset_user` (`userId`),
  INDEX `idx_password_reset_expires` (`expiresAt`)
);
