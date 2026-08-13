-- Hand-edited after `drizzle-kit generate` (ADR-032 §3). Three deliberate departures
-- from the generated draft:
--   1. The `PRAGMA foreign_keys` lines are gone. The migrator wraps this file in a
--      transaction and that pragma is a no-op inside one, so it never did anything.
--      `migrateDb()` toggles the pragma outside the transaction instead (ADR-032 §1).
--   2. `DROP TABLE weeks` moved to the very end. It was first in the draft, where the
--      still-live `sessions.local_week` foreign key made it fail on any database that
--      held a session.
--   3. `DELETE FROM settings` added by hand — drizzle-kit never emits data changes.
CREATE TABLE `__new_sessions` (
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
	CONSTRAINT "sessions_kind_enum" CHECK("__new_sessions"."kind" IN ('focus', 'short', 'long')),
	CONSTRAINT "sessions_started_at_format" CHECK("__new_sessions"."started_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_sessions"."started_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_sessions"."started_at")),
	CONSTRAINT "sessions_ended_at_format" CHECK("__new_sessions"."ended_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_sessions"."ended_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_sessions"."ended_at")),
	CONSTRAINT "sessions_updated_at_format" CHECK("__new_sessions"."updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_sessions"."updated_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_sessions"."updated_at")),
	CONSTRAINT "sessions_ended_after_started" CHECK("__new_sessions"."ended_at" >= "__new_sessions"."started_at"),
	CONSTRAINT "sessions_duration_range" CHECK(typeof("__new_sessions"."duration_sec") = 'integer' AND "__new_sessions"."duration_sec" >= 0),
	CONSTRAINT "sessions_local_date_format" CHECK("__new_sessions"."local_date" IS date("__new_sessions"."local_date")),
	CONSTRAINT "sessions_local_week_monday" CHECK("__new_sessions"."local_week" IS date("__new_sessions"."local_week") AND strftime('%w', "__new_sessions"."local_week") = '1'),
	CONSTRAINT "sessions_local_calendar_consistent" CHECK("__new_sessions"."local_week" IS date("__new_sessions"."local_date", '-6 days', 'weekday 1'))
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "started_at", "ended_at", "duration_sec", "kind", "task_id", "note", "local_date", "local_week", "updated_at") SELECT "id", "started_at", "ended_at", "duration_sec", "kind", "task_id", "note", "local_date", "local_week", "updated_at" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
CREATE INDEX `idx_sessions_local_date` ON `sessions` (`local_date`);--> statement-breakpoint
CREATE INDEX `idx_sessions_local_week` ON `sessions` (`local_week`);--> statement-breakpoint
CREATE INDEX `idx_sessions_task` ON `sessions` (`task_id`) WHERE "sessions"."task_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`week_item_id` text NOT NULL,
	`title` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`week_item_id`) REFERENCES `week_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tasks_completed_at_format" CHECK("__new_tasks"."completed_at" IS NULL OR ("__new_tasks"."completed_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_tasks"."completed_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_tasks"."completed_at"))),
	CONSTRAINT "tasks_created_at_format" CHECK("__new_tasks"."created_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_tasks"."created_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_tasks"."created_at")),
	CONSTRAINT "tasks_updated_at_format" CHECK("__new_tasks"."updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_tasks"."updated_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_tasks"."updated_at")),
	CONSTRAINT "tasks_deleted_at_format" CHECK("__new_tasks"."deleted_at" IS NULL OR ("__new_tasks"."deleted_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_tasks"."deleted_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_tasks"."deleted_at")))
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "week_item_id", "title", "completed_at", "created_at", "updated_at", "deleted_at") SELECT "id", "week_item_id", "title", "completed_at", "created_at", "updated_at", "deleted_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
CREATE INDEX `idx_tasks_week_item` ON `tasks` (`week_item_id`);--> statement-breakpoint
CREATE TABLE `__new_week_items` (
	`id` text PRIMARY KEY NOT NULL,
	`week` text NOT NULL,
	`title` text NOT NULL,
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
	CONSTRAINT "week_items_week_monday" CHECK("__new_week_items"."week" IS date("__new_week_items"."week") AND strftime('%w', "__new_week_items"."week") = '1'),
	CONSTRAINT "week_items_origin_week_monday" CHECK("__new_week_items"."origin_week" IS date("__new_week_items"."origin_week") AND strftime('%w', "__new_week_items"."origin_week") = '1'),
	CONSTRAINT "week_items_is_system_bool" CHECK("__new_week_items"."is_system" IN (0, 1)),
	CONSTRAINT "week_items_days_json" CHECK(json_valid("__new_week_items"."days") AND json_type("__new_week_items"."days") = 'array'),
	CONSTRAINT "week_items_completed_at_format" CHECK("__new_week_items"."completed_at" IS NULL OR ("__new_week_items"."completed_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_week_items"."completed_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_week_items"."completed_at"))),
	CONSTRAINT "week_items_dropped_at_format" CHECK("__new_week_items"."dropped_at" IS NULL OR ("__new_week_items"."dropped_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_week_items"."dropped_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_week_items"."dropped_at"))),
	CONSTRAINT "week_items_created_at_format" CHECK("__new_week_items"."created_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_week_items"."created_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_week_items"."created_at")),
	CONSTRAINT "week_items_updated_at_format" CHECK("__new_week_items"."updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_week_items"."updated_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_week_items"."updated_at")),
	CONSTRAINT "week_items_deleted_at_format" CHECK("__new_week_items"."deleted_at" IS NULL OR ("__new_week_items"."deleted_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_week_items"."deleted_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_week_items"."deleted_at")))
);
--> statement-breakpoint
INSERT INTO `__new_week_items`("id", "week", "title", "milestone_id", "days", "carry_from_id", "origin_week", "is_system", "completed_at", "dropped_at", "created_at", "updated_at", "deleted_at") SELECT "id", "week", "title", "milestone_id", "days", "carry_from_id", "origin_week", "is_system", "completed_at", "dropped_at", "created_at", "updated_at", "deleted_at" FROM `week_items`;--> statement-breakpoint
DROP TABLE `week_items`;--> statement-breakpoint
ALTER TABLE `__new_week_items` RENAME TO `week_items`;--> statement-breakpoint
CREATE INDEX `idx_week_items_week_created` ON `week_items` (`week`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_week_items_one_system` ON `week_items` (`week`) WHERE "week_items"."is_system" = 1 AND "week_items"."deleted_at" IS NULL;--> statement-breakpoint
-- Last, once no table references it any more.
DROP TABLE `weeks`;--> statement-breakpoint
-- The weekly capacity is a retired currency (ADR-030). Its absence is the only way to
-- say "not set" here, so the row is removed rather than zeroed.
DELETE FROM `settings` WHERE `key` = 'weekly_capacity';