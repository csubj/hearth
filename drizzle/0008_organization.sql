CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entity_tags` (
	`entity_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY (`entity_id`,`tag_id`),
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `entity_links` (
	`id` text PRIMARY KEY NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`relation` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`from_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `entity_urls` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_nocase_unique` ON `tags` (`name` COLLATE NOCASE);--> statement-breakpoint
CREATE UNIQUE INDEX `entity_links_pair_unique` ON `entity_links` (`from_id`,`to_id`,`relation`);--> statement-breakpoint
CREATE INDEX `entity_tags_tag_id_idx` ON `entity_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `entity_links_to_idx` ON `entity_links` (`to_id`);--> statement-breakpoint
CREATE INDEX `entity_links_from_idx` ON `entity_links` (`from_id`);--> statement-breakpoint
CREATE INDEX `entity_urls_entity_id_idx` ON `entity_urls` (`entity_id`);
