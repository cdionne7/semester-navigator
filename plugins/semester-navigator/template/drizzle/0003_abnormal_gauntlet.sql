CREATE TABLE `cloud_oauth_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE INDEX `cloud_oauth_limits_expiry` ON `cloud_oauth_limits` (`expires_at`);