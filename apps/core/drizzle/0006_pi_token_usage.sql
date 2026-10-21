CREATE TABLE `pi_token_usage` (
	`day` text NOT NULL,
	`model` text NOT NULL,
	`input` integer NOT NULL,
	`output` integer NOT NULL,
	`cache_read` integer NOT NULL,
	`cache_write` integer NOT NULL,
	`messages` integer NOT NULL,
	`cost_micro` integer NOT NULL,
	PRIMARY KEY(`day`, `model`)
);
