-- ─── Alert Configuration Tables ──────────────────────────────────────────────────
-- Tabelas para suportar Alertas Condicionais de Anamnese e Alertas de Alergias Persistentes

-- Tabela: anamnesisQuestionAlerts
-- Armazena configurações de alertas para perguntas específicas em formulários de anamnese
CREATE TABLE `anamnesis_question_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int NOT NULL,
	`questionId` varchar(256) NOT NULL,
	`triggerResponses` json NOT NULL,
	`alertMessage` text NOT NULL,
	`alertTitle` varchar(256),
	`severity` enum('informativo','atencao','critico') NOT NULL DEFAULT 'atencao',
	`displayScreens` json NOT NULL,
	`active` tinyint(1) NOT NULL DEFAULT 1,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `anamnesis_question_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `anamnesis_question_alerts_templateId_fk` FOREIGN KEY (`templateId`) REFERENCES `medical_record_templates`(`id`),
	CONSTRAINT `anamnesis_question_alerts_createdBy_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`),
	KEY `anamnesis_question_alerts_templateId_idx` (`templateId`),
	KEY `anamnesis_question_alerts_active_idx` (`active`)
);

-- Tabela: patientAnamnesisAlerts
-- Armazena alertas ativos para cada paciente, baseado nas respostas de anamnese
CREATE TABLE `patient_anamnesis_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`medicalRecordId` int,
	`questionAlertId` int NOT NULL,
	`alertMessage` text NOT NULL,
	`alertTitle` varchar(256),
	`severity` enum('informativo','atencao','critico') NOT NULL DEFAULT 'atencao',
	`displayScreens` json NOT NULL,
	`triggerResponse` varchar(256) NOT NULL,
	`isActive` tinyint(1) NOT NULL DEFAULT 1,
	`dismissedAt` timestamp,
	`dismissedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patient_anamnesis_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `patient_anamnesis_alerts_patientId_fk` FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`),
	CONSTRAINT `patient_anamnesis_alerts_medicalRecordId_fk` FOREIGN KEY (`medicalRecordId`) REFERENCES `medical_records`(`id`),
	CONSTRAINT `patient_anamnesis_alerts_questionAlertId_fk` FOREIGN KEY (`questionAlertId`) REFERENCES `anamnesis_question_alerts`(`id`),
	CONSTRAINT `patient_anamnesis_alerts_dismissedBy_fk` FOREIGN KEY (`dismissedBy`) REFERENCES `users`(`id`),
	KEY `patient_anamnesis_alerts_patientId_idx` (`patientId`),
	KEY `patient_anamnesis_alerts_isActive_idx` (`isActive`),
	KEY `patient_anamnesis_alerts_severity_idx` (`severity`)
);

-- Tabela: patientAllergies
-- Tabela centralizada para armazenar alergias de pacientes
CREATE TABLE `patient_allergies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`allergen` varchar(256) NOT NULL,
	`reactionType` varchar(128),
	`severity` enum('leve','moderada','grave','desconhecida') NOT NULL DEFAULT 'desconhecida',
	`description` text,
	`source` enum('cadastro_paciente','anamnese','evolucao','outro') NOT NULL DEFAULT 'outro',
	`medicalRecordId` int,
	`active` tinyint(1) NOT NULL DEFAULT 1,
	`recordedBy` int NOT NULL,
	`recordedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patient_allergies_id` PRIMARY KEY(`id`),
	CONSTRAINT `patient_allergies_patientId_fk` FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`),
	CONSTRAINT `patient_allergies_medicalRecordId_fk` FOREIGN KEY (`medicalRecordId`) REFERENCES `medical_records`(`id`),
	CONSTRAINT `patient_allergies_recordedBy_fk` FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`),
	KEY `patient_allergies_patientId_idx` (`patientId`),
	KEY `patient_allergies_allergen_idx` (`allergen`),
	KEY `patient_allergies_active_idx` (`active`),
	KEY `patient_allergies_severity_idx` (`severity`),
	UNIQUE KEY `patient_allergies_unique` (`patientId`, `allergen`)
);

-- Tabela: alertDisplayLog
-- Log de quando e onde os alertas foram exibidos para auditoria
CREATE TABLE `alert_display_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alertType` enum('anamnesis_conditional','allergy_persistent') NOT NULL,
	`patientId` int NOT NULL,
	`alertId` int,
	`screen` varchar(128) NOT NULL,
	`sessionId` varchar(256),
	`viewedAt` timestamp NOT NULL,
	`viewedBy` int NOT NULL,
	`acknowledged` tinyint(1) NOT NULL DEFAULT 0,
	`acknowledgedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alert_display_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `alert_display_log_patientId_fk` FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`),
	CONSTRAINT `alert_display_log_viewedBy_fk` FOREIGN KEY (`viewedBy`) REFERENCES `users`(`id`),
	KEY `alert_display_log_patientId_idx` (`patientId`),
	KEY `alert_display_log_alertType_idx` (`alertType`),
	KEY `alert_display_log_viewedAt_idx` (`viewedAt`)
);
