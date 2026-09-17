CREATE TABLE `cloud_oauth_records` (
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer,
	PRIMARY KEY(`kind`, `key`)
);
--> statement-breakpoint
CREATE INDEX `cloud_oauth_expiry` ON `cloud_oauth_records` (`expires_at`);--> statement-breakpoint
CREATE TABLE `cloud_student_plans` (
	`owner_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`seed_payload` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`owner_id`, `profile_id`)
);
