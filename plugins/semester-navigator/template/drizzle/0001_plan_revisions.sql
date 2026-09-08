ALTER TABLE `semester_plans` ADD `revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `semester_plans` ADD `seed_payload` text;
