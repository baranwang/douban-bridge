ALTER TABLE `douban_mapping` ADD `match_source` text;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `mapping_revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `agent_state` text;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `agent_token` text;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `agent_lease_until` integer;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `next_agent_at` integer;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `agent_attempts` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `agent_input_hash` text;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `agent_result` text;
