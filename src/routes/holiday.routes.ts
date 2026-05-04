import { Router } from "express";
import { getHolidays } from "../controllers/holiday.controller";

export const holidayRouter = Router();

holidayRouter.get("/", getHolidays);
