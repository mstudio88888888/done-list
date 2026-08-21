import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Account-owned notebook records for the non-task mobile domains. The shape
 * remains deliberately small and explicit so each domain can evolve without
 * exposing one account's rows to another.
 */
export const notebookItemsTable = pgTable("notebook_items", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  domain: text("domain").notNull(),
  section: text("section"),
  title: text("title"),
  body: text("body"),
  entryDate: text("entry_date"),
  color: text("color"),
  position: integer("position").notNull().default(0),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  pgPolicy("notebook_items_account_isolation", {
    for: "all",
    to: "public",
    using: sql`${table.ownerId} = current_setting('app.current_account_id', true)`,
    withCheck: sql`${table.ownerId} = current_setting('app.current_account_id', true)`,
  }),
]).enableRLS();

export type NotebookItem = typeof notebookItemsTable.$inferSelect;