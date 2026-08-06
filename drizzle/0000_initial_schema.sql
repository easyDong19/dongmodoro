CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`title` text NOT NULL,
	`completed_at` text,
	`sort_order` integer NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "milestones_month_format" CHECK("milestones"."month" IS strftime('%Y-%m', "milestones"."month" || '-01')),
	CONSTRAINT "milestones_sort_order_int" CHECK(typeof("milestones"."sort_order") = 'integer'),
	CONSTRAINT "milestones_completed_at_format" CHECK("milestones"."completed_at" IS NULL OR ("milestones"."completed_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "milestones"."completed_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "milestones"."completed_at"))),
	CONSTRAINT "milestones_archived_at_format" CHECK("milestones"."archived_at" IS NULL OR ("milestones"."archived_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "milestones"."archived_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "milestones"."archived_at"))),
	CONSTRAINT "milestones_created_at_format" CHECK("milestones"."created_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "milestones"."created_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "milestones"."created_at")),
	CONSTRAINT "milestones_updated_at_format" CHECK("milestones"."updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "milestones"."updated_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "milestones"."updated_at"))
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`duration_sec` integer NOT NULL,
	`kind` text NOT NULL,
	`task_id` text,
	`note` text,
	`local_date` text NOT NULL,
	`local_week` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`local_week`) REFERENCES `weeks`(`week`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sessions_kind_enum" CHECK("sessions"."kind" IN ('focus', 'short', 'long')),
	CONSTRAINT "sessions_started_at_format" CHECK("sessions"."started_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "sessions"."started_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "sessions"."started_at")),
	CONSTRAINT "sessions_ended_at_format" CHECK("sessions"."ended_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "sessions"."ended_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "sessions"."ended_at")),
	CONSTRAINT "sessions_updated_at_format" CHECK("sessions"."updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "sessions"."updated_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "sessions"."updated_at")),
	CONSTRAINT "sessions_ended_after_started" CHECK("sessions"."ended_at" >= "sessions"."started_at"),
	CONSTRAINT "sessions_duration_range" CHECK(typeof("sessions"."duration_sec") = 'integer' AND "sessions"."duration_sec" >= 0),
	CONSTRAINT "sessions_local_date_format" CHECK("sessions"."local_date" IS date("sessions"."local_date")),
	CONSTRAINT "sessions_local_week_monday" CHECK("sessions"."local_week" IS date("sessions"."local_week") AND strftime('%w', "sessions"."local_week") = '1'),
	CONSTRAINT "sessions_local_calendar_consistent" CHECK("sessions"."local_week" IS date("sessions"."local_date", '-6 days', 'weekday 1'))
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_local_date` ON `sessions` (`local_date`);--> statement-breakpoint
CREATE INDEX `idx_sessions_local_week` ON `sessions` (`local_week`);--> statement-breakpoint
CREATE INDEX `idx_sessions_task` ON `sessions` (`task_id`) WHERE "sessions"."task_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "settings_value_json" CHECK(json_valid("settings"."value")),
	CONSTRAINT "settings_updated_at_format" CHECK("settings"."updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "settings"."updated_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "settings"."updated_at"))
);
--> statement-breakpoint
CREATE TABLE `task_pulls` (
	`task_id` text NOT NULL,
	`pull_date` text NOT NULL,
	`removed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`task_id`, `pull_date`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "task_pulls_pull_date_format" CHECK("task_pulls"."pull_date" IS date("task_pulls"."pull_date")),
	CONSTRAINT "task_pulls_removed_at_format" CHECK("task_pulls"."removed_at" IS NULL OR ("task_pulls"."removed_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "task_pulls"."removed_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "task_pulls"."removed_at"))),
	CONSTRAINT "task_pulls_created_at_format" CHECK("task_pulls"."created_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "task_pulls"."created_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "task_pulls"."created_at")),
	CONSTRAINT "task_pulls_updated_at_format" CHECK("task_pulls"."updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "task_pulls"."updated_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "task_pulls"."updated_at"))
);
--> statement-breakpoint
CREATE INDEX `idx_task_pulls_date` ON `task_pulls` (`pull_date`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`week_item_id` text NOT NULL,
	`title` text NOT NULL,
	`est_pomos` integer,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`week_item_id`) REFERENCES `week_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tasks_est_pomos_range" CHECK("tasks"."est_pomos" IS NULL OR (typeof("tasks"."est_pomos") = 'integer' AND "tasks"."est_pomos" >= 1)),
	CONSTRAINT "tasks_completed_at_format" CHECK("tasks"."completed_at" IS NULL OR ("tasks"."completed_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "tasks"."completed_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "tasks"."completed_at"))),
	CONSTRAINT "tasks_created_at_format" CHECK("tasks"."created_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "tasks"."created_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "tasks"."created_at")),
	CONSTRAINT "tasks_updated_at_format" CHECK("tasks"."updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "tasks"."updated_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "tasks"."updated_at")),
	CONSTRAINT "tasks_deleted_at_format" CHECK("tasks"."deleted_at" IS NULL OR ("tasks"."deleted_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "tasks"."deleted_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "tasks"."deleted_at")))
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_week_item` ON `tasks` (`week_item_id`);--> statement-breakpoint
CREATE TABLE `week_items` (
	`id` text PRIMARY KEY NOT NULL,
	`week` text NOT NULL,
	`title` text NOT NULL,
	`est_pomos` integer NOT NULL,
	`milestone_id` text,
	`days` text NOT NULL,
	`carry_from_id` text,
	`origin_week` text NOT NULL,
	`is_system` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`dropped_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`carry_from_id`) REFERENCES `week_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "week_items_week_monday" CHECK("week_items"."week" IS date("week_items"."week") AND strftime('%w', "week_items"."week") = '1'),
	CONSTRAINT "week_items_origin_week_monday" CHECK("week_items"."origin_week" IS date("week_items"."origin_week") AND strftime('%w', "week_items"."origin_week") = '1'),
	CONSTRAINT "week_items_is_system_bool" CHECK("week_items"."is_system" IN (0, 1)),
	CONSTRAINT "week_items_est_by_kind" CHECK(typeof("week_items"."est_pomos") = 'integer' AND (("week_items"."is_system" = 0 AND "week_items"."est_pomos" >= 1) OR ("week_items"."is_system" = 1 AND "week_items"."est_pomos" = 0))),
	CONSTRAINT "week_items_days_json" CHECK(json_valid("week_items"."days") AND json_type("week_items"."days") = 'array'),
	CONSTRAINT "week_items_completed_at_format" CHECK("week_items"."completed_at" IS NULL OR ("week_items"."completed_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "week_items"."completed_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "week_items"."completed_at"))),
	CONSTRAINT "week_items_dropped_at_format" CHECK("week_items"."dropped_at" IS NULL OR ("week_items"."dropped_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "week_items"."dropped_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "week_items"."dropped_at"))),
	CONSTRAINT "week_items_created_at_format" CHECK("week_items"."created_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "week_items"."created_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "week_items"."created_at")),
	CONSTRAINT "week_items_updated_at_format" CHECK("week_items"."updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "week_items"."updated_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "week_items"."updated_at")),
	CONSTRAINT "week_items_deleted_at_format" CHECK("week_items"."deleted_at" IS NULL OR ("week_items"."deleted_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "week_items"."deleted_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "week_items"."deleted_at")))
);
--> statement-breakpoint
CREATE INDEX `idx_week_items_week_created` ON `week_items` (`week`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_week_items_one_system` ON `week_items` (`week`) WHERE "week_items"."is_system" = 1 AND "week_items"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `weeks` (
	`week` text PRIMARY KEY NOT NULL,
	`budget` integer,
	`capacity` text,
	`focus_min` integer NOT NULL,
	`short_break_min` integer NOT NULL,
	`long_break_min` integer NOT NULL,
	`planned_at` text,
	`settled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "weeks_week_monday" CHECK("weeks"."week" IS date("weeks"."week") AND strftime('%w', "weeks"."week") = '1'),
	CONSTRAINT "weeks_budget_range" CHECK("weeks"."budget" IS NULL OR (typeof("weeks"."budget") = 'integer' AND "weeks"."budget" >= 0)),
	CONSTRAINT "weeks_capacity_shape" CHECK("weeks"."capacity" IS NULL OR (json_valid("weeks"."capacity") AND json_array_length("weeks"."capacity") = 7 AND typeof(json_extract("weeks"."capacity", '$[0]')) = 'integer' AND json_extract("weeks"."capacity", '$[0]') >= 0 AND typeof(json_extract("weeks"."capacity", '$[1]')) = 'integer' AND json_extract("weeks"."capacity", '$[1]') >= 0 AND typeof(json_extract("weeks"."capacity", '$[2]')) = 'integer' AND json_extract("weeks"."capacity", '$[2]') >= 0 AND typeof(json_extract("weeks"."capacity", '$[3]')) = 'integer' AND json_extract("weeks"."capacity", '$[3]') >= 0 AND typeof(json_extract("weeks"."capacity", '$[4]')) = 'integer' AND json_extract("weeks"."capacity", '$[4]') >= 0 AND typeof(json_extract("weeks"."capacity", '$[5]')) = 'integer' AND json_extract("weeks"."capacity", '$[5]') >= 0 AND typeof(json_extract("weeks"."capacity", '$[6]')) = 'integer' AND json_extract("weeks"."capacity", '$[6]') >= 0)),
	CONSTRAINT "weeks_baseline_range" CHECK(typeof("weeks"."focus_min") = 'integer' AND "weeks"."focus_min" >= 1 AND typeof("weeks"."short_break_min") = 'integer' AND "weeks"."short_break_min" >= 1 AND typeof("weeks"."long_break_min") = 'integer' AND "weeks"."long_break_min" >= 1),
	CONSTRAINT "weeks_planned_at_format" CHECK("weeks"."planned_at" IS NULL OR ("weeks"."planned_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "weeks"."planned_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "weeks"."planned_at"))),
	CONSTRAINT "weeks_settled_at_format" CHECK("weeks"."settled_at" IS NULL OR ("weeks"."settled_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "weeks"."settled_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "weeks"."settled_at"))),
	CONSTRAINT "weeks_created_at_format" CHECK("weeks"."created_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "weeks"."created_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "weeks"."created_at")),
	CONSTRAINT "weeks_updated_at_format" CHECK("weeks"."updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "weeks"."updated_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "weeks"."updated_at"))
);
