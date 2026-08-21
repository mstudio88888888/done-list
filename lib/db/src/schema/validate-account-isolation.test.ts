import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { assertAccountOwnedMigrationIsAligned } from "./validate-account-isolation";

const FIXTURES_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES_PATH, name), "utf8");
}

describe("account isolation migration parser", () => {
  it("keeps tasks and notebook_items covered by the valid migration", () => {
    assert.doesNotThrow(() =>
      assertAccountOwnedMigrationIsAligned(
        fixture("account-isolation-valid.sql"),
      ),
    );
  });

  it("rejects a migration missing ENABLE RLS", () => {
    assert.throws(
      () =>
        assertAccountOwnedMigrationIsAligned(
          fixture("account-isolation-missing-enable.sql"),
        ),
      /tasks: migration does not enable row-level security/,
    );
  });

  it("rejects a migration missing FORCE RLS", () => {
    assert.throws(
      () =>
        assertAccountOwnedMigrationIsAligned(
          fixture("account-isolation-missing-force.sql"),
        ),
      /notebook_items: migration does not force row-level security/,
    );
  });

  it("rejects mismatched USING and WITH CHECK expressions", () => {
    assert.throws(
      () =>
        assertAccountOwnedMigrationIsAligned(
          fixture("account-isolation-mismatched-policy.sql"),
        ),
      /tasks: migration account isolation policy is missing or mismatched/,
    );
  });
});