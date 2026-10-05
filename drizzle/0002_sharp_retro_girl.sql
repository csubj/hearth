CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`api_key_id` text,
	`via_label` text,
	`action` text NOT NULL,
	`diff` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`undoes_id` text,
	`undone_by_id` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_created_at_idx` ON `activity` (`created_at`);--> statement-breakpoint
CREATE INDEX `activity_entity_id_created_at_idx` ON `activity` (`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `attention` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`entity_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`occurrence_key` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`read_at` integer,
	`dismissed_at` integer,
	`resolved_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attention_user_occurrence_key_unique` ON `attention` (`user_id`,`occurrence_key`);--> statement-breakpoint
CREATE INDEX `attention_user_res_dis_read_created_idx` ON `attention` (`user_id`,`resolved_at`,`dismissed_at`,`read_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`place_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_via` text,
	`updated_by` text NOT NULL,
	`updated_via` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	`trash_batch_id` text,
	FOREIGN KEY (`place_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `entities_type_del_arch_upd_id_idx` ON `entities` (`type`,`deleted_at`,`archived_at`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `entities_place_id_idx` ON `entities` (`place_id`);--> statement-breakpoint
CREATE INDEX `entities_deleted_at_idx` ON `entities` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `entities_trash_batch_id_idx` ON `entities` (`trash_batch_id`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`api_key_id` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`api_key_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `job_runs` (
	`name` text PRIMARY KEY NOT NULL,
	`last_started_at` integer,
	`last_succeeded_at` integer,
	`last_error` text
);
