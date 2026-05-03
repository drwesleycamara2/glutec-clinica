-- Tabela de log de auditoria (LGPD): registra leituras e ações sensíveis
-- sobre dados de pacientes (PHI). Insere via auditPatientRead/auditAction.
-- Append-only — não há UPDATE/DELETE no código de aplicação.

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  userId INT NULL,
  userEmail VARCHAR(255) NULL,
  userRole VARCHAR(50) NULL,
  action VARCHAR(100) NOT NULL,
  resourceType VARCHAR(50) NULL,
  resourceId BIGINT NULL,
  patientId INT NULL,
  metadata TEXT NULL,
  ipAddress VARCHAR(64) NULL,
  userAgent VARCHAR(512) NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_user_created (userId, createdAt),
  KEY idx_audit_patient_created (patientId, createdAt),
  KEY idx_audit_action_created (action, createdAt),
  KEY idx_audit_resource (resourceType, resourceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
