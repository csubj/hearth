CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`every_count` integer,
	`every_unit` text,
	`due_on` text NOT NULL,
	`closed_at` integer,
	`last_completed_at` integer,
	`last_completed_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_completed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `reminder_recipients` (
	`reminder_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY (`reminder_id`,`user_id`),
	FOREIGN KEY (`reminder_id`) REFERENCES `reminders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reminders_closed_due_idx` ON `reminders` (`closed_at`,`due_on`);--> statement-breakpoint
CREATE INDEX `reminder_recipients_user_id_idx` ON `reminder_recipients` (`user_id`);
