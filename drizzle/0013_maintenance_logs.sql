CREATE TABLE `maintenance_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`category` text,
	`company` text,
	`cost_cents` integer,
	`started_at` integer,
	`completed_at` integer,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `maintenance_logs_status_updated_at_idx` ON `maintenance_logs` (`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `maintenance_logs_category_idx` ON `maintenance_logs` (`category`);
--> statement-breakpoint
CREATE INDEX `maintenance_logs_company_idx` ON `maintenance_logs` (`company`);
--> statement-breakpoint
CREATE TABLE `maintenance_log_links` (
	`id` text PRIMARY KEY NOT NULL,
	`maintenance_log_id` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`maintenance_log_id`) REFERENCES `maintenance_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `maintenance_log_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_log_tags_name_idx` ON `maintenance_log_tags` (`name`);
--> statement-breakpoint
CREATE TABLE `maintenance_log_item_tags` (
	`maintenance_log_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`maintenance_log_id`, `tag_id`),
	FOREIGN KEY (`maintenance_log_id`) REFERENCES `maintenance_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `maintenance_log_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maintenance_log_item_tags_log_id_idx` ON `maintenance_log_item_tags` (`maintenance_log_id`);
--> statement-breakpoint
CREATE INDEX `maintenance_log_item_tags_tag_id_idx` ON `maintenance_log_item_tags` (`tag_id`);
--> statement-breakpoint
CREATE TABLE `maintenance_log_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`maintenance_log_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`reminder_type` text NOT NULL,
	`reminder_interval_count` integer,
	`reminder_interval_unit` text,
	`due_at` integer,
	`reminder_recipient_user_id` text,
	`last_completed_at` integer,
	`last_reminder_at` integer,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`maintenance_log_id`) REFERENCES `maintenance_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reminder_recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `maintenance_log_reminders_log_id_idx` ON `maintenance_log_reminders` (`maintenance_log_id`);
--> statement-breakpoint
CREATE TABLE `maintenance_log_projects` (
	`maintenance_log_id` text NOT NULL,
	`project_id` text NOT NULL,
	PRIMARY KEY(`maintenance_log_id`, `project_id`),
	FOREIGN KEY (`maintenance_log_id`) REFERENCES `maintenance_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maintenance_log_projects_log_id_idx` ON `maintenance_log_projects` (`maintenance_log_id`);
--> statement-breakpoint
CREATE INDEX `maintenance_log_projects_project_id_idx` ON `maintenance_log_projects` (`project_id`);
--> statement-breakpoint
CREATE TABLE `maintenance_log_inventory_items` (
	`maintenance_log_id` text NOT NULL,
	`inventory_item_id` text NOT NULL,
	PRIMARY KEY(`maintenance_log_id`, `inventory_item_id`),
	FOREIGN KEY (`maintenance_log_id`) REFERENCES `maintenance_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maintenance_log_inventory_items_log_id_idx` ON `maintenance_log_inventory_items` (`maintenance_log_id`);
--> statement-breakpoint
CREATE INDEX `maintenance_log_inventory_items_item_id_idx` ON `maintenance_log_inventory_items` (`inventory_item_id`);
