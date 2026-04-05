CREATE TABLE `audio_transcriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`medicalRecordId` int,
	`userId` int NOT NULL,
	`audioUrl` text NOT NULL,
	`audioKey` varchar(256) NOT NULL,
	`transcription` text,
	`language` varchar(10) DEFAULT 'pt',
	`status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `audio_transcriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clinical_evolutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int NOT NULL,
	`evolutionText` text NOT NULL,
	`status` enum('rascunho','finalizado','assinado') NOT NULL DEFAULT 'rascunho',
	`d4signDocumentKey` varchar(255),
	`d4signStatus` varchar(255),
	`signedAt` timestamp,
	`signedByDoctorId` int,
	`signedByDoctorName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clinical_evolutions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `icd10_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(16) NOT NULL,
	`description` text NOT NULL,
	`descriptionAbbrev` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `icd10_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `icd10_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `signature_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicalEvolutionId` int NOT NULL,
	`doctorId` int NOT NULL,
	`doctorName` varchar(255) NOT NULL,
	`doctorCRM` varchar(255),
	`action` varchar(255) NOT NULL,
	`signatureMethod` varchar(255) NOT NULL,
	`signatureTimestamp` timestamp NOT NULL DEFAULT (now()),
	`d4signDocumentKey` varchar(255),
	`ipAddress` varchar(45),
	`userAgent` text,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signature_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_favorite_icds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`icd10CodeId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_favorite_icds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password` varchar(255) NOT NULL,
	`name` varchar(255),
	`role` varchar(255) DEFAULT 'user',
	`status` enum('pending','active','inactive') NOT NULL DEFAULT 'pending',
	`two_factor_secret` varchar(255),
	`two_factor_enabled` boolean DEFAULT false,
	`invite_token` varchar(255),
	`permissions` text,
	`created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `users_invite_token_unique` UNIQUE(`invite_token`)
);
