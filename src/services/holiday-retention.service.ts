import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

export type HolidayRetentionResult = {
  currentYear: number;
  retentionYears: number;
  deleteBeforeYear: number;
  deletedCount: number;
};

export async function deleteHolidaysOlderThanYears(
  currentYear: number,
  retentionYears = 5
): Promise<HolidayRetentionResult> {
  const deleteBeforeYear = currentYear - retentionYears;

  const result = await prisma.holiday.deleteMany({
    where: {
      year: {
        lt: deleteBeforeYear
      }
    }
  });

  logger.info(
    {
      currentYear,
      retentionYears,
      deleteBeforeYear,
      deletedCount: result.count
    },
    "Finished holiday retention cleanup"
  );

  return {
    currentYear,
    retentionYears,
    deleteBeforeYear,
    deletedCount: result.count
  };
}
