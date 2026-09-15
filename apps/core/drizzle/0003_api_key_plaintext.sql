/* 旧行存的是 SHA-256，明文无处可取，只能清空让用户重新生成一把 */
DROP TABLE `api_keys`;--> statement-breakpoint
CREATE TABLE `api_keys` (
	`user_id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_unique` ON `api_keys` (`key`);
