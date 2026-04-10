CREATE TABLE IF NOT EXISTS `medical_record_templates` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `specialty` VARCHAR(120) NULL,
  `description` TEXT NULL,
  `sections` JSON NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_medical_record_templates_specialty` (`specialty`),
  INDEX `idx_medical_record_templates_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @stmt := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_evolutions'
        AND COLUMN_NAME = 'startedAt'
    ),
    'SELECT 1',
    'ALTER TABLE `clinical_evolutions` ADD COLUMN `startedAt` DATETIME NULL AFTER `status`'
  )
);
PREPARE clinical_stmt FROM @stmt;
EXECUTE clinical_stmt;
DEALLOCATE PREPARE clinical_stmt;

SET @stmt := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_evolutions'
        AND COLUMN_NAME = 'endedAt'
    ),
    'SELECT 1',
    'ALTER TABLE `clinical_evolutions` ADD COLUMN `endedAt` DATETIME NULL AFTER `startedAt`'
  )
);
PREPARE clinical_stmt FROM @stmt;
EXECUTE clinical_stmt;
DEALLOCATE PREPARE clinical_stmt;

SET @stmt := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_evolutions'
        AND COLUMN_NAME = 'finalizedAt'
    ),
    'SELECT 1',
    'ALTER TABLE `clinical_evolutions` ADD COLUMN `finalizedAt` DATETIME NULL AFTER `endedAt`'
  )
);
PREPARE clinical_stmt FROM @stmt;
EXECUTE clinical_stmt;
DEALLOCATE PREPARE clinical_stmt;

SET @stmt := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_evolutions'
        AND COLUMN_NAME = 'isRetroactive'
    ),
    'SELECT 1',
    'ALTER TABLE `clinical_evolutions` ADD COLUMN `isRetroactive` TINYINT(1) NOT NULL DEFAULT 0 AFTER `finalizedAt`'
  )
);
PREPARE clinical_stmt FROM @stmt;
EXECUTE clinical_stmt;
DEALLOCATE PREPARE clinical_stmt;

SET @stmt := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_evolutions'
        AND COLUMN_NAME = 'retroactiveJustification'
    ),
    'SELECT 1',
    'ALTER TABLE `clinical_evolutions` ADD COLUMN `retroactiveJustification` TEXT NULL AFTER `isRetroactive`'
  )
);
PREPARE clinical_stmt FROM @stmt;
EXECUTE clinical_stmt;
DEALLOCATE PREPARE clinical_stmt;

SET @stmt := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_evolutions'
        AND COLUMN_NAME = 'signatureProvider'
    ),
    'SELECT 1',
    'ALTER TABLE `clinical_evolutions` ADD COLUMN `signatureProvider` VARCHAR(64) NULL AFTER `signatureHash`'
  )
);
PREPARE clinical_stmt FROM @stmt;
EXECUTE clinical_stmt;
DEALLOCATE PREPARE clinical_stmt;

SET @stmt := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_evolutions'
        AND COLUMN_NAME = 'signatureCertificateLabel'
    ),
    'SELECT 1',
    'ALTER TABLE `clinical_evolutions` ADD COLUMN `signatureCertificateLabel` VARCHAR(255) NULL AFTER `signatureProvider`'
  )
);
PREPARE clinical_stmt FROM @stmt;
EXECUTE clinical_stmt;
DEALLOCATE PREPARE clinical_stmt;

SET @stmt := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_evolutions'
        AND COLUMN_NAME = 'signatureValidationCode'
    ),
    'SELECT 1',
    'ALTER TABLE `clinical_evolutions` ADD COLUMN `signatureValidationCode` VARCHAR(128) NULL AFTER `signatureCertificateLabel`'
  )
);
PREPARE clinical_stmt FROM @stmt;
EXECUTE clinical_stmt;
DEALLOCATE PREPARE clinical_stmt;
