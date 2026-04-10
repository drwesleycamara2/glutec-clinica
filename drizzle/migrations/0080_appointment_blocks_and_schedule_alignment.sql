CREATE TABLE IF NOT EXISTS `appointment_blocks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `title` varchar(160) NOT NULL,
  `notes` text,
  `room` varchar(32),
  `doctorId` int,
  `startsAt` datetime NOT NULL,
  `endsAt` datetime NOT NULL,
  `createdBy` int,
  `active` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `appointment_blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointments`
  ADD COLUMN IF NOT EXISTS `room` varchar(32),
  ADD COLUMN IF NOT EXISTS `duration` int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS `cancelReason` text;
