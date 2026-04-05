-- ============================================================
-- Migração: Alinhamento Fiscal + Metadados NFS-e
-- Data: 2026-04-05
-- Descrição: Alinha a tabela fiscal_config com os campos usados
--            pela UI atual e adiciona metadados úteis na NFS-e.
-- ============================================================

ALTER TABLE `fiscal_config`
  ADD COLUMN IF NOT EXISTS `optanteSimplesNacional` TINYINT(1) NOT NULL DEFAULT 1 AFTER `email`,
  ADD COLUMN IF NOT EXISTS `regimeApuracao` VARCHAR(64) NULL AFTER `regimeTributario`,
  ADD COLUMN IF NOT EXISTS `codigoTributacaoNacional` VARCHAR(32) NULL AFTER `regimeApuracao`,
  ADD COLUMN IF NOT EXISTS `descricaoTributacao` TEXT NULL AFTER `codigoTributacaoNacional`,
  ADD COLUMN IF NOT EXISTS `itemNbs` VARCHAR(32) NULL AFTER `descricaoTributacao`,
  ADD COLUMN IF NOT EXISTS `descricaoNbs` TEXT NULL AFTER `itemNbs`,
  ADD COLUMN IF NOT EXISTS `aliquotaSimplesNacional` DECIMAL(8,4) NULL AFTER `descricaoNbs`,
  ADD COLUMN IF NOT EXISTS `municipioIncidencia` VARCHAR(128) NULL AFTER `aliquotaSimplesNacional`,
  ADD COLUMN IF NOT EXISTS `ufIncidencia` VARCHAR(2) NULL AFTER `municipioIncidencia`,
  ADD COLUMN IF NOT EXISTS `descricaoServicoPadrao` TEXT NULL AFTER `ufIncidencia`,
  ADD COLUMN IF NOT EXISTS `textoLegalFixo` TEXT NULL AFTER `descricaoServicoPadrao`;

UPDATE `fiscal_config`
SET
  `provedor` = COALESCE(NULLIF(`provedor`, ''), 'nfse_nacional'),
  `descricaoServicoPadrao` = COALESCE(`descricaoServicoPadrao`, `descricaoServico`),
  `regimeApuracao` = COALESCE(`regimeApuracao`, `regimeTributario`),
  `municipioIncidencia` = COALESCE(`municipioIncidencia`, `municipio`),
  `ufIncidencia` = COALESCE(`ufIncidencia`, `uf`);

ALTER TABLE `nfse`
  ADD COLUMN IF NOT EXISTS `tomadorTipoDocumento` VARCHAR(16) NULL AFTER `tomadorCpfCnpj`,
  ADD COLUMN IF NOT EXISTS `formaPagamento` VARCHAR(64) NULL AFTER `descontoCondicionado`,
  ADD COLUMN IF NOT EXISTS `detalhesPagamento` TEXT NULL AFTER `formaPagamento`;
