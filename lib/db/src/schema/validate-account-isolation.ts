import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig, pgTable, text } from "drizzle-orm/pg-core";

import {
  assertAccountOwnedTablesArePrivate,
  schemaTables,
} from "./index";

const MIGRATION_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../migrations/0001_account_isolation.sql",
);
const ACCOUNT_SETTING = "current_setting('app.current_account_id', true)";

function normalizeSql(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function assertAccountOwnedMigrationIsAligned(migrationSql: string): void {
  const violations: string[] = [];
  const migration = normalizeSql(migrationSql);

  for (const table of schemaTables) {
    const config = getTableConfig(table);
    const isAccountOwned = config.columns.some(
      (column) => column.name === "owner_id",
    );
    if (!isAccountOwned) continue;

    const tableName = config.name;
    const qualifiedTable = `(?:\\w+\\.)?${escapeRegExp(tableName)}`;
    const enable = new RegExp(
      `alter table ${qualifiedTable} enable row level security;`,
    );
    const force = new RegExp(
      `alter table ${qualifiedTable} force row level security;`,
    );
    if (!enable.test(migration)) {
      violations.push(
        `${tableName}: migration does not enable row-level security`,
      );
    }
    if (!force.test(migration)) {
      violations.push(
        `${tableName}: migration does not force row-level security`,
      );
    }

    const policyName = `${tableName}_account_isolation`;
    const policy = new RegExp(
      `create policy ${escapeRegExp(policyName)} on ${qualifiedTable}\\s+using\\s*\\(([^;]+?)\\)\\s+with check\\s*\\(([^;]+?)\\);`,
    ).exec(migration);
    const expectedExpression = normalizeSql(
      `owner_id = ${ACCOUNT_SETTING}`,
    );
    if (
      !policy ||
      normalizeSql(policy[1]) !== expectedExpression ||
      normalizeSql(policy[2]) !== expectedExpression
    ) {
      violations.push(
        `${tableName}: migration account isolation policy is missing or mismatched`,
      );
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Account-owned migration privacy check failed:\n${violations
        .map((violation) => `- ${violation}`)
        .join("\n")}`,
    );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const unprotectedTable = pgTable("unprotected_account_table", {
  ownerId: text("owner_id"),
});

assert.throws(
  () => assertAccountOwnedTablesArePrivate([unprotectedTable]),
  /unprotected_account_table: row-level security is not enabled/,
);
assertAccountOwnedTablesArePrivate();
assertAccountOwnedMigrationIsAligned(readFileSync(MIGRATION_PATH, "utf8"));
console.log("Account-owned table privacy check passed.");