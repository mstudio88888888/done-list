---
name: Clerk endpoint testing
description: Durable guidance for authenticated API endpoint tests in this workspace.
---

## Mock isolation tests (unit / CI)

API endpoint tests should inject identities through the app factory's user resolver while the default app continues to use Clerk middleware.

**Why:** Clerk's Express request decoration is a callable internal object, so hand-written `{ userId }` test doubles fail inside `getAuth`; an explicit resolver keeps tests realistic at the route boundary without weakening production authentication.

**How to apply:** Keep the resolver optional and unset in the exported production app. Test apps may resolve a fixed test header to a user ID, then exercise the real routes and database.

## Real Clerk release gate (pnpm test:real-auth)

`test/real-clerk-account-isolation.test.ts` requires two distinct Clerk session JWTs set as `CLERK_TEST_SESSION_TOKEN_A/B` with `RUN_REAL_CLERK_TESTS=1`. These cannot be obtained from the browser manually (they expire in 60s and a dev-browser handshake is needed).

**Working approach (no browser required):**
1. Use `@clerk/backend` `createClerkClient` with `CLERK_SECRET_KEY`.
2. Create two disposable Clerk users via `clerk.users.createUser(...)`.
3. Create backend sessions: `await clerk.sessions.createSession({ userId })` — this is a Backend Admin API call that succeeds even with no active browser session.
4. Get 10-minute JWTs: `await clerk.sessions.getToken(sessId, undefined, 600)` — returns `{ jwt: "eyJ..." }`.
5. Write both JWTs to a temp env file; source it; run the test.
6. Delete the test users afterwards.

**Key pitfall:** `POST /v1/dev_browser` on the Clerk FAPI (Frontend API) works for a dev-browser token, but `GET`/`PATCH`/`PUT` return 405; and using the token as a `__clerk_db_jwt` cookie still returns 401 "browser unauthenticated" when sent from a backend HTTP client. Use the Backend Admin API path above instead.

**Why the stored secrets didn't work:** `CLERK_TEST_SESSION_TOKEN_A/B` must be 3-part JWTs; any other string (API key, publishable key, etc.) is rejected silently by `clerkMiddleware()` with `getAuth().userId === null`.