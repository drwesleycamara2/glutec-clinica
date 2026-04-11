-- Tabela para rastrear sessões de assinatura digital em nuvem (VIDaaS / BirdID)
CREATE TABLE IF NOT EXISTS signature_sessions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  userId          INT NOT NULL,
  provider        ENUM('vidaas', 'birdid') NOT NULL DEFAULT 'vidaas',
  documentType    VARCHAR(64) NOT NULL,   -- 'evolucao', 'atestado', 'prescricao', 'exame'
  documentId      INT NOT NULL,
  documentAlias   VARCHAR(256) NOT NULL,
  documentHash    VARCHAR(512) NOT NULL,  -- SHA-256 em Base64
  authorizeCode   VARCHAR(512) NULL,      -- código retornado pelo provedor no push flow
  codeVerifier    VARCHAR(512) NULL,      -- PKCE verifier
  accessToken     TEXT NULL,
  signatureCms    TEXT NULL,              -- assinatura CMS retornada pelo provedor
  status          ENUM('pendente','autorizado','assinado','expirado','erro') NOT NULL DEFAULT 'pendente',
  errorMessage    TEXT NULL,
  signerCpf       VARCHAR(14) NULL,
  expiresAt       DATETIME NOT NULL,
  createdAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ss_userId (userId),
  INDEX idx_ss_status (status),
  INDEX idx_ss_doc (documentType, documentId)
);

-- Coluna para guardar o status de assinatura A3 nas evoluções clínicas
ALTER TABLE clinical_evolutions
  ADD COLUMN IF NOT EXISTS signatureSessionId INT NULL AFTER signatureValidationCode;

-- Colunas para atestados
ALTER TABLE attestations
  ADD COLUMN IF NOT EXISTS signatureSessionId INT NULL,
  ADD COLUMN IF NOT EXISTS signedAt DATETIME NULL,
  ADD COLUMN IF NOT EXISTS signedByName VARCHAR(256) NULL,
  ADD COLUMN IF NOT EXISTS signatureCms TEXT NULL,
  ADD COLUMN IF NOT EXISTS signatureProvider VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS signatureValidationCode VARCHAR(128) NULL;

-- Colunas para prescrições
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS signatureSessionId INT NULL,
  ADD COLUMN IF NOT EXISTS signedAt DATETIME NULL,
  ADD COLUMN IF NOT EXISTS signedByName VARCHAR(256) NULL,
  ADD COLUMN IF NOT EXISTS signatureCms TEXT NULL,
  ADD COLUMN IF NOT EXISTS signatureProvider VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS signatureValidationCode VARCHAR(128) NULL;

-- Colunas para pedidos de exame
ALTER TABLE exam_requests
  ADD COLUMN IF NOT EXISTS signatureSessionId INT NULL,
  ADD COLUMN IF NOT EXISTS signedAt DATETIME NULL,
  ADD COLUMN IF NOT EXISTS signedByName VARCHAR(256) NULL,
  ADD COLUMN IF NOT EXISTS signatureCms TEXT NULL,
  ADD COLUMN IF NOT EXISTS signatureProvider VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS signatureValidationCode VARCHAR(128) NULL;
