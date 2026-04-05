-- ============================================================
-- Migração: Infraestrutura de Importação de Dados
-- Data: 2026-04-05
-- Descrição: Mapeamento de IDs dos sistemas legados (Prontuário Verde
--            e Ondoctor) para os novos IDs do sistema Glutec.
--            Garante rastreabilidade e facilita re-importação.
-- ============================================================

-- ─── MAPEAMENTO DE IDs LEGADOS ────────────────────────────────────────────────
-- Mapeia sourceSystem + sourceId → newId na tabela de destino
CREATE TABLE IF NOT EXISTS `import_id_map` (
  `id`           INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `sourceSystem` VARCHAR(32) NOT NULL COMMENT 'prontuario_verde | ondoctor',
  `sourceTable`  VARCHAR(64) NOT NULL COMMENT 'Tabela de origem (ex: exp_paciente)',
  `sourceId`     VARCHAR(64) NOT NULL COMMENT 'ID original no sistema de origem',
  `targetTable`  VARCHAR(64) NOT NULL COMMENT 'Tabela de destino no Glutec',
  `targetId`     INT         NOT NULL COMMENT 'Novo ID no sistema Glutec',
  `importedAt`   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_import_map` (`sourceSystem`, `sourceTable`, `sourceId`),
  INDEX `idx_imap_source` (`sourceSystem`, `sourceTable`),
  INDEX `idx_imap_target` (`targetTable`, `targetId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── FILA DE IMPORTAÇÃO DE ARQUIVOS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `import_jobs` (
  `id`           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `sourceSystem` VARCHAR(32)   NOT NULL,
  `fileName`     VARCHAR(256)  NOT NULL,
  `fileSize`     INT           NULL,
  `status`       ENUM('pending','processing','completed','failed','partial') NOT NULL DEFAULT 'pending',
  `totalRows`    INT           NULL DEFAULT 0,
  `processedRows` INT          NULL DEFAULT 0,
  `insertedRows` INT           NULL DEFAULT 0,
  `updatedRows`  INT           NULL DEFAULT 0,
  `skippedRows`  INT           NULL DEFAULT 0,
  `errorRows`    INT           NULL DEFAULT 0,
  `errorDetails` TEXT          NULL COMMENT 'JSON array de erros',
  `startedAt`    TIMESTAMP     NULL,
  `completedAt`  TIMESTAMP     NULL,
  `createdBy`    INT           NULL,
  `createdAt`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── ATUALIZAÇÃO: adicionar coluna profession à users (para exibição) ─────────
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `profession` VARCHAR(128) NULL AFTER `specialty`;
