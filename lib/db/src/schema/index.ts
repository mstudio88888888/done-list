import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import { notebookItemsTable } from "./notebook-items";
import { tasksTable } from "./tasks";

export * from "./tasks";
export * from "./notebook-items";

/**
 * All tables exported by the schema. Account ownership is identified by the
 * presence of an `owner_id` column, so new account-owned tables are checked
 * automatically when they are added here.
 */
export const schemaTables = [tasksTable, notebookItemsTable] as const;

/**
 * Fails validation when an account-owned table is not protected by the
 * database boundary convention.
 */
export function assertAccountOwnedTablesArePrivate(
  tables: readonly PgTable[] = schemaTables,
): void {
  const violations: string[] = [];

  for (const table of tables) {
    const config = getTableConfig(table);
    const isAccountOwned = config.columns.some((column) => column.name === "owner_id");
    if (!isAccountOwned) continue;

    if (!config.enableRLS) {
      violations.push(`${config.name}: row-level security is not enabled`);
    }

    const accountPolicy = config.policies.find(
      (policy) => policy.name === `${config.name}_account_isolation`,
    );
    if (!accountPolicy || !accountPolicy.using || !accountPolicy.withCheck) {
      violations.push(`${config.name}: account isolation policy is missing`);
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Account-owned table privacy check failed:\n${violations
        .map((violation) => `- ${violation}`)
        .join("\n")}`,
    );
  }
}
