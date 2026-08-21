import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RequestHandler } from "express";
import { pool } from "@workspace/db";
import { createApp } from "../src/app";

const TEST_PREFIX = "account-isolation-test-";
const DB_RISK_PREFIX = "db-account-isolation-risk-";
const USER_A = `${TEST_PREFIX}a`;
const USER_B = `${TEST_PREFIX}b`;

const testAuth: RequestHandler = (_req, _res, next) => next();
const app = createApp({
  authMiddleware: testAuth,
  userIdResolver: (req) => req.header("x-test-user") ?? null,
});
let baseUrl: string;
let server: ReturnType<typeof app.listen>;

async function request(
  path: string,
  init: RequestInit = {},
  userId?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (userId) headers.set("x-test-user", userId);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function json(response: Response): Promise<any> {
  return response.json();
}

before(async () => {
  await pool.query(`DELETE FROM tasks WHERE owner_id LIKE '${TEST_PREFIX}%'`);
  await pool.query(`DELETE FROM notebook_items WHERE owner_id LIKE '${TEST_PREFIX}%'`);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert(address && typeof address !== "string");
      baseUrl = `http://127.0.0.1:${address.port}/api`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.query(`DELETE FROM tasks WHERE owner_id LIKE '${TEST_PREFIX}%'`);
  await pool.query(`DELETE FROM notebook_items WHERE owner_id LIKE '${TEST_PREFIX}%'`);
  await pool.end();
});

describe("account isolation", () => {
  it("demonstrates that an unscoped database listing exposes both accounts", async () => {
    try {
      const taskA = await pool.query<{ id: number }>(
        `INSERT INTO tasks (title, owner_id) VALUES ($1, $2) RETURNING id`,
        [`${DB_RISK_PREFIX} task A`, USER_A],
      );
      const taskB = await pool.query<{ id: number }>(
        `INSERT INTO tasks (title, owner_id) VALUES ($1, $2) RETURNING id`,
        [`${DB_RISK_PREFIX} task B`, USER_B],
      );
      const itemA = await pool.query<{ id: number }>(
        `INSERT INTO notebook_items (owner_id, domain, title) VALUES ($1, $2, $3) RETURNING id`,
        [USER_A, "diary", `${DB_RISK_PREFIX} item A`],
      );
      const itemB = await pool.query<{ id: number }>(
        `INSERT INTO notebook_items (owner_id, domain, title) VALUES ($1, $2, $3) RETURNING id`,
        [USER_B, "diary", `${DB_RISK_PREFIX} item B`],
      );

      const unscopedTasks = await pool.query<{ id: number; owner_id: string }>(
        `SELECT id, owner_id FROM tasks WHERE title LIKE $1 ORDER BY id`,
        [`${DB_RISK_PREFIX} task%`],
      );
      const unscopedItems = await pool.query<{ id: number; owner_id: string }>(
        `SELECT id, owner_id FROM notebook_items WHERE title LIKE $1 ORDER BY id`,
        [`${DB_RISK_PREFIX} item%`],
      );

      assert.deepEqual(unscopedTasks.rows, [
        { id: taskA.rows[0].id, owner_id: USER_A },
        { id: taskB.rows[0].id, owner_id: USER_B },
      ]);
      assert.deepEqual(unscopedItems.rows, [
        { id: itemA.rows[0].id, owner_id: USER_A },
        { id: itemB.rows[0].id, owner_id: USER_B },
      ]);
    } finally {
      await pool.query(`DELETE FROM tasks WHERE title LIKE $1`, [`${DB_RISK_PREFIX}%`]);
      await pool.query(`DELETE FROM notebook_items WHERE title LIKE $1`, [`${DB_RISK_PREFIX}%`]);
    }
  });

  it("enforces account isolation for an unscoped query through database row-level security", async () => {
    const roleName = `account_isolation_test_${process.pid}`;
    const client = await pool.connect();
    try {
      await pool.query(`REVOKE ALL PRIVILEGES ON tasks, notebook_items FROM "${roleName}"`).catch(() => undefined);
      await pool.query(`DROP ROLE IF EXISTS "${roleName}"`);
      await pool.query(`CREATE ROLE "${roleName}" NOLOGIN`);
      await pool.query(`GRANT SELECT ON tasks, notebook_items TO "${roleName}"`);

      const taskA = await pool.query<{ id: number }>(
        `INSERT INTO tasks (title, owner_id) VALUES ($1, $2) RETURNING id`,
        [`${DB_RISK_PREFIX} rls task A`, USER_A],
      );
      await pool.query(
        `INSERT INTO tasks (title, owner_id) VALUES ($1, $2)`,
        [`${DB_RISK_PREFIX} rls task B`, USER_B],
      );
      const itemA = await pool.query<{ id: number }>(
        `INSERT INTO notebook_items (owner_id, domain, title) VALUES ($1, $2, $3) RETURNING id`,
        [USER_A, "diary", `${DB_RISK_PREFIX} rls item A`],
      );
      await pool.query(
        `INSERT INTO notebook_items (owner_id, domain, title) VALUES ($1, $2, $3)`,
        [USER_B, "diary", `${DB_RISK_PREFIX} rls item B`],
      );

      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE "${roleName}"`);
      await client.query(`SELECT set_config('app.current_account_id', $1, true)`, [USER_A]);
      const tasksForA = await client.query<{ id: number }>(
        `SELECT id FROM tasks WHERE title LIKE $1 ORDER BY id`,
        [`${DB_RISK_PREFIX} rls task%`],
      );
      const itemsForA = await client.query<{ id: number }>(
        `SELECT id FROM notebook_items WHERE title LIKE $1 ORDER BY id`,
        [`${DB_RISK_PREFIX} rls item%`],
      );
      assert.deepEqual(tasksForA.rows, [{ id: taskA.rows[0].id }]);
      assert.deepEqual(itemsForA.rows, [{ id: itemA.rows[0].id }]);
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.query(`DELETE FROM tasks WHERE title LIKE $1`, [`${DB_RISK_PREFIX} rls%`]);
      await pool.query(`DELETE FROM notebook_items WHERE title LIKE $1`, [`${DB_RISK_PREFIX} rls%`]);
      await pool.query(`REVOKE ALL PRIVILEGES ON tasks, notebook_items FROM "${roleName}"`).catch(() => undefined);
      await pool.query(`DROP ROLE IF EXISTS "${roleName}"`);
    }
  });

  it("requires an account guard in every account-owned route handler", () => {
    const routesDirectory = dirname(fileURLToPath(import.meta.url));
    const routeFiles = ["tasks.ts", "notebook-items.ts"];
    const routeDeclaration = /router\.(get|post|patch|delete)\s*\(/g;

    for (const fileName of routeFiles) {
      const source = readFileSync(join(routesDirectory, "..", "src", "routes", fileName), "utf8");
      const declarations = [...source.matchAll(routeDeclaration)];
      assert.ok(declarations.length > 0, `${fileName} should declare route handlers`);

      declarations.forEach((declaration, index) => {
        const start = declaration.index!;
        const end = declarations[index + 1]?.index ?? source.length;
        const handler = source.slice(start, end);
        const guard = handler.match(
          /\b(?:accountScope|requireUserId|rejectUnauthenticated)\s*\(\s*(?:req|_req)\b/,
        );
        const response = handler.search(/\bres\.(?:json|send|sendStatus|status)\s*\(/);

        assert.ok(guard, `${fileName} ${declaration[0]} must resolve an account before returning data`);
        assert.ok(
          response === -1 || guard.index! < response,
          `${fileName} ${declaration[0]} must resolve an account before responding`,
        );
      });
    }
  });

  it("returns 401 for unauthenticated task and notebook reads and writes", async () => {
    const cases: Array<[string, RequestInit]> = [
      ["/tasks", { method: "GET" }],
      ["/tasks", { method: "POST", body: JSON.stringify({ title: "blocked" }) }],
      ["/notebook-items?domain=diary", { method: "GET" }],
      ["/notebook-items", { method: "POST", body: JSON.stringify({ domain: "diary", title: "blocked" }) }],
      ["/tasks/1", { method: "PATCH", body: JSON.stringify({ title: "blocked" }) }],
      ["/tasks/1", { method: "DELETE" }],
      ["/notebook-items/1", { method: "PATCH", body: JSON.stringify({ title: "blocked" }) }],
      ["/notebook-items/1", { method: "DELETE" }],
    ];

    for (const [path, init] of cases) {
      const response = await request(path, {
        ...init,
        headers: { "content-type": "application/json" },
      });
      assert.equal(response.status, 401, `${init.method} ${path}`);
    }
  });

  it("keeps tasks private and rejects another account's update and delete", async () => {
    const taskAResponse = await request("/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `${TEST_PREFIX} task A` }),
    }, USER_A);
    assert.equal(taskAResponse.status, 201);
    const taskA = await json(taskAResponse);

    const taskBResponse = await request("/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `${TEST_PREFIX} task B` }),
    }, USER_B);
    assert.equal(taskBResponse.status, 201);
    const taskB = await json(taskBResponse);

    const listA = await request("/tasks", {}, USER_A);
    assert.deepEqual((await json(listA)).map((task: any) => task.id), [taskA.id]);
    const listB = await request("/tasks", {}, USER_B);
    assert.deepEqual((await json(listB)).map((task: any) => task.id), [taskB.id]);

    assert.equal((await request(`/tasks/${taskA.id}`, {}, USER_B)).status, 404);
    assert.equal((await request(`/tasks/${taskA.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "stolen" }),
    }, USER_B)).status, 404);
    assert.equal((await request(`/tasks/${taskA.id}`, { method: "DELETE" }, USER_B)).status, 404);
    assert.equal((await request(`/tasks/${taskA.id}`, {}, USER_A)).status, 200);
  });

  it("keeps notebook items private and rejects another account's update and delete", async () => {
    const create = (userId: string, title: string) => request("/notebook-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: "diary", title }),
    }, userId);

    const itemAResponse = await create(USER_A, `${TEST_PREFIX} item A`);
    assert.equal(itemAResponse.status, 201);
    const itemA = await json(itemAResponse);
    const itemBResponse = await create(USER_B, `${TEST_PREFIX} item B`);
    assert.equal(itemBResponse.status, 201);
    const itemB = await json(itemBResponse);

    const listA = await request("/notebook-items?domain=diary", {}, USER_A);
    assert.deepEqual((await json(listA)).map((item: any) => item.id), [itemA.id]);
    const listB = await request("/notebook-items?domain=diary", {}, USER_B);
    assert.deepEqual((await json(listB)).map((item: any) => item.id), [itemB.id]);

    assert.equal((await request(`/notebook-items/${itemA.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "stolen" }),
    }, USER_B)).status, 404);
    assert.equal((await request(`/notebook-items/${itemA.id}`, { method: "DELETE" }, USER_B)).status, 404);
    assert.equal((await request(`/notebook-items/${itemA.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "updated by owner" }),
    }, USER_A)).status, 200);
  });
});