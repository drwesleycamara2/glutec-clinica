CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int NOT NULL,
	`scheduledAt` datetime NOT NULL,
	`durationMinutes` int NOT NULL DEFAULT 30,
	`type` enum('consulta','retorno','exame','procedimento','teleconsulta') NOT NULL DEFAULT 'consulta',
	`status` enum('agendada','confirmada','em_atendimento','concluida','cancelada','falta') NOT NULL DEFAULT 'agendada',
	`notes` text,
	`cancellationReason` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(64) NOT NULL,
	`resourceType` varchar(64) NOT NULL,
	`resourceId` int,
	`patientId` int,
	`details` json,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_signatures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resourceType` enum('prescription','exam_request','medical_record') NOT NULL,
	`resourceId` int NOT NULL,
	`doctorId` int NOT NULL,
	`d4signDocumentKey` varchar(128),
	`d4signSafeKey` varchar(128),
	`status` enum('pendente','enviado','assinado','cancelado','erro') NOT NULL DEFAULT 'pendente',
	`signatureType` enum('eletronica','icp_brasil_a1','icp_brasil_a3') DEFAULT 'eletronica',
	`signedAt` timestamp,
	`signedDocumentUrl` text,
	`webhookData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `document_signatures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exam_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int NOT NULL,
	`medicalRecordId` int,
	`appointmentId` int,
	`specialty` varchar(128),
	`exams` json NOT NULL,
	`clinicalIndication` text,
	`observations` text,
	`pdfUrl` text,
	`pdfKey` varchar(256),
	`d4signDocumentKey` varchar(128),
	`d4signStatus` enum('pendente','enviado','assinado','cancelado') DEFAULT 'pendente',
	`signedAt` timestamp,
	`signedPdfUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `medical_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`appointmentId` int,
	`doctorId` int NOT NULL,
	`chiefComplaint` text,
	`historyOfPresentIllness` text,
	`pastMedicalHistory` text,
	`familyHistory` text,
	`socialHistory` text,
	`currentMedications` text,
	`allergies` text,
	`physicalExam` text,
	`vitalSigns` json,
	`diagnosis` text,
	`icdCode` varchar(16),
	`clinicalEvolution` text,
	`treatmentPlan` text,
	`signedAt` timestamp,
	`signedByDoctorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `medical_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fullName` varchar(256) NOT NULL,
	`birthDate` date,
	`gender` enum('masculino','feminino','outro','nao_informado') DEFAULT 'nao_informado',
	`cpf` varchar(14),
	`rg` varchar(20),
	`phone` varchar(20),
	`email` varchar(320),
	`address` text,
	`city` varchar(128),
	`state` varchar(2),
	`zipCode` varchar(9),
	`insuranceName` varchar(128),
	`insuranceNumber` varchar(64),
	`photoUrl` text,
	`photoKey` varchar(256),
	`bloodType` enum('A+','A-','B+','B-','AB+','AB-','O+','O-','desconhecido') DEFAULT 'desconhecido',
	`allergies` text,
	`chronicConditions` text,
	`emergencyContactName` varchar(256),
	`emergencyContactPhone` varchar(20),
	`active` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `patients_cpf_unique` UNIQUE(`cpf`)
);
--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int NOT NULL,
	`medicalRecordId` int,
	`appointmentId` int,
	`type` enum('simples','especial_azul','especial_amarelo','antimicrobiano') NOT NULL DEFAULT 'simples',
	`items` json NOT NULL,
	`observations` text,
	`pdfUrl` text,
	`pdfKey` varchar(256),
	`d4signDocumentKey` varchar(128),
	`d4signStatus` enum('pendente','enviado','assinado','cancelado') DEFAULT 'pendente',
	`signedAt` timestamp,
	`signedPdfUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prescriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`doctorId` int NOT NULL,
	`startAt` datetime NOT NULL,
	`endAt` datetime NOT NULL,
	`reason` varchar(256),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `schedule_blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','medico','recepcionista','enfermeiro','user') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `specialty` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `crm` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `active` boolean DEFAULT true NOT NULL;