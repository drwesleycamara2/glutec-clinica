SET @stmt := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_evolutions'
        AND COLUMN_NAME = 'assistantUserId'
    ),
    'SELECT 1',
    'ALTER TABLE `clinical_evolutions` ADD COLUMN `assistantUserId` INT NULL AFTER `doctorId`'
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
        AND COLUMN_NAME = 'assistantName'
    ),
    'SELECT 1',
    'ALTER TABLE `clinical_evolutions` ADD COLUMN `assistantName` VARCHAR(255) NULL AFTER `retroactiveJustification`'
  )
);
PREPARE clinical_stmt FROM @stmt;
EXECUTE clinical_stmt;
DEALLOCATE PREPARE clinical_stmt;

UPDATE `clinical_evolutions`
SET `assistantName` = COALESCE(NULLIF(TRIM(`assistantName`), ''), 'Ninguém')
WHERE `assistantName` IS NULL OR TRIM(`assistantName`) = '';

SET @stmt := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_evolutions'
        AND COLUMN_NAME = 'assistantName'
        AND IS_NULLABLE = 'YES'
    ),
    'ALTER TABLE `clinical_evolutions` MODIFY COLUMN `assistantName` VARCHAR(255) NOT NULL',
    'SELECT 1'
  )
);
PREPARE clinical_stmt FROM @stmt;
EXECUTE clinical_stmt;
DEALLOCATE PREPARE clinical_stmt;
