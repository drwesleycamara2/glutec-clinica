ALTER TABLE `anamnesis_share_links`
  ADD COLUMN `templateName` varchar(180) NULL AFTER `title`,
  ADD COLUMN `anamnesisDate` datetime NULL AFTER `templateName`,
  ADD COLUMN `source` varchar(32) NOT NULL DEFAULT 'share' AFTER `respondentName`,
  ADD COLUMN `profilePhotoUrl` text NULL AFTER `source`,
  ADD COLUMN `profilePhotoMimeType` varchar(120) NULL AFTER `profilePhotoUrl`,
  ADD COLUMN `profilePhotoDeclarationAccepted` tinyint(1) NOT NULL DEFAULT 0 AFTER `profilePhotoMimeType`;
