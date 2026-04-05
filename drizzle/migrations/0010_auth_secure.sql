-- ============================================================
-- Migração: Sistema de Autenticação Segura
-- Data: 2026-03-26
-- Descrição: Adiciona suporte a 2FA, convites e configurações SMTP
-- ============================================================

-- 1. Adicionar colunas de autenticação local e 2FA na tabela users
ALTER TABLE `users`
  -- Autenticação local
  ADD COLUMN IF NOT EXISTS `passwordHash`          TEXT         NULL          COMMENT 'Senha hasheada com bcrypt',
  ADD COLUMN IF NOT EXISTS `mustChangePassword`    INT          NOT NULL DEFAULT 0,

  -- 2FA (TOTP)
  ADD COLUMN IF NOT EXISTS `twoFactorSecret`       TEXT         NULL          COMMENT 'Secret TOTP',
  ADD COLUMN IF NOT EXISTS `twoFactorEnabled`      INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `twoFactorBackupCodes`  TEXT         NULL          COMMENT 'JSON array de backup codes hasheados',

  -- Metadados extras
  ADD COLUMN IF NOT EXISTS `specialty`             VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS `crm`                   VARCHAR(32)  NULL,
  ADD COLUMN IF NOT EXISTS `phone`                 VARCHAR(32)  NULL;

-- 2. Atualizar ENUM do campo role para incluir novos papéis
-- (MySQL não suporta ADD IF NOT EXISTS para ENUM; verificar antes de executar)
ALTER TABLE `users`
  MODIFY COLUMN `role`
    ENUM('user','admin','medico','recepcionista','enfermeiro')
    NOT NULL DEFAULT 'user';

-- 3. Adicionar UNIQUE no e-mail (se ainda não tiver)
-- Verificar antes se já existe: SHOW INDEXES FROM users WHERE Key_name = 'users_email_unique';
ALTER TABLE `users`
  ADD UNIQUE INDEX IF NOT EXISTS `users_email_unique` (`email`);

-- 4. Criar tabela de convites
CREATE TABLE IF NOT EXISTS `user_invitations` (
  `id`          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `email`       VARCHAR(320) NOT NULL,
  `name`        TEXT         NULL,
  `role`        ENUM('user','admin','medico','recepcionista','enfermeiro') NOT NULL DEFAULT 'user',
  `token`       VARCHAR(128) NOT NULL UNIQUE  COMMENT 'Token único e seguro (hex 64 chars)',
  `invitedById` INT          NOT NULL         COMMENT 'userId do admin que enviou o convite',
  `expiresAt`   TIMESTAMP    NOT NULL         COMMENT 'Expira em 48 horas',
  `usedAt`      TIMESTAMP    NULL DEFAULT NULL COMMENT 'Quando foi aceito (NULL = pendente)',
  `createdAt`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_invitations_email` (`email`),
  INDEX `idx_invitations_token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Criar tabela de configurações SMTP
CREATE TABLE IF NOT EXISTS `smtp_settings` (
  `id`        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `host`      VARCHAR(256) NOT NULL,
  `port`      INT          NOT NULL DEFAULT 587,
  `secure`    INT          NOT NULL DEFAULT 0    COMMENT '0 = STARTTLS, 1 = SSL/TLS',
  `user`      VARCHAR(320) NOT NULL,
  `password`  TEXT         NOT NULL,
  `fromName`  VARCHAR(128) NULL,
  `fromEmail` VARCHAR(320) NULL,
  `updatedAt` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Verificação final
-- ============================================================
-- SELECT 'user_invitations' as tabela, COUNT(*) as registros FROM user_invitations
-- UNION ALL
-- SELECT 'smtp_settings', COUNT(*) FROM smtp_settings;
