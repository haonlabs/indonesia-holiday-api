import { scrapeHolidays } from "../services/scraper.service";
import { deleteHolidaysOlderThanYears } from "../services/holiday-retention.service";
import { prisma } from "../lib/prisma";

function getNumberEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }

  return parsed;
}

async function main() {
  const now = new Date();
  const scrapeYear = getNumberEnv("SCRAPE_YEAR") ?? now.getUTCFullYear();
  const retentionYears = getNumberEnv("RETENTION_YEARS") ?? 5;

  const scrapeResult = await scrapeHolidays(scrapeYear);
  const cleanupResult = await deleteHolidaysOlderThanYears(scrapeYear, retentionYears);

  console.log(
    JSON.stringify(
      {
        scrape: {
          year: scrapeResult.year,
          sourceUrl: scrapeResult.sourceUrl,
          scrapedCount: scrapeResult.scrapedCount,
          upsertedCount: scrapeResult.upsertedCount
        },
        cleanup: cleanupResult
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
