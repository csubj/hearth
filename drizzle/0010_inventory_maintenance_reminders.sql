ALTER TABLE `metrics` ADD `reminder_recipient_user_id` text REFERENCES users(id);
--> statement-breakpoint
CREATE TABLE `inventory_maintenance_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_item_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`reminder_interval_count` integer,
	`reminder_interval_unit` text,
	`reminder_recipient_user_id` text,
	`last_completed_at` integer,
	`last_reminder_at` integer,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reminder_recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_maintenance_reminders_item_id_idx` ON `inventory_maintenance_reminders` (`inventory_item_id`);
--> statement-breakpoint
CREATE TABLE `inventory_maintenance_reminder_links` (
	`id` text PRIMARY KEY NOT NULL,
	`reminder_id` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reminder_id`) REFERENCES `inventory_maintenance_reminders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inventory_maintenance_reminder_links_reminder_id_idx` ON `inventory_maintenance_reminder_links` (`reminder_id`);
