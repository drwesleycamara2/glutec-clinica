CREATE TABLE IF NOT EXISTS `anamnesis_share_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patientId` int NOT NULL,
  `token` varchar(96) NOT NULL,
  `title` varchar(180) DEFAULT NULL,
  `questionsJson` longtext NOT NULL,
  `submittedAnswers` longtext DEFAULT NULL,
  `respondentName` varchar(180) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `expiresAt` timestamp NOT NULL,
  `submittedAt` timestamp NULL DEFAULT NULL,
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anamnesis_share_links_token` (`token`),
  KEY `idx_anamnesis_share_links_patient` (`patientId`),
  KEY `idx_anamnesis_share_links_active` (`isActive`, `expiresAt`)
);
