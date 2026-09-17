import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";

export const semesterPlans = sqliteTable("semester_plans", {
  profileId: text("profile_id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(0),
  seedPayload: text("seed_payload"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Cloud plans are owned by the Sites-authenticated principal. A profile label
// selects a student's plan inside that account; it is never authorization.
export const cloudStudentPlans = sqliteTable("cloud_student_plans", {
  ownerId: text("owner_id").notNull(),
  profileId: text("profile_id").notNull(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull(),
  seedPayload: text("seed_payload").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.ownerId, table.profileId] })]);

export const cloudOAuthRecords = sqliteTable("cloud_oauth_records", {
  kind: text("kind").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at"),
}, (table) => [primaryKey({ columns: [table.kind, table.key] }), index("cloud_oauth_expiry").on(table.expiresAt)]);

export const cloudOAuthLimits = sqliteTable("cloud_oauth_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at"),
}, (table) => [index("cloud_oauth_limits_expiry").on(table.expiresAt)]);
