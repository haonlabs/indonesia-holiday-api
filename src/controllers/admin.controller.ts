import type { Request, Response } from "express";
import { z } from "zod";
import { scrapeHolidays } from "../services/scraper.service";

const scrapeQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200)
});

export async function scrape(req: Request, res: Response) {
  const { year } = scrapeQuerySchema.parse(req.query);
  const result = await scrapeHolidays(year);

  res.json({
    year: result.year,
    sourceUrl: result.sourceUrl,
    scrapedCount: result.scrapedCount,
    upsertedCount: result.upsertedCount
  });
}
