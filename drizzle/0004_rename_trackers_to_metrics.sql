ALTER TABLE `trackers` RENAME TO `metrics`;--> statement-breakpoint
ALTER TABLE `tracker_entries` RENAME TO `metric_entries`;--> statement-breakpoint
ALTER TABLE `metric_entries` RENAME COLUMN `tracker_id` TO `metric_id`;--> statement-breakpoint
DROP INDEX `tracker_entries_tracker_id_recorded_at_idx`;--> statement-breakpoint
CREATE INDEX `metric_entries_metric_id_recorded_at_idx` ON `metric_entries` (`metric_id`,`recorded_at`);
