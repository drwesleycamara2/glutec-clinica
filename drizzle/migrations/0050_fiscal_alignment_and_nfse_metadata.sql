-- ============================================================
-- Migração: Alinhamento Fiscal + Metadados NFS-e
-- Data: 2026-04-05
-- Descrição: Alinha a tabela fiscal_config com os campos usados
--            pela UI atual e adiciona metadados úteis na NFS-e.
-- ============================================================

SET @schema_name := DATABASE();

SET @sql := IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @schema_name
      AND table_name = 'fiscal_config'
      AND column_name = 'optanteSimplesNacional'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `optanteSimplesNacional` TINYINT(1) NOT NULL DEFAULT 1 AFTER `email`'
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
      AND column_name = 'regimeApuracao'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `regimeApuracao` VARCHAR(64) NULL AFTER `regimeTributario`'
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
      AND column_name = 'codigoTributacaoNacional'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `codigoTributacaoNacional` VARCHAR(32) NULL AFTER `regimeApuracao`'
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
      AND column_name = 'descricaoTributacao'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `descricaoTributacao` TEXT NULL AFTER `codigoTributacaoNacional`'
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
      AND column_name = 'itemNbs'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `itemNbs` VARCHAR(32) NULL AFTER `descricaoTributacao`'
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
      AND column_name = 'descricaoNbs'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `descricaoNbs` TEXT NULL AFTER `itemNbs`'
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
      AND column_name = 'aliquotaSimplesNacional'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `aliquotaSimplesNacional` DECIMAL(8,4) NULL AFTER `descricaoNbs`'
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
      AND column_name = 'municipioIncidencia'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `municipioIncidencia` VARCHAR(128) NULL AFTER `aliquotaSimplesNacional`'
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
      AND column_name = 'ufIncidencia'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `ufIncidencia` VARCHAR(2) NULL AFTER `municipioIncidencia`'
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
      AND column_name = 'descricaoServicoPadrao'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `descricaoServicoPadrao` TEXT NULL AFTER `ufIncidencia`'
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
      AND column_name = 'textoLegalFixo'
  ),
  'SELECT 1',
  'ALTER TABLE `fiscal_config` ADD COLUMN `textoLegalFixo` TEXT NULL AFTER `descricaoServicoPadrao`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `fiscal_config`
SET
  `provedor` = COALESCE(NULLIF(`provedor`, ''), 'nfse_nacional'),
  `descricaoServicoPadrao` = COALESCE(`descricaoServicoPadrao`, `descricaoServico`),
  `regimeApuracao` = COALESCE(`regimeApuracao`, `regimeTributario`),
  `municipioIncidencia` = COALESCE(`municipioIncidencia`, `municipio`),
  `ufIncidencia` = COALESCE(`ufIncidencia`, `uf`);

SET @sql := IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @schema_name
      AND table_name = 'nfse'
      AND column_name = 'tomadorTipoDocumento'
  ),
  'SELECT 1',
  'ALTER TABLE `nfse` ADD COLUMN `tomadorTipoDocumento` VARCHAR(16) NULL AFTER `tomadorCpfCnpj`'
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
      AND column_name = 'formaPagamento'
  ),
  'SELECT 1',
  'ALTER TABLE `nfse` ADD COLUMN `formaPagamento` VARCHAR(64) NULL AFTER `descontoCondicionado`'
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
      AND column_name = 'detalhesPagamento'
  ),
  'SELECT 1',
  'ALTER TABLE `nfse` ADD COLUMN `detalhesPagamento` TEXT NULL AFTER `formaPagamento`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
