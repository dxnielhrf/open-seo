-- Fork (server logs). Numbered 9002 so it never collides with an upstream
-- migration name; see FORK.md.
CREATE TABLE `server_log_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_ingest_at` text,
	`last_ingest_date` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_log_sources_project_idx` ON `server_log_sources` (`project_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_log_sources_token_idx` ON `server_log_sources` (`token_hash`);
--> statement-breakpoint
CREATE TABLE `server_log_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`path` text NOT NULL,
	`status` integer NOT NULL,
	`bot` text NOT NULL,
	`hits` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_log_daily_row_idx` ON `server_log_daily` (`project_id`,`date`,`path`,`status`,`bot`);
