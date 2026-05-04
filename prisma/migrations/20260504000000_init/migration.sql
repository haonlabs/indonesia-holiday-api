-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('PUBLIC_HOLIDAY', 'CUTI_BERSAMA');

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holiday_year_idx" ON "Holiday"("year");

-- CreateIndex
CREATE INDEX "Holiday_type_idx" ON "Holiday"("type");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_date_type_unique" ON "Holiday"("date", "type");
