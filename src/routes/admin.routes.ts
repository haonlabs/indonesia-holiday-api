import { Router } from "express";
import { scrape } from "../controllers/admin.controller";
import { asyncHandler } from "../middleware/async-handler";

export const adminRouter = Router();

adminRouter.post("/scrape", asyncHandler(scrape));
