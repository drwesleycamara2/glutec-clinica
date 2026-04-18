-- Extende signature_sessions para suportar Certillion
-- (agregador que intermedia VIDAAS / BirdID / CERTILLION_SIGNER)

ALTER TABLE signature_sessions
  MODIFY COLUMN provider VARCHAR(32) NOT NULL DEFAULT 'vidaas';

ALTER TABLE signature_sessions
  ADD COLUMN IF NOT EXISTS psc VARCHAR(32) NULL AFTER provider,
  ADD COLUMN IF NOT EXISTS clientToken TEXT NULL AFTER accessToken,
  ADD COLUMN IF NOT EXISTS stateNonce VARCHAR(128) NULL AFTER codeVerifier;

-- Config Certillion na tabela de clínica (reutiliza padrão de credenciais globais).
-- Por ser credencial da clínica toda (não por usuário), fica em clinic_settings.
ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS certillionClientId VARCHAR(256) NULL,
  ADD COLUMN IF NOT EXISTS certillionClientSecret VARCHAR(512) NULL,
  ADD COLUMN IF NOT EXISTS certillionRedirectUri VARCHAR(512) NULL,
  ADD COLUMN IF NOT EXISTS certillionBaseUrl VARCHAR(256) NULL DEFAULT 'https://cloud.certillion.com',
  ADD COLUMN IF NOT EXISTS certillionDefaultPsc VARCHAR(32) NULL DEFAULT 'VIDAAS',
  ADD COLUMN IF NOT EXISTS certillionEnabled TINYINT(1) NOT NULL DEFAULT 0;

-- Índice para buscas por state no callback
CREATE INDEX idx_ss_state ON signature_sessions (stateNonce);
