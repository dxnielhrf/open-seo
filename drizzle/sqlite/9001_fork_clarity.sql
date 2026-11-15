-- Fork (Microsoft Clarity). Numbered 9001 so it never collides with an
-- upstream migration name; see FORK.md.
CREATE TABLE `clarity_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`clarity_project_id` text,
	`encrypted_token` text NOT NULL,
	`connected_by_user_id` text NOT NULL,
	`last_snapshot_at` text,
	`last_error` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clarity_connections_project_idx` ON `clarity_connections` (`project_id`);
--> statement-breakpoint
CREATE TABLE `clarity_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`snapshot_date` text NOT NULL,
	`dimension` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clarity_snapshots_day_idx` ON `clarity_snapshots` (`project_id`,`snapshot_date`,`dimension`);
