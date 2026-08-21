import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { notebookItemsTable, withAccount } from "@workspace/db";
import {
  CreateNotebookItemBody,
  CreateNotebookItemResponse,
  DeleteNotebookItemParams,
  ListNotebookItemsQueryParams,
  ListNotebookItemsResponse,
  UpdateNotebookItemBody,
  UpdateNotebookItemParams,
  UpdateNotebookItemResponse,
} from "@workspace/api-zod";
import { getRequestUserId } from "../lib/auth";

const router: IRouter = Router();

function requireUserId(req: Parameters<typeof getRequestUserId>[0]): string | null {
  return getRequestUserId(req);
}

function formatDate(value: Date | null | undefined): string | null | undefined {
  return value ? value.toISOString().slice(0, 10) : value;
}

router.get("/notebook-items", async (req, res): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = ListNotebookItemsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const items = await withAccount(userId, (tx) =>
    tx
      .select()
      .from(notebookItemsTable)
      .where(
        and(
          eq(notebookItemsTable.ownerId, userId),
          eq(notebookItemsTable.domain, parsed.data.domain),
          parsed.data.section
            ? eq(notebookItemsTable.section, parsed.data.section)
            : undefined,
        ),
      )
      .orderBy(asc(notebookItemsTable.position), asc(notebookItemsTable.createdAt)),
  );

  res.json(ListNotebookItemsResponse.parse(items));
});

router.post("/notebook-items", async (req, res): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateNotebookItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await withAccount(userId, (tx) =>
    tx
      .insert(notebookItemsTable)
      .values({
        ...parsed.data,
        entryDate: formatDate(parsed.data.entryDate),
        ownerId: userId,
        updatedAt: new Date(),
      })
      .returning(),
  );
  res.status(201).json(CreateNotebookItemResponse.parse(item));
});

router.patch("/notebook-items/:id", async (req, res): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateNotebookItemParams.safeParse(req.params);
  const body = UpdateNotebookItemBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [item] = await withAccount(userId, (tx) =>
    tx
      .update(notebookItemsTable)
      .set({
        ...body.data,
        entryDate: formatDate(body.data.entryDate),
        updatedAt: new Date(),
      })
      .where(and(eq(notebookItemsTable.id, params.data.id), eq(notebookItemsTable.ownerId, userId)))
      .returning(),
  );
  if (!item) {
    res.status(404).json({ error: "Notebook item not found" });
    return;
  }
  res.json(UpdateNotebookItemResponse.parse(item));
});

router.delete("/notebook-items/:id", async (req, res): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = DeleteNotebookItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await withAccount(userId, (tx) =>
    tx
      .delete(notebookItemsTable)
      .where(and(eq(notebookItemsTable.id, params.data.id), eq(notebookItemsTable.ownerId, userId)))
      .returning(),
  );
  if (!item) {
    res.status(404).json({ error: "Notebook item not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;