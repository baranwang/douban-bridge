PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_configs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`catalog_ids` text DEFAULT '[]',
	`dynamic_collections` integer DEFAULT false,
	`image_providers` text DEFAULT '[{"provider":"douban","extra":{"proxy":"none"}}]',
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_user_configs`("user_id", "catalog_ids", "dynamic_collections", "image_providers", "created_at", "updated_at") SELECT "user_id", "catalog_ids", "dynamic_collections", "image_providers", "created_at", "updated_at" FROM `user_configs`;--> statement-breakpoint
DROP TABLE `user_configs`;--> statement-breakpoint
ALTER TABLE `__new_user_configs` RENAME TO `user_configs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`github_id` integer NOT NULL,
	`github_login` text NOT NULL,
	`github_avatar_url` text,
	`github_access_token` text,
	`has_starred` integer DEFAULT false,
	`star_checked_at` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "github_id", "github_login", "github_avatar_url", "github_access_token", "has_starred", "star_checked_at", "created_at", "updated_at") SELECT "id", "github_id", "github_login", "github_avatar_url", "github_access_token", "has_starred", "star_checked_at", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_github_id_unique` ON `users` (`github_id`);