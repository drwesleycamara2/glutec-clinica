-- Log de auditoria para edições de evolução clínica (atendimento)
-- Qualquer alteração em uma evolução com status 'finalizado' ou 'assinado'
-- DEVE ser acompanhada de justificativa e registrada aqui de forma imutável.

CREATE TABLE IF NOT EXISTS `clinical_evolution_edit_log` (
  `id`                    INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `clinicalEvolutionId`   INT          NOT NULL,
  `editedByUserId`        INT          NOT NULL,
  `editedByUserName`      VARCHAR(256) NOT NULL,
  `editedByUserRole`      VARCHAR(64)  NULL,
  `previousStatus`        VARCHAR(32)  NULL  COMMENT 'Status antes da edição',
  `newStatus`             VARCHAR(32)  NULL  COMMENT 'Status após a edição',
  `justification`         TEXT         NOT NULL COMMENT 'Motivo da alteração informado pelo profissional',
  `changedFields`         JSON         NULL   COMMENT 'Array com nomes dos campos alterados',
  `previousSnapshot`      JSON         NULL   COMMENT 'Snapshot dos campos antes da edição',
  `newSnapshot`           JSON         NULL   COMMENT 'Snapshot dos campos após a edição',
  `ipAddress`             VARCHAR(45)  NULL,
  `userAgent`             TEXT         NULL,
  `editedAt`              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_cee_evolution` (`clinicalEvolutionId`),
  INDEX `idx_cee_user`      (`editedByUserId`),
  INDEX `idx_cee_date`      (`editedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
