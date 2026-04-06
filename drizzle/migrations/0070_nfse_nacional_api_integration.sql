-- ============================================================
-- Migração: Integração real com a API Nacional da NFS-e
-- Data: 2026-04-06
-- Descrição: adiciona colunas para certificado A1, endpoint
--            oficial e metadados da autorização da NFS-e.
-- ============================================================

SET @schema_name := DATABASE();

SET @sql := IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @schema_name
      AND table_name = 'fiscal_config'
      AND column_name = 'certificadoArquivoNome'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `certificadoArquivoNome` VARCHAR(255) NULL AFTER `certificadoVencimento`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @schema_name
      AND table_name = 'fiscal_config'
      AND column_name = 'certificadoMimeType'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `certificadoMimeType` VARCHAR(128) NULL AFTER `certificadoArquivoNome`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @schema_name
      AND table_name = 'fiscal_config'
      AND column_name = 'certificadoAtualizadoEm'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `certificadoAtualizadoEm` DATETIME NULL AFTER `certificadoMimeType`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @schema_name
      AND table_name = 'nfse'
      AND column_name = 'chaveAcesso'
  ),
  'SELECT 1',
  'ALTER TABLE `nfse` ADD COLUMN `chaveAcesso` VARCHAR(128) NULL AFTER `numeroNfse`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @schema_name
      AND table_name = 'nfse'
      AND column_name = 'protocolo'
  ),
  'SELECT 1',
  'ALTER TABLE `nfse` ADD COLUMN `protocolo` VARCHAR(128) NULL AFTER `chaveAcesso`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @schema_name
      AND table_name = 'nfse'
      AND column_name = 'numeroDps'
  ),
  'SELECT 1',
  'ALTER TABLE `nfse` ADD COLUMN `numeroDps` VARCHAR(64) NULL AFTER `tipoRps`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
