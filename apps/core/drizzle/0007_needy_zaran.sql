CREATE TABLE `mapping_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`douban_id` integer NOT NULL,
	`candidate_id` text NOT NULL,
	`reason` text NOT NULL,
	`snapshot` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mapping_feedback_pending_douban` ON `mapping_feedback` (`douban_id`) WHERE "mapping_feedback"."status" = 'pending';--> statement-breakpoint
CREATE INDEX `mapping_feedback_user_created` ON `mapping_feedback` (`user_id`,`created_at`);