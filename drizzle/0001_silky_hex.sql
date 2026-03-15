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
CREATE TABLE `user_favorite_icds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`icd10CodeId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_favorite_icds_id` PRIMARY KEY(`id`)
);
