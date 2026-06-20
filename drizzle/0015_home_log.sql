CREATE TABLE `home_spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text REFERENCES home_spaces(`id`) ON DELETE CASCADE,
	`kind` text DEFAULT 'room' NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by_user_id` text NOT NULL REFERENCES `users`(`id`),
	`updated_by_user_id` text NOT NULL REFERENCES `users`(`id`),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `home_spaces_parent_id_idx` ON `home_spaces` (`parent_id`);
--> statement-breakpoint
CREATE INDEX `home_spaces_kind_idx` ON `home_spaces` (`kind`);
--> statement-breakpoint
CREATE INDEX `home_spaces_updated_at_idx` ON `home_spaces` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `home_items` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL REFERENCES `home_spaces`(`id`) ON DELETE CASCADE,
	`kind` text DEFAULT 'generic' NOT NULL,
	`name` text NOT NULL,
	`manufacturer` text,
	`model_number` text,
	`serial_number` text,
	`color_name` text,
	`color_hex` text,
	`finish` text,
	`product_url` text,
	`purchased_at` integer,
	`notes` text,
	`created_by_user_id` text NOT NULL REFERENCES `users`(`id`),
	`updated_by_user_id` text NOT NULL REFERENCES `users`(`id`),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `home_items_space_id_idx` ON `home_items` (`space_id`);
--> statement-breakpoint
CREATE INDEX `home_items_kind_idx` ON `home_items` (`kind`);
--> statement-breakpoint
CREATE INDEX `home_items_updated_at_idx` ON `home_items` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `home_links` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_by_user_id` text NOT NULL REFERENCES `users`(`id`),
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `home_links_unique_idx` ON `home_links` (`source_type`,`source_id`,`target_type`,`target_id`);
--> statement-breakpoint
CREATE INDEX `home_links_source_idx` ON `home_links` (`source_type`,`source_id`);
--> statement-breakpoint
CREATE INDEX `home_links_target_idx` ON `home_links` (`target_type`,`target_id`);
