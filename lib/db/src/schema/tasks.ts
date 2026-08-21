import { pgPolicy, pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  color: text("color"),
  type: text("type").notNull().default("done"),
  ownerId: text("owner_id"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  pgPolicy("tasks_account_isolation", {
    for: "all",
    to: "public",
    using: sql`${table.ownerId} = current_setting('app.current_account_id', true)`,
    withCheck: sql`${table.ownerId} = current_setting('app.current_account_id', true)`,
  }),
]).enableRLS();

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
