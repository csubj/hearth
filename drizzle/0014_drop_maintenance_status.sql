DROP INDEX IF EXISTS `maintenance_logs_status_updated_at_idx`;
--> statement-breakpoint
ALTER TABLE `maintenance_logs` DROP COLUMN `status`;
--> statement-breakpoint
CREATE INDEX `maintenance_logs_updated_at_idx` ON `maintenance_logs` (`updated_at`);
