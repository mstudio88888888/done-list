import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createClerkClient } from "@clerk/backend";

const secretKey = process.env["CLERK_SECRET_KEY"];
if (!secretKey) {
  throw new Error("CLERK_SECRET_KEY is required to run the real Clerk release gate");
}

const clerk = createClerkClient({ secretKey });
const userIds: string[] = [];

type CreatedUser = { id: string };

async function createDisposableUser(label: string): Promise<CreatedUser> {
  const emailAddress = `real-auth-${label}-${randomUUID()}@example.com`;
  return clerk.users.createUser({
    emailAddress: [emailAddress],
    password: randomUUID() + randomUUID(),
  });
}

async function getSessionToken(userId: string): Promise<string> {
  const session = await clerk.sessions.createSession({ userId });
  const token = await clerk.sessions.getToken(session.id, undefined, 600);
  if (!token.jwt) {
    throw new Error("Clerk returned an empty session token");
  }
  return token.jwt;
}

function runReleaseGate(tokenA: string, tokenB: string): Promise<number> {
  const child = spawn(
    "pnpm",
    ["exec", "tsx", "--test", "test/real-clerk-account-isolation.test.ts"],
    {
      env: {
        ...process.env,
        RUN_REAL_CLERK_TESTS: "1",
        CLERK_TEST_SESSION_TOKEN_A: tokenA,
        CLERK_TEST_SESSION_TOKEN_B: tokenB,
      },
      stdio: "inherit",
    },
  );

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        resolve(1);
      } else {
        resolve(code ?? 1);
      }
    });
  });
}

let releaseGateExitCode = 1;
let failure: unknown;

try {
  const userA = await createDisposableUser("a");
  userIds.push(userA.id);
  const userB = await createDisposableUser("b");
  userIds.push(userB.id);

  const [tokenA, tokenB] = await Promise.all([
    getSessionToken(userA.id),
    getSessionToken(userB.id),
  ]);
  releaseGateExitCode = await runReleaseGate(tokenA, tokenB);
} catch (error) {
  failure = error;
} finally {
  const cleanupResults = await Promise.allSettled(
    userIds.map((userId) => clerk.users.deleteUser(userId)),
  );
  const cleanupFailure = cleanupResults.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (cleanupFailure && !failure) {
    failure = new Error("Failed to clean up disposable Clerk users", {
      cause: cleanupFailure.reason,
    });
  }
}

if (failure) {
  console.error(
    failure instanceof Error ? failure.message : "Real Clerk release gate failed",
  );
  process.exitCode = 1;
} else {
  process.exitCode = releaseGateExitCode;
}