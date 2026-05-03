-- Hash at-rest dos tokens públicos (anamnese / mídia do paciente).
-- O token continua sendo gerado em bytes aleatórios e enviado ao paciente via
-- URL; o servidor compara somente o hash SHA-256, então um vazamento de
-- backup não expõe tokens válidos. A coluna `token` original é mantida por
-- enquanto para suportar links inflight; será removida em migration futura.

-- ─── anamnesis_share_links ──────────────────────────────────────────────────
ALTER TABLE `anamnesis_share_links`
  ADD COLUMN `tokenHash` CHAR(64) NULL AFTER `token`;

UPDATE `anamnesis_share_links`
SET `tokenHash` = SHA2(`token`, 256)
WHERE `tokenHash` IS NULL AND `token` IS NOT NULL;

CREATE UNIQUE INDEX `uq_anamnesis_share_links_token_hash`
  ON `anamnesis_share_links` (`tokenHash`);

-- ─── patient_media_upload_links ─────────────────────────────────────────────
ALTER TABLE `patient_media_upload_links`
  ADD COLUMN `tokenHash` CHAR(64) NULL AFTER `token`;

UPDATE `patient_media_upload_links`
SET `tokenHash` = SHA2(`token`, 256)
WHERE `tokenHash` IS NULL AND `token` IS NOT NULL;

CREATE UNIQUE INDEX `uq_patient_media_upload_links_token_hash`
  ON `patient_media_upload_links` (`tokenHash`);
