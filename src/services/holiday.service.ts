import { HolidayType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { toDateOnly } from "../utils/date";

export type HolidayFilters = {
  year?: number;
  type?: HolidayType;
};

export async function listHolidays(filters: HolidayFilters) {
  const where: Prisma.HolidayWhereInput = {
    year: filters.year,
    type: filters.type
  };

  const holidays = await prisma.holiday.findMany({
    where,
    orderBy: [{ date: "asc" }, { type: "asc" }]
  });

  return holidays.map((holiday) => ({
    ...holiday,
    date: toDateOnly(holiday.date)
  }));
}
