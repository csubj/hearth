ALTER TABLE `projects` RENAME COLUMN `description` TO `notes`;--> statement-breakpoint
ALTER TABLE `projects` ADD `priority` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `target_when` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `budget_cents` integer;--> statement-breakpoint
CREATE INDEX `projects_priority_idx` ON `projects` (`priority`);--> statement-breakpoint
CREATE TABLE `project_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_tags_name_idx` ON `project_tags` (`name`);--> statement-breakpoint
CREATE TABLE `project_item_tags` (
	`project_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`project_id`, `tag_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `project_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_item_tags_project_id_idx` ON `project_item_tags` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_item_tags_tag_id_idx` ON `project_item_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `project_components` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_cost_cents` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_components_project_id_idx` ON `project_components` (`project_id`);--> statement-breakpoint
DROP TABLE `stream_entries`;
