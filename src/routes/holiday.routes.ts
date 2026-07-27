import { Router } from "express";
import { getHolidays } from "../controllers/holiday.controller";
import { asyncHandler } from "../middleware/async-handler";

export const holidayRouter = Router();

holidayRouter.get("/", asyncHandler(getHolidays));
