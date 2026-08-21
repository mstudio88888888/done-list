import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app";

const sessionTokenA = process.env["CLERK_TEST_SESSION_TOKEN_A"];
const sessionTokenB = process.env["CLERK_TEST_SESSION_TOKEN_B"];
const runRealAuthTests = process.env["RUN_REAL_CLERK_TESTS"] === "1";
const describeRealAuth = runRealAuthTests ? describe : describe.skip;

if (runRealAuthTests) {
  assert(sessionTokenA, "CLERK_TEST_SESSION_TOKEN_A is required when RUN_REAL_CLERK_TESTS=1");
  assert(sessionTokenB, "CLERK_TEST_SESSION_TOKEN_B is required when RUN_REAL_CLERK_TESTS=1");
  assert.notEqual(sessionTokenA, sessionTokenB, "real Clerk sessions must be different");
}

let baseUrl: string;
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
const createdTaskIds: number[] = [];
const createdNotebookItemIds: number[] = [];

async function request(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describeRealAuth("real Clerk account isolation", () => {
  before(async () => {
    const app = createApp();
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
    if (!server) return;

    const deleteOwned = async (path: string, token: string) => {
      const response = await request(path, token, { method: "DELETE" });
      assert.ok(response.status === 204 || response.status === 404);
    };

    if (sessionTokenA) {
      for (const id of createdTaskIds) await deleteOwned(`/tasks/${id}`, sessionTokenA);
      for (const id of createdNotebookItemIds) await deleteOwned(`/notebook-items/${id}`, sessionTokenA);
    }
    if (sessionTokenB) {
      for (const id of createdTaskIds) await deleteOwned(`/tasks/${id}`, sessionTokenB);
      for (const id of createdNotebookItemIds) await deleteOwned(`/notebook-items/${id}`, sessionTokenB);
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it("keeps tasks private across real sessions for reads, updates, and deletes", async () => {
    const taskAResponse = await request("/tasks", sessionTokenA!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "real-clerk-isolation-task-a" }),
    });
    assert.equal(taskAResponse.status, 201);
    const taskA = await json<{ id: number }>(taskAResponse);
    createdTaskIds.push(taskA.id);

    const taskBResponse = await request("/tasks", sessionTokenB!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "real-clerk-isolation-task-b" }),
    });
    assert.equal(taskBResponse.status, 201);
    const taskB = await json<{ id: number }>(taskBResponse);
    createdTaskIds.push(taskB.id);

    const listA = await json<Array<{ id: number }>>(await request("/tasks", sessionTokenA!));
    const listB = await json<Array<{ id: number }>>(await request("/tasks", sessionTokenB!));
    assert.ok(listA.some((task) => task.id === taskA.id));
    assert.ok(!listA.some((task) => task.id === taskB.id));
    assert.ok(listB.some((task) => task.id === taskB.id));
    assert.ok(!listB.some((task) => task.id === taskA.id));

    assert.equal((await request(`/tasks/${taskA.id}`, sessionTokenB!)).status, 404);
    assert.equal((await request(`/tasks/${taskA.id}`, sessionTokenB!, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "cross-account-update" }),
    })).status, 404);
    assert.equal((await request(`/tasks/${taskA.id}`, sessionTokenB!, { method: "DELETE" })).status, 404);
    assert.equal((await request(`/tasks/${taskA.id}`, sessionTokenA!, { method: "DELETE" })).status, 204);
    createdTaskIds.splice(createdTaskIds.indexOf(taskA.id), 1);
  });

  it("keeps notebook items private across real sessions for reads, updates, and deletes", async () => {
    const create = (token: string, title: string) => request("/notebook-items", token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: "diary", title }),
    });

    const itemAResponse = await create(sessionTokenA!, "real-clerk-isolation-item-a");
    assert.equal(itemAResponse.status, 201);
    const itemA = await json<{ id: number }>(itemAResponse);
    createdNotebookItemIds.push(itemA.id);

    const itemBResponse = await create(sessionTokenB!, "real-clerk-isolation-item-b");
    assert.equal(itemBResponse.status, 201);
    const itemB = await json<{ id: number }>(itemBResponse);
    createdNotebookItemIds.push(itemB.id);

    const listA = await json<Array<{ id: number }>>(
      await request("/notebook-items?domain=diary", sessionTokenA!),
    );
    const listB = await json<Array<{ id: number }>>(
      await request("/notebook-items?domain=diary", sessionTokenB!),
    );
    assert.ok(listA.some((item) => item.id === itemA.id));
    assert.ok(!listA.some((item) => item.id === itemB.id));
    assert.ok(listB.some((item) => item.id === itemB.id));
    assert.ok(!listB.some((item) => item.id === itemA.id));

    assert.equal((await request(`/notebook-items/${itemA.id}`, sessionTokenB!, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "cross-account-update" }),
    })).status, 404);
    assert.equal((await request(`/notebook-items/${itemA.id}`, sessionTokenB!, { method: "DELETE" })).status, 404);
    assert.equal((await request(`/notebook-items/${itemA.id}`, sessionTokenA!, { method: "DELETE" })).status, 204);
    createdNotebookItemIds.splice(createdNotebookItemIds.indexOf(itemA.id), 1);
  });
});