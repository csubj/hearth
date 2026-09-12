ALTER TABLE `inventory_items` ADD COLUMN `space_id` text REFERENCES `home_spaces`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `inventory_items` ADD COLUMN `color_name` text;
--> statement-breakpoint
ALTER TABLE `inventory_items` ADD COLUMN `color_hex` text;
--> statement-breakpoint
ALTER TABLE `inventory_items` ADD COLUMN `finish` text;
--> statement-breakpoint
ALTER TABLE `inventory_items` ADD COLUMN `product_url` text;
--> statement-breakpoint
ALTER TABLE `inventory_items` RENAME COLUMN `item_type` TO `kind`;
--> statement-breakpoint
DROP INDEX IF EXISTS `inventory_items_item_type_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `inventory_items_location_idx`;
--> statement-breakpoint
ALTER TABLE `inventory_items` DROP COLUMN `location`;
--> statement-breakpoint
CREATE INDEX `inventory_items_kind_idx` ON `inventory_items` (`kind`);
--> statement-breakpoint
CREATE INDEX `inventory_items_space_id_idx` ON `inventory_items` (`space_id`);
