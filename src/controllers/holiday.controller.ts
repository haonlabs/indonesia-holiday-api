import type { Request, Response } from "express";
import { HolidayType } from "@prisma/client";
import { z } from "zod";
import { listHolidays } from "../services/holiday.service";

const holidayQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  type: z.nativeEnum(HolidayType).optional()
});

export async function getHolidays(req: Request, res: Response) {
  const filters = holidayQuerySchema.parse(req.query);
  const holidays = await listHolidays(filters);
  res.json(holidays);
}
