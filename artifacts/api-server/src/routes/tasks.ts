import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, sql, and } from "drizzle-orm";
import { tasksTable, withAccount } from "@workspace/db";
import {
  ListTasksQueryParams,
  ListTasksResponse,
  CreateTaskBody,
  CreateTaskResponse,
  GetTaskStatsResponse,
  GetTaskParams,
  GetTaskResponse,
  UpdateTaskParams,
  UpdateTaskBody,
  UpdateTaskResponse,
  DeleteTaskParams,
} from "@workspace/api-zod";
import { getRequestUserId } from "../lib/auth";

const router: IRouter = Router();

function requireUserId(req: Parameters<typeof getAuth>[0]): string | null {
  return getRequestUserId(req);
}

function accountScope(req: Parameters<typeof getAuth>[0]) {
  return eq(tasksTable.ownerId, requireUserId(req)!);
}

function rejectUnauthenticated(req: Parameters<typeof getAuth>[0], res: any): boolean {
  if (requireUserId(req)) return false;
  res.status(401).json({ error: "Unauthorized" });
  return true;
}

router.get("/tasks", async (req, res): Promise<void> => {
  if (rejectUnauthenticated(req, res)) return;
  const query = ListTasksQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const filter = query.data.filter ?? "all";
  const listType = (query.data as any).type as string | undefined;

  const conditions = [accountScope(req)];
  if (filter === "completed") conditions.push(eq(tasksTable.completed, true));
  if (filter === "pending")   conditions.push(eq(tasksTable.completed, false));
  if (listType)               conditions.push(eq(tasksTable.type, listType));

  const tasks = await withAccount(requireUserId(req)!, (tx) =>
    tx
      .select()
      .from(tasksTable)
      .where(conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(tasksTable.createdAt),
  );

  res.json(ListTasksResponse.parse(tasks));
});

router.post("/tasks", async (req, res): Promise<void> => {
  if (rejectUnauthenticated(req, res)) return;
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, description, completed, completedAt, color, type, position } = parsed.data as any;
  const isCompleted = completed ?? false;
  const resolvedCompletedAt = isCompleted
    ? completedAt
      ? new Date(completedAt)
      : new Date()
    : null;

  const [task] = await withAccount(requireUserId(req)!, (tx) =>
    tx
      .insert(tasksTable)
      .values({
        title,
        description: description ?? null,
        completed: isCompleted,
        completedAt: resolvedCompletedAt,
        color: color ?? null,
        type: type ?? "done",
        ownerId: requireUserId(req)!,
        position: position ?? 0,
      })
      .returning(),
  );

  res.status(201).json(CreateTaskResponse.parse(task));
});

router.get("/tasks/stats", async (_req, res): Promise<void> => {
  if (rejectUnauthenticated(_req, res)) return;
  const [row] = await withAccount(requireUserId(_req)!, (tx) =>
    tx
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${tasksTable.completed} = true)::int`,
        pending: sql<number>`count(*) filter (where ${tasksTable.completed} = false)::int`,
      })
      .from(tasksTable)
      .where(accountScope(_req)),
  );

  res.json(
    GetTaskStatsResponse.parse({
      total: row?.total ?? 0,
      completed: row?.completed ?? 0,
      pending: row?.pending ?? 0,
    }),
  );
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  if (rejectUnauthenticated(req, res)) return;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetTaskParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await withAccount(requireUserId(req)!, (tx) =>
    tx
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.id, params.data.id), accountScope(req))),
  );

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(GetTaskResponse.parse(task));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  if (rejectUnauthenticated(req, res)) return;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateTaskParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof tasksTable.$inferInsert> = {};

  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color ?? null;
  if (parsed.data.type !== undefined) updates.type = parsed.data.type;
  if (parsed.data.position !== undefined) updates.position = parsed.data.position;

  if (parsed.data.completed !== undefined) {
    updates.completed = parsed.data.completed;
    if (parsed.data.completed) {
      updates.completedAt = parsed.data.completedAt
        ? new Date(parsed.data.completedAt)
        : new Date();
    } else {
      updates.completedAt = null;
    }
  }

  if (parsed.data.completedAt !== undefined && parsed.data.completed === undefined) {
    updates.completedAt = parsed.data.completedAt
      ? new Date(parsed.data.completedAt)
      : null;
  }

  const [task] = await withAccount(requireUserId(req)!, (tx) =>
    tx
      .update(tasksTable)
      .set(updates)
      .where(and(eq(tasksTable.id, params.data.id), accountScope(req)))
      .returning(),
  );

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(UpdateTaskResponse.parse(task));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  if (rejectUnauthenticated(req, res)) return;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteTaskParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await withAccount(requireUserId(req)!, (tx) =>
    tx
      .delete(tasksTable)
      .where(and(eq(tasksTable.id, params.data.id), accountScope(req)))
      .returning(),
  );

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
