/**
 * Dry-run simulator for .github/workflows/release-gate.yml
 *
 * Replays the workflow's GitHub Actions conditional logic locally without
 * running the real test suite or touching any credentials. Use this to
 * confirm that:
 *   - A push to main (or workflow_dispatch) with no CLERK_SECRET_KEY fails
 *     closed and blocks a production release.
 *   - A pull-request run with no CLERK_SECRET_KEY is allowed to complete
 *     safely (fork / untrusted PR path).
 *   - When CLERK_SECRET_KEY is present the gate would proceed to the real
 *     account-isolation test (not executed here — use `pnpm run test:real-auth`).
 *
 * Usage:
 *   # Simulate a push-to-main with no secret — must exit 1
 *   GITHUB_EVENT_NAME=push pnpm --filter @workspace/api-server run test:dry-run-gate
 *
 *   # Simulate a fork PR with no secret — must exit 0
 *   GITHUB_EVENT_NAME=pull_request pnpm --filter @workspace/api-server run test:dry-run-gate
 *
 *   # Simulate a release run with the secret present — must exit 0
 *   CLERK_SECRET_KEY=sk_test_placeholder GITHUB_EVENT_NAME=push \
 *     pnpm --filter @workspace/api-server run test:dry-run-gate
 *
 * The script never reads, prints, or stores the value of CLERK_SECRET_KEY;
 * it only checks whether the variable is non-empty, exactly as GitHub Actions
 * secrets context does.
 */

const hasClerkSecret = Boolean(process.env["CLERK_SECRET_KEY"]);
const eventName = (process.env["GITHUB_EVENT_NAME"] ?? "push").trim();
const isProductionRun = eventName !== "pull_request"; // push or workflow_dispatch

console.log("=== Release gate dry run ===");
console.log(`event: ${eventName}`);
console.log(`CLERK_SECRET_KEY present: ${hasClerkSecret}`);
console.log();

// ── Step: Run real Clerk account-isolation gate ──────────────────────────────
// Condition: secrets.CLERK_SECRET_KEY != ''
if (hasClerkSecret) {
  console.log("✓ WOULD RUN  'Run real Clerk account-isolation gate'");
  console.log("  (dry run — use `pnpm run test:real-auth` to execute the live gate)");
} else {
  console.log("- SKIPPED    'Run real Clerk account-isolation gate'  (no secret)");
}

console.log();

// ── Step: Block production release without Clerk credentials ─────────────────
// Condition: github.event_name != 'pull_request' && secrets.CLERK_SECRET_KEY == ''
if (isProductionRun && !hasClerkSecret) {
  console.error("✗ FAIL       'Block production release without Clerk credentials'");
  console.error(
    "  ::error::CLERK_SECRET_KEY is required for production release security validation.",
  );
  process.exit(1);
}

// ── Step: Allow untrusted pull request without Clerk credentials ─────────────
// Condition: github.event_name == 'pull_request' && secrets.CLERK_SECRET_KEY == ''
if (!isProductionRun && !hasClerkSecret) {
  console.log("✓ PASS       'Allow untrusted pull request without Clerk credentials'");
  console.log(
    "  Skipping real Clerk account-isolation test because pull-request secrets are unavailable.",
  );
  process.exit(0);
}

// ── All steps passed (secret present) ────────────────────────────────────────
console.log("✓ PASS       All release gate conditions satisfied.");
console.log(
  "  Run `pnpm run test:real-auth` to execute the live Clerk account-isolation gate.",
);
process.exit(0);
