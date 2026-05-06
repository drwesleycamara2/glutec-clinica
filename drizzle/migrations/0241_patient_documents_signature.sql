ALTER TABLE `patient_documents`
  ADD COLUMN `signedAt` datetime NULL AFTER `mimeType`,
  ADD COLUMN `signedBy` varchar(255) NULL AFTER `signedAt`,
  ADD COLUMN `signatureSourceUrl` text NULL AFTER `signedBy`,
  ADD COLUMN `signatureNote` text NULL AFTER `signatureSourceUrl`,
  ADD COLUMN `signatureProvider` varchar(64) NULL AFTER `signatureNote`,
  ADD COLUMN `signatureMethod` varchar(64) NULL AFTER `signatureProvider`;