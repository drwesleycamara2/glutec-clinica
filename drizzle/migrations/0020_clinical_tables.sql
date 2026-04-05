-- ============================================================
-- Migração: Tabelas Clínicas Completas
-- Data: 2026-04-04
-- Descrição: Pacientes, Agenda, Prontuários, Prescrições,
--            Exames, Orçamentos, Estoque, Documentos
-- ============================================================

-- ─── 1. PACIENTES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `patients` (
  `id`              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `fullName`        VARCHAR(256)  NOT NULL,
  `cpf`             VARCHAR(14)   NULL UNIQUE COMMENT 'CPF com máscara: 000.000.000-00',
  `rg`              VARCHAR(20)   NULL,
  `birthDate`       DATE          NULL,
  `gender`          ENUM('masculino','feminino','outro','nao_informado') NULL DEFAULT 'nao_informado',
  `phone`           VARCHAR(20)   NULL,
  `phone2`          VARCHAR(20)   NULL,
  `email`           VARCHAR(320)  NULL,
  `address`         TEXT          NULL COMMENT 'JSON: {street, number, complement, neighborhood, city, state, zip}',
  `healthInsurance` VARCHAR(128)  NULL COMMENT 'Nome do plano de saúde',
  `healthInsuranceNumber` VARCHAR(64) NULL,
  `bloodType`       VARCHAR(5)    NULL,
  `allergies`       TEXT          NULL,
  `observations`    TEXT          NULL,
  `sourceSystem`    VARCHAR(32)   NULL COMMENT 'prontuario_verde | ondoctor | manual',
  `sourceId`        VARCHAR(64)   NULL COMMENT 'ID original no sistema de origem',
  `active`          TINYINT(1)    NOT NULL DEFAULT 1,
  `createdBy`       INT           NULL,
  `createdAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_patients_name`   (`fullName`),
  INDEX `idx_patients_cpf`    (`cpf`),
  INDEX `idx_patients_email`  (`email`),
  INDEX `idx_patients_phone`  (`phone`),
  INDEX `idx_patients_source` (`sourceSystem`, `sourceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 2. AGENDA / CONSULTAS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `appointments` (
  `id`              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `patientId`       INT           NOT NULL,
  `doctorId`        INT           NOT NULL,
  `scheduledAt`     DATETIME      NOT NULL,
  `duration`        INT           NOT NULL DEFAULT 30 COMMENT 'Duração em minutos',
  `type`            VARCHAR(64)   NULL COMMENT 'consulta | retorno | avaliacao | procedimento',
  `status`          ENUM('agendada','confirmada','em_atendimento','concluida','cancelada','falta')
                    NOT NULL DEFAULT 'agendada',
  `notes`           TEXT          NULL,
  `cancelReason`    TEXT          NULL,
  `room`            VARCHAR(32)   NULL,
  `price`           DECIMAL(10,2) NULL,
  `healthInsurance` VARCHAR(128)  NULL,
  `sourceSystem`    VARCHAR(32)   NULL,
  `sourceId`        VARCHAR(64)   NULL,
  `createdBy`       INT           NULL,
  `createdAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_appt_patient`    (`patientId`),
  INDEX `idx_appt_doctor`     (`doctorId`),
  INDEX `idx_appt_scheduled`  (`scheduledAt`),
  INDEX `idx_appt_status`     (`status`),
  INDEX `idx_appt_source`     (`sourceSystem`, `sourceId`),
  FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`doctorId`)  REFERENCES `users`(`id`)    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3. PRONTUÁRIOS / MEDICAL RECORDS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `medical_records` (
  `id`              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `patientId`       INT           NOT NULL,
  `doctorId`        INT           NOT NULL,
  `appointmentId`   INT           NULL,
  `date`            DATE          NOT NULL,
  `chiefComplaint`  TEXT          NULL COMMENT 'Queixa principal',
  `anamnesis`       TEXT          NULL COMMENT 'Anamnese',
  `physicalExam`    TEXT          NULL COMMENT 'Exame físico',
  `diagnosis`       TEXT          NULL COMMENT 'Diagnóstico / hipótese diagnóstica',
  `icdCode`         VARCHAR(16)   NULL,
  `icdDescription`  TEXT          NULL,
  `plan`            TEXT          NULL COMMENT 'Plano de tratamento',
  `evolution`       TEXT          NULL COMMENT 'Evolução clínica',
  `notes`           TEXT          NULL,
  `attachments`     TEXT          NULL COMMENT 'JSON array de URLs de arquivos anexados',
  `status`          ENUM('rascunho','finalizado','assinado','cancelado') NOT NULL DEFAULT 'rascunho',
  `d4signDocumentKey` VARCHAR(128) NULL,
  `d4signStatus`    ENUM('pendente','enviado','assinado','cancelado') NULL DEFAULT 'pendente',
  `signedAt`        TIMESTAMP     NULL,
  `signedPdfUrl`    TEXT          NULL,
  `signatureHash`   VARCHAR(256)  NULL,
  `sourceSystem`    VARCHAR(32)   NULL,
  `sourceId`        VARCHAR(64)   NULL,
  `createdBy`       INT           NULL,
  `createdAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_mr_patient`    (`patientId`),
  INDEX `idx_mr_doctor`     (`doctorId`),
  INDEX `idx_mr_date`       (`date`),
  INDEX `idx_mr_source`     (`sourceSystem`, `sourceId`),
  FOREIGN KEY (`patientId`)     REFERENCES `patients`(`id`)     ON DELETE RESTRICT,
  FOREIGN KEY (`doctorId`)      REFERENCES `users`(`id`)         ON DELETE RESTRICT,
  FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 4. PRESCRIÇÕES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `prescriptions` (
  `id`              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `patientId`       INT           NOT NULL,
  `doctorId`        INT           NOT NULL,
  `appointmentId`   INT           NULL,
  `medicalRecordId` INT           NULL,
  `date`            DATE          NOT NULL,
  `content`         TEXT          NOT NULL COMMENT 'Texto da prescrição',
  `medications`     TEXT          NULL COMMENT 'JSON array de medicamentos',
  `status`          ENUM('rascunho','finalizado','assinado','cancelado') NOT NULL DEFAULT 'rascunho',
  `d4signDocumentKey` VARCHAR(128) NULL,
  `d4signStatus`    ENUM('pendente','enviado','assinado','cancelado') NULL DEFAULT 'pendente',
  `signedAt`        TIMESTAMP     NULL,
  `signedPdfUrl`    TEXT          NULL,
  `sourceSystem`    VARCHAR(32)   NULL,
  `sourceId`        VARCHAR(64)   NULL,
  `createdAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_presc_patient`  (`patientId`),
  INDEX `idx_presc_doctor`   (`doctorId`),
  INDEX `idx_presc_date`     (`date`),
  FOREIGN KEY (`patientId`)     REFERENCES `patients`(`id`)     ON DELETE RESTRICT,
  FOREIGN KEY (`doctorId`)      REFERENCES `users`(`id`)         ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 5. EXAMES SOLICITADOS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `exam_requests` (
  `id`              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `patientId`       INT           NOT NULL,
  `doctorId`        INT           NOT NULL,
  `appointmentId`   INT           NULL,
  `medicalRecordId` INT           NULL,
  `date`            DATE          NOT NULL,
  `content`         TEXT          NOT NULL COMMENT 'Texto da solicitação',
  `exams`           TEXT          NULL COMMENT 'JSON array de exames',
  `status`          ENUM('rascunho','finalizado','assinado','cancelado') NOT NULL DEFAULT 'rascunho',
  `d4signDocumentKey` VARCHAR(128) NULL,
  `signedAt`        TIMESTAMP     NULL,
  `signedPdfUrl`    TEXT          NULL,
  `sourceSystem`    VARCHAR(32)   NULL,
  `sourceId`        VARCHAR(64)   NULL,
  `createdAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_exam_patient` (`patientId`),
  INDEX `idx_exam_doctor`  (`doctorId`),
  FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`doctorId`)  REFERENCES `users`(`id`)    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6. ATESTADOS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `attestations` (
  `id`              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `patientId`       INT           NOT NULL,
  `doctorId`        INT           NOT NULL,
  `appointmentId`   INT           NULL,
  `type`            ENUM('comparecimento','afastamento','aptidao','outro') NOT NULL DEFAULT 'comparecimento',
  `date`            DATE          NOT NULL,
  `startDate`       DATE          NULL,
  `endDate`         DATE          NULL,
  `days`            INT           NULL,
  `reason`          TEXT          NULL,
  `content`         TEXT          NOT NULL,
  `status`          ENUM('rascunho','finalizado','assinado','cancelado') NOT NULL DEFAULT 'rascunho',
  `d4signDocumentKey` VARCHAR(128) NULL,
  `signedAt`        TIMESTAMP     NULL,
  `signedPdfUrl`    TEXT          NULL,
  `sourceSystem`    VARCHAR(32)   NULL,
  `sourceId`        VARCHAR(64)   NULL,
  `createdAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_attest_patient` (`patientId`),
  FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`doctorId`)  REFERENCES `users`(`id`)    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 7. ORÇAMENTOS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `budgets` (
  `id`              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `patientId`       INT           NOT NULL,
  `doctorId`        INT           NOT NULL,
  `date`            DATE          NOT NULL,
  `validUntil`      DATE          NULL,
  `title`           VARCHAR(256)  NULL,
  `items`           TEXT          NOT NULL COMMENT 'JSON array: [{description, quantity, unitPrice, total}]',
  `subtotal`        DECIMAL(10,2) NOT NULL DEFAULT 0,
  `discount`        DECIMAL(10,2) NOT NULL DEFAULT 0,
  `total`           DECIMAL(10,2) NOT NULL DEFAULT 0,
  `status`          ENUM('rascunho','enviado','aprovado','recusado','cancelado') NOT NULL DEFAULT 'rascunho',
  `notes`           TEXT          NULL,
  `d4signDocumentKey` VARCHAR(128) NULL,
  `signedAt`        TIMESTAMP     NULL,
  `signedPdfUrl`    TEXT          NULL,
  `sourceSystem`    VARCHAR(32)   NULL,
  `sourceId`        VARCHAR(64)   NULL,
  `createdAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_budget_patient` (`patientId`),
  INDEX `idx_budget_status`  (`status`),
  FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`doctorId`)  REFERENCES `users`(`id`)    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 8. ESTOQUE / INVENTORY ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `inventory` (
  `id`              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name`            VARCHAR(256)  NOT NULL,
  `category`        VARCHAR(64)   NULL,
  `unit`            VARCHAR(32)   NULL COMMENT 'ml, mg, un, cx, etc.',
  `quantity`        DECIMAL(10,2) NOT NULL DEFAULT 0,
  `minStock`        DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Estoque mínimo para alerta',
  `maxStock`        DECIMAL(10,2) NULL,
  `location`        VARCHAR(128)  NULL COMMENT 'Local de armazenamento',
  `supplier`        VARCHAR(256)  NULL,
  `unitCost`        DECIMAL(10,2) NULL,
  `expirationDate`  DATE          NULL,
  `batchNumber`     VARCHAR(64)   NULL,
  `active`          TINYINT(1)    NOT NULL DEFAULT 1,
  `sourceSystem`    VARCHAR(32)   NULL,
  `sourceId`        VARCHAR(64)   NULL,
  `createdAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_inventory_name`     (`name`),
  INDEX `idx_inventory_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 9. MOVIMENTAÇÕES DE ESTOQUE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `inventory_movements` (
  `id`              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `inventoryId`     INT           NOT NULL,
  `type`            ENUM('entrada','saida','ajuste','descarte') NOT NULL,
  `quantity`        DECIMAL(10,2) NOT NULL,
  `previousQty`     DECIMAL(10,2) NOT NULL,
  `newQty`          DECIMAL(10,2) NOT NULL,
  `reason`          TEXT          NULL,
  `patientId`       INT           NULL,
  `appointmentId`   INT           NULL,
  `userId`          INT           NOT NULL,
  `createdAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_invmov_item` (`inventoryId`),
  FOREIGN KEY (`inventoryId`) REFERENCES `inventory`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 10. DOCUMENTOS GERAIS (CONTRATOS, FOTOS, ANEXOS) ────────────────────────
CREATE TABLE IF NOT EXISTS `patient_documents` (
  `id`              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `patientId`       INT           NOT NULL,
  `doctorId`        INT           NULL,
  `appointmentId`   INT           NULL,
  `medicalRecordId` INT           NULL,
  `type`            VARCHAR(64)   NOT NULL COMMENT 'contrato | foto | exame | laudo | outro',
  `name`            VARCHAR(256)  NOT NULL,
  `description`     TEXT          NULL,
  `fileUrl`         TEXT          NULL COMMENT 'URL no storage (S3 ou local)',
  `fileKey`         VARCHAR(256)  NULL,
  `fileSize`        INT           NULL COMMENT 'Tamanho em bytes',
  `mimeType`        VARCHAR(128)  NULL,
  `sourceSystem`    VARCHAR(32)   NULL,
  `sourceId`        VARCHAR(64)   NULL,
  `createdAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_pdoc_patient`  (`patientId`),
  INDEX `idx_pdoc_type`     (`type`),
  FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 11. FINANCEIRO / PAGAMENTOS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `payments` (
  `id`              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `patientId`       INT           NOT NULL,
  `doctorId`        INT           NULL,
  `appointmentId`   INT           NULL,
  `budgetId`        INT           NULL,
  `date`            DATE          NOT NULL,
  `amount`          DECIMAL(10,2) NOT NULL,
  `method`          VARCHAR(64)   NULL COMMENT 'dinheiro | cartao_credito | cartao_debito | pix | boleto | plano',
  `status`          ENUM('pendente','pago','estornado','cancelado') NOT NULL DEFAULT 'pendente',
  `description`     TEXT          NULL,
  `receipt`         TEXT          NULL,
  `sourceSystem`    VARCHAR(32)   NULL,
  `sourceId`        VARCHAR(64)   NULL,
  `createdAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_pay_patient`  (`patientId`),
  INDEX `idx_pay_date`     (`date`),
  INDEX `idx_pay_status`   (`status`),
  FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 12. EVOLUTION CLÍNICA (detalhada) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `clinical_evolutions` (
  `id`                   INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `patientId`            INT           NOT NULL,
  `doctorId`             INT           NOT NULL,
  `medicalRecordId`      INT           NULL,
  `appointmentId`        INT           NULL,
  `icdCode`              VARCHAR(16)   NULL,
  `icdDescription`       TEXT          NULL,
  `clinicalNotes`        TEXT          NOT NULL,
  `audioTranscription`   TEXT          NULL,
  `audioUrl`             TEXT          NULL,
  `audioKey`             VARCHAR(256)  NULL,
  `status`               ENUM('rascunho','finalizado','assinado','cancelado') NOT NULL DEFAULT 'rascunho',
  `d4signDocumentKey`    VARCHAR(128)  NULL,
  `d4signStatus`         ENUM('pendente','enviado','assinado','cancelado') NULL DEFAULT 'pendente',
  `signedAt`             TIMESTAMP     NULL,
  `signedByDoctorId`     INT           NULL,
  `signedByDoctorName`   VARCHAR(256)  NULL,
  `signedPdfUrl`         TEXT          NULL,
  `signatureHash`        VARCHAR(256)  NULL,
  `sourceSystem`         VARCHAR(32)   NULL,
  `sourceId`             VARCHAR(64)   NULL,
  `createdBy`            INT           NULL,
  `updatedBy`            INT           NULL,
  `createdAt`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_ce_patient`  (`patientId`),
  INDEX `idx_ce_doctor`   (`doctorId`),
  INDEX `idx_ce_source`   (`sourceSystem`, `sourceId`),
  FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`doctorId`)  REFERENCES `users`(`id`)    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 13. LOG DE IMPORTAÇÃO ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `import_log` (
  `id`            INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `sourceSystem`  VARCHAR(32) NOT NULL COMMENT 'prontuario_verde | ondoctor',
  `tableName`     VARCHAR(64) NOT NULL,
  `sourceId`      VARCHAR(64) NULL,
  `newId`         INT         NULL,
  `action`        ENUM('inserted','updated','skipped','error') NOT NULL,
  `notes`         TEXT        NULL,
  `importedAt`    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ilog_source` (`sourceSystem`, `tableName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Verificação ─────────────────────────────────────────────────────────────
-- SELECT table_name, table_rows FROM information_schema.tables
-- WHERE table_schema = 'glutec' ORDER BY table_name;
