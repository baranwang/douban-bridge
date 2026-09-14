-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE `douban_mapping` (
	`douban_id` integer PRIMARY KEY NOT NULL,
	`tmdb_id` integer,
	`imdb_id` text,
	`trakt_id` integer,
	`calibrated` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`github_id` integer NOT NULL,
	`github_login` text NOT NULL,
	`github_avatar_url` text,
	`github_access_token` text,
	`has_starred` integer DEFAULT 0,
	`star_checked_at` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `user_configs` (
	`user_id` text PRIMARY KEY,
	`catalog_ids` text DEFAULT '[]',
	`image_proxy` text DEFAULT 'none',
	`dynamic_collections` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	`fanart_enabled` integer DEFAULT 0,
	`fanart_api_key` text,
	`image_providers` text DEFAULT '[{"provider":"douban","extra":{"proxy":"none"}}]',
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

*/