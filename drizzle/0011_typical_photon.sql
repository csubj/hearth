CREATE TABLE `pins` (
	`user_id` text NOT NULL,
	`entity_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `entity_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
