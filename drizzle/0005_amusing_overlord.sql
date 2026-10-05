CREATE TABLE `notes_page_details` (
	`entity_id` text PRIMARY KEY NOT NULL,
	`category` text,
	`review_on` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
