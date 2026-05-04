import { Router } from "express";
import { scrape } from "../controllers/admin.controller";

export const adminRouter = Router();

adminRouter.post("/scrape", scrape);
