CREATE TABLE `notes` (
	`entity_id` text PRIMARY KEY NOT NULL,
	`doc` text NOT NULL,
	`markdown` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`author_id` text NOT NULL,
	`doc` text NOT NULL,
	`markdown` text NOT NULL,
	`edited_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `mentions` (
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY (`source_type`,`source_id`,`user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `entity_assignees` (
	`entity_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY (`entity_id`,`user_id`),
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_entity_id_created_at_idx` ON `comments` (`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `entity_assignees_user_id_idx` ON `entity_assignees` (`user_id`);
