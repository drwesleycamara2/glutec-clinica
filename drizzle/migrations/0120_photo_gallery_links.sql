ALTER TABLE `patient_photos`
  ADD COLUMN `folderId` int NULL AFTER `patientId`,
  ADD COLUMN `mimeType` varchar(128) NULL AFTER `photoKey`,
  ADD COLUMN `originalFileName` varchar(255) NULL AFTER `mimeType`,
  ADD COLUMN `mediaType` enum('image','video') NOT NULL DEFAULT 'image' AFTER `originalFileName`,
  ADD COLUMN `mediaSource` enum('clinic','patient') NOT NULL DEFAULT 'clinic' AFTER `uploadedBy`;

CREATE TABLE IF NOT EXISTS `photo_folders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patientId` int NOT NULL,
  `name` varchar(160) NOT NULL,
  `description` text NULL,
  `createdBy` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_photo_folders_patient` (`patientId`)
);

CREATE TABLE IF NOT EXISTS `patient_media_upload_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patientId` int NOT NULL,
  `folderId` int NULL,
  `token` varchar(96) NOT NULL,
  `title` varchar(180) NULL,
  `allowVideos` tinyint(1) NOT NULL DEFAULT 1,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `expiresAt` timestamp NOT NULL,
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_patient_media_upload_links_token` (`token`),
  KEY `idx_patient_media_upload_links_patient` (`patientId`)
);

CREATE TABLE IF NOT EXISTS `photo_comparisons` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patientId` int NOT NULL,
  `comparisonId` varchar(96) NOT NULL,
  `photoIds` json NOT NULL,
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_photo_comparisons_comparison_id` (`comparisonId`)
);
