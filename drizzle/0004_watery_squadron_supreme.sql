CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`property_scope` text,
	`theme` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
