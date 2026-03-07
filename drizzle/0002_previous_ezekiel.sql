CREATE TABLE `anamnesis_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`templateId` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`responses` json,
	`status` enum('pendente','preenchido','expirado') NOT NULL DEFAULT 'pendente',
	`expiresAt` timestamp NOT NULL,
	`completedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `anamnesis_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `anamnesis_links_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `audio_transcriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`medicalRecordId` int,
	`patientId` int NOT NULL,
	`audioUrl` text NOT NULL,
	`audioKey` varchar(256) NOT NULL,
	`transcription` text,
	`suggestedDiagnosis` text,
	`status` enum('processando','concluido','erro') NOT NULL DEFAULT 'processando',
	`durationSeconds` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audio_transcriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`procedureId` int NOT NULL,
	`procedureName` varchar(256) NOT NULL,
	`areaId` int NOT NULL,
	`areaName` varchar(128) NOT NULL,
	`complexity` enum('P','M','G') NOT NULL,
	`unitPriceInCents` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`subtotalInCents` int NOT NULL,
	`sortOrder` int DEFAULT 0,
	CONSTRAINT `budget_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_payment_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`type` enum('a_vista','parcelado_sem_juros','parcelado_com_juros','financiamento','pagamento_programado') NOT NULL,
	`discountPercent` decimal(5,2) DEFAULT '0',
	`maxInstallments` int DEFAULT 1,
	`interestRatePercent` decimal(5,2) DEFAULT '0',
	`description` text,
	`active` boolean NOT NULL DEFAULT true,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `budget_payment_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_procedure_areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`procedureId` int NOT NULL,
	`areaName` varchar(128) NOT NULL,
	`sortOrder` int DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `budget_procedure_areas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_procedure_catalog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`category` varchar(128),
	`description` text,
	`estimatedSessionsMin` int DEFAULT 1,
	`estimatedSessionsMax` int DEFAULT 1,
	`sessionIntervalDays` int DEFAULT 30,
	`active` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budget_procedure_catalog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_procedure_pricing` (
	`id` int AUTO_INCREMENT NOT NULL,
	`procedureId` int NOT NULL,
	`areaId` int NOT NULL,
	`complexity` enum('P','M','G') NOT NULL,
	`priceInCents` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budget_procedure_pricing_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int NOT NULL,
	`status` enum('rascunho','emitido','aprovado','rejeitado','expirado','cancelado') NOT NULL DEFAULT 'rascunho',
	`totalInCents` int NOT NULL DEFAULT 0,
	`discountInCents` int DEFAULT 0,
	`finalTotalInCents` int NOT NULL DEFAULT 0,
	`selectedPaymentPlanId` int,
	`paymentConditions` json,
	`estimatedSessions` int,
	`sessionIntervalDescription` varchar(256),
	`clinicalNotes` text,
	`validityDays` int DEFAULT 10,
	`expiresAt` timestamp,
	`approvedAt` timestamp,
	`pdfUrl` text,
	`pdfKey` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budgets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelId` varchar(64) NOT NULL DEFAULT 'geral',
	`senderId` int NOT NULL,
	`content` text NOT NULL,
	`messageType` enum('text','file','system') NOT NULL DEFAULT 'text',
	`fileUrl` text,
	`fileKey` varchar(256),
	`mentions` json,
	`readBy` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clinic_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`tradeName` varchar(256),
	`cnpj` varchar(18),
	`stateRegistration` varchar(32),
	`phone` varchar(20),
	`email` varchar(320),
	`website` varchar(256),
	`address` text,
	`city` varchar(128),
	`state` varchar(2),
	`zipCode` varchar(9),
	`neighborhood` varchar(128),
	`logoUrl` text,
	`logoKey` varchar(256),
	`specialties` json,
	`openingHours` json,
	`d4signTokenApi` varchar(256),
	`d4signCryptKey` varchar(256),
	`d4signSafeKey` varchar(256),
	`nfeConfig` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clinic_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_indications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`procedureName` varchar(256) NOT NULL,
	`notes` text,
	`status` enum('indicado','agendado','realizado','cancelado') NOT NULL DEFAULT 'indicado',
	`indicatedBy` int NOT NULL,
	`convertedAt` timestamp,
	`appointmentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crm_indications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('receita','despesa') NOT NULL,
	`category` varchar(128) NOT NULL,
	`description` varchar(512) NOT NULL,
	`amountInCents` int NOT NULL,
	`paymentMethod` enum('pix','dinheiro','cartao_credito','cartao_debito','transferencia','boleto','outro'),
	`patientId` int,
	`budgetId` int,
	`appointmentId` int,
	`dueDate` date,
	`paidAt` timestamp,
	`status` enum('pendente','pago','atrasado','cancelado') NOT NULL DEFAULT 'pendente',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financial_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`type` enum('entrada','saida','ajuste') NOT NULL,
	`quantity` int NOT NULL,
	`reason` varchar(256),
	`patientId` int,
	`appointmentId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`sku` varchar(64),
	`category` varchar(128),
	`description` text,
	`unit` varchar(32) DEFAULT 'un',
	`currentStock` int NOT NULL DEFAULT 0,
	`minimumStock` int DEFAULT 5,
	`costPriceInCents` int,
	`supplierName` varchar(256),
	`supplierContact` varchar(128),
	`active` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_products_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `medical_record_chaperones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`medicalRecordId` int NOT NULL,
	`userId` int NOT NULL,
	`role` varchar(64) DEFAULT 'assistente',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `medical_record_chaperones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `medical_record_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`specialty` varchar(128),
	`description` text,
	`sections` json NOT NULL,
	`isDefault` boolean DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `medical_record_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patient_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`type` enum('exame_pdf','exame_imagem','video','rg','cpf','convenio','termo','outro') NOT NULL DEFAULT 'outro',
	`title` varchar(256) NOT NULL,
	`description` text,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(256) NOT NULL,
	`mimeType` varchar(128),
	`fileSizeBytes` int,
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `patient_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patient_photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`medicalRecordId` int,
	`category` enum('antes','depois','evolucao','exame','documento','outro') NOT NULL DEFAULT 'outro',
	`description` text,
	`photoUrl` text NOT NULL,
	`photoKey` varchar(256) NOT NULL,
	`thumbnailUrl` text,
	`annotations` json,
	`sortOrder` int DEFAULT 0,
	`takenAt` timestamp,
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `patient_photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`module` varchar(64) NOT NULL,
	`canCreate` boolean NOT NULL DEFAULT false,
	`canRead` boolean NOT NULL DEFAULT true,
	`canUpdate` boolean NOT NULL DEFAULT false,
	`canDelete` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionToken` varchar(256) NOT NULL,
	`ipAddress` varchar(45),
	`userAgent` text,
	`loginMethod` varchar(32) NOT NULL DEFAULT 'password',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	CONSTRAINT `user_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_sessions_sessionToken_unique` UNIQUE(`sessionToken`)
);
--> statement-breakpoint
ALTER TABLE `document_signatures` MODIFY COLUMN `resourceType` enum('prescription','exam_request','medical_record','budget') NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `sessionId` int;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `dataBefore` json;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `dataAfter` json;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `integrityHash` varchar(64);--> statement-breakpoint
ALTER TABLE `medical_records` ADD `templateId` int;--> statement-breakpoint
ALTER TABLE `medical_records` ADD `templateResponses` json;--> statement-breakpoint
ALTER TABLE `medical_records` ADD `recordType` enum('livre','template','misto') DEFAULT 'livre';--> statement-breakpoint
ALTER TABLE `patients` ADD `referralSource` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(256);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordSalt` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `mustChangePassword` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD `failedLoginAttempts` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `lockedUntil` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `lastPasswordChange` timestamp;