-- Rollup de segurança:
--   1) Hash at-rest do token de convite (user_invitations.tokenHash)
--   2) Sessão revogável globalmente (users.sessionEpoch)
--   3) Drop da coluna `token` em anamnesis_share_links e
--      patient_media_upload_links (todas as leituras já usam tokenHash)

-- ─── 1) user_invitations ────────────────────────────────────────────────────
ALTER TABLE `user_invitations`
  ADD COLUMN `tokenHash` CHAR(64) NULL AFTER `token`;

UPDATE `user_invitations`
SET `tokenHash` = SHA2(`token`, 256)
WHERE `tokenHash` IS NULL AND `token` IS NOT NULL;

CREATE UNIQUE INDEX `uq_user_invitations_token_hash`
  ON `user_invitations` (`tokenHash`);

-- ─── 2) users.sessionEpoch ──────────────────────────────────────────────────
-- Incrementado quando o usuário pede "sair de todos os dispositivos".
-- O JWT de sessão guarda o epoch do momento do login; quando o valor no
-- banco diverge, o servidor invalida o cookie sem precisar de blacklist.
ALTER TABLE `users`
  ADD COLUMN `sessionEpoch` INT NOT NULL DEFAULT 0;

-- ─── 3) Drop tokens em texto puro nas tabelas de links públicos ────────────
ALTER TABLE `anamnesis_share_links` DROP COLUMN `token`;
ALTER TABLE `patient_media_upload_links` DROP COLUMN `token`;
