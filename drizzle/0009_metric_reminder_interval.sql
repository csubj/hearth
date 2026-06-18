ALTER TABLE `metrics` ADD `reminder_interval_count` integer;
--> statement-breakpoint
ALTER TABLE `metrics` ADD `reminder_interval_unit` text;
--> statement-breakpoint
ALTER TABLE `metrics` ADD `last_reminder_at` integer;
--> statement-breakpoint
UPDATE `metrics` SET `reminder_interval_count` = 7, `reminder_interval_unit` = 'day' WHERE `reminder_interval_count` IS NULL;
