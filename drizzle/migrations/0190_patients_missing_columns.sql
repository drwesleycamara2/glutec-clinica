-- 0190_patients_missing_columns.sql
-- Adiciona colunas que faltam na tabela `patients` em produção (legado).
-- MySQL 8 não suporta ADD COLUMN IF NOT EXISTS, então usamos stored procedure
-- temporária para cada coluna (idempotente).

DELIMITER $$

DROP PROCEDURE IF EXISTS add_col_if_missing$$
CREATE PROCEDURE add_col_if_missing(
  IN tbl VARCHAR(64),
  IN col VARCHAR(64),
  IN def VARCHAR(512)
)
BEGIN
  DECLARE cnt INT;
  SELECT COUNT(*) INTO cnt
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = tbl
     AND COLUMN_NAME  = col;
  IF cnt = 0 THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', def);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS copy_col_if_src_exists$$
CREATE PROCEDURE copy_col_if_src_exists(
  IN tbl VARCHAR(64),
  IN src VARCHAR(64),
  IN dst VARCHAR(64)
)
BEGIN
  DECLARE src_cnt INT;
  DECLARE dst_cnt INT;
  SELECT COUNT(*) INTO src_cnt FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = src;
  SELECT COUNT(*) INTO dst_cnt FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = dst;
  IF src_cnt = 1 AND dst_cnt = 1 THEN
    SET @sql = CONCAT(
      'UPDATE `', tbl, '` SET `', dst, '` = COALESCE(`', dst, '`, `', src, '`) ',
      'WHERE (`', dst, '` IS NULL OR `', dst, '` = "") AND `', src, '` IS NOT NULL'
    );
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

-- Endereço
CALL add_col_if_missing('patients', 'city',                   'VARCHAR(128) NULL');
CALL add_col_if_missing('patients', 'state',                  'VARCHAR(8) NULL');
CALL add_col_if_missing('patients', 'zipCode',                'VARCHAR(16) NULL');

-- Condições crônicas / histórico
CALL add_col_if_missing('patients', 'chronicConditions',      'TEXT NULL');

-- Contato de emergência
CALL add_col_if_missing('patients', 'emergencyContactName',   'VARCHAR(256) NULL');
CALL add_col_if_missing('patients', 'emergencyContactPhone',  'VARCHAR(32) NULL');

-- Convênio: schema novo usa insuranceName/insuranceNumber. Legado tem
-- healthInsurance/healthInsuranceNumber. Criamos as novas e copiamos valores.
CALL add_col_if_missing('patients', 'insuranceName',          'VARCHAR(256) NULL');
CALL add_col_if_missing('patients', 'insuranceNumber',        'VARCHAR(128) NULL');

CALL copy_col_if_src_exists('patients', 'healthInsurance',       'insuranceName');
CALL copy_col_if_src_exists('patients', 'healthInsuranceNumber', 'insuranceNumber');

DROP PROCEDURE IF EXISTS add_col_if_missing;
DROP PROCEDURE IF EXISTS copy_col_if_src_exists;
