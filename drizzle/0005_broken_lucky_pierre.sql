CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_prefix_unique` ON `api_tokens` (`prefix`);--> statement-breakpoint
CREATE INDEX `api_tokens_user_id_idx` ON `api_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `api_tokens_prefix_idx` ON `api_tokens` (`prefix`);--> statement-breakpoint
CREATE TABLE `inventory_item_tags` (
	`inventory_item_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`inventory_item_id`, `tag_id`),
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `inventory_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inventory_item_tags_item_id_idx` ON `inventory_item_tags` (`inventory_item_id`);--> statement-breakpoint
CREATE INDEX `inventory_item_tags_tag_id_idx` ON `inventory_item_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`model` text,
	`serial` text,
	`item_type` text,
	`location` text,
	`purchase_date` integer,
	`store` text,
	`price` text,
	`warranty_note` text,
	`notes` text,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_items_name_idx` ON `inventory_items` (`name`);--> statement-breakpoint
CREATE INDEX `inventory_items_item_type_idx` ON `inventory_items` (`item_type`);--> statement-breakpoint
CREATE INDEX `inventory_items_location_idx` ON `inventory_items` (`location`);--> statement-breakpoint
CREATE INDEX `inventory_items_updated_at_idx` ON `inventory_items` (`updated_at`);--> statement-breakpoint
CREATE TABLE `inventory_links` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_item_id` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `inventory_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_tags_name_idx` ON `inventory_tags` (`name`);