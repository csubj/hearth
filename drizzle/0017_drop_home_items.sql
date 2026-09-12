-- Backfill assigned space on inventory items from legacy home_log links.
UPDATE `inventory_items` SET `space_id` = '6cad5ca0-5555-4510-84e3-748ee23fc4e8'
  WHERE `id` = '70d96b5b-bf5c-4e97-9cb6-5b8d0aa850b8';
--> statement-breakpoint
DELETE FROM `home_links` WHERE `target_type` = 'inventory_item';
--> statement-breakpoint
-- Normalize a legacy item_type value that did not map to a single kind.
UPDATE `inventory_items` SET `kind` = 'appliance'
  WHERE `kind` = 'appliance,frids';
--> statement-breakpoint
DROP TABLE IF EXISTS `home_items`;
