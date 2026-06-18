ALTER TABLE `project_components` ADD `kind` text DEFAULT 'item' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_components` ADD `acquired` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `project_components` ADD `acquired_at` integer;--> statement-breakpoint
ALTER TABLE `project_components` ADD `purchase_url` text;
