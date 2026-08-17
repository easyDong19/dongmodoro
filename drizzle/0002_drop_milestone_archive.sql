-- Hand-edited after `drizzle-kit generate` (ADR-032 §3). One deliberate departure
-- from the generated draft:
--   The `PRAGMA foreign_keys` lines are gone. The migrator wraps this file in a
--   transaction and that pragma is a no-op inside one, so it never did anything.
--   `migrateDb()` toggles the pragma outside the transaction instead (ADR-032 §1).
-- No table-order change was needed here (unlike 0001) — `milestones` is the parent
-- being rebuilt, and no other table is dropped in this migration, so there is no
-- child-table DROP racing a still-live FK.
CREATE TABLE `__new_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`title` text NOT NULL,
	`completed_at` text,
	`sort_order` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "milestones_month_format" CHECK("__new_milestones"."month" IS strftime('%Y-%m', "__new_milestones"."month" || '-01')),
	CONSTRAINT "milestones_sort_order_int" CHECK(typeof("__new_milestones"."sort_order") = 'integer'),
	CONSTRAINT "milestones_completed_at_format" CHECK("__new_milestones"."completed_at" IS NULL OR ("__new_milestones"."completed_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_milestones"."completed_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_milestones"."completed_at"))),
	CONSTRAINT "milestones_created_at_format" CHECK("__new_milestones"."created_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_milestones"."created_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_milestones"."created_at")),
	CONSTRAINT "milestones_updated_at_format" CHECK("__new_milestones"."updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND "__new_milestones"."updated_at" IS strftime('%Y-%m-%dT%H:%M:%fZ', "__new_milestones"."updated_at"))
);
--> statement-breakpoint
INSERT INTO `__new_milestones`("id", "month", "title", "completed_at", "sort_order", "created_at", "updated_at") SELECT "id", "month", "title", "completed_at", "sort_order", "created_at", "updated_at" FROM `milestones`;--> statement-breakpoint
DROP TABLE `milestones`;--> statement-breakpoint
ALTER TABLE `__new_milestones` RENAME TO `milestones`;