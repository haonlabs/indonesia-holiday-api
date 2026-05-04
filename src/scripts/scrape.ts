import { scrapeHolidays } from "../services/scraper.service";
import { prisma } from "../lib/prisma";

const year = Number(process.argv[2]);

if (!Number.isInteger(year)) {
  throw new Error("Usage: npm run scrape -- 2026");
}

scrapeHolidays(year)
  .then((result) => {
    console.log(
      JSON.stringify(
        {
          year: result.year,
          sourceUrl: result.sourceUrl,
          scrapedCount: result.scrapedCount,
          upsertedCount: result.upsertedCount
        },
        null,
        2
      )
    );
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
