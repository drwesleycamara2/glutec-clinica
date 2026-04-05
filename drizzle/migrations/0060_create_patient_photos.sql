-- ============================================================
-- Migração: Criação da tabela patient_photos
-- Data: 2026-04-05
-- Descrição: Reintroduz a tabela usada pelo backend e pelos
--            importadores legados para fotos e imagens clínicas.
-- ============================================================

CREATE TABLE IF NOT EXISTS `patient_photos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patientId` int NOT NULL,
  `medicalRecordId` int NULL,
  `category` enum('antes','depois','evolucao','exame','documento','outro') NOT NULL DEFAULT 'outro',
  `description` text NULL,
  `photoUrl` text NOT NULL,
  `photoKey` varchar(256) NOT NULL,
  `thumbnailUrl` text NULL,
  `annotations` json NULL,
  `sortOrder` int NULL DEFAULT 0,
  `takenAt` timestamp NULL DEFAULT NULL,
  `uploadedBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_patient_photos_patient` (`patientId`),
  KEY `idx_patient_photos_photo_key` (`photoKey`),
  KEY `idx_patient_photos_uploaded_by` (`uploadedBy`)
);
