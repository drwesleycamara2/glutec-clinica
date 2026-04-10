ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `professionalLicenseType` VARCHAR(16) NULL AFTER `crm`,
  ADD COLUMN IF NOT EXISTS `professionalLicenseState` VARCHAR(2) NULL AFTER `professionalLicenseType`;
