CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`storage_key` text NOT NULL,
	`has_thumb` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `attachments_entity_id_idx` ON `attachments` (`entity_id`);--> statement-breakpoint
CREATE INDEX `attachments_entity_deleted_idx` ON `attachments` (`entity_id`,`deleted_at`);