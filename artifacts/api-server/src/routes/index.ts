import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tasksRouter from "./tasks";
import notebookItemsRouter from "./notebook-items";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tasksRouter);
router.use(notebookItemsRouter);

export default router;
