import axios from "axios";
import * as cheerio from "cheerio";
import { HolidayType } from "@prisma/client";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { toUtcDate } from "../utils/date";
import { HttpError } from "../utils/http-error";

export type ScrapedHoliday = {
  date: string;
  name: string;
  type: HolidayType;
};

export type ScrapeResult = {
  year: number;
  sourceUrl: string;
  scrapedCount: number;
  upsertedCount: number;
  holidays: ScrapedHoliday[];
};

const DEFAULT_SOURCE_BY_YEAR: Record<number, string> = {
  2026: "https://beta.grobogan.go.id/pengumuman/libur-nasional-dan-cuti-bersama-tahun-2026"
};

const MONTHS: Record<string, number> = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12
};

const WEEKDAYS =
  /\b(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)\b/gi;

function getSourceUrl(year: number): string {
  const defaultSource = DEFAULT_SOURCE_BY_YEAR[year];
  if (defaultSource) {
    return defaultSource;
  }

  if (env.SCRAPER_SOURCE_URL_TEMPLATE) {
    return env.SCRAPER_SOURCE_URL_TEMPLATE.replace("{year}", String(year));
  }

  throw new HttpError(
    400,
    `No scraper source configured for ${year}. Set SCRAPER_SOURCE_URL_TEMPLATE to scrape this year.`
  );
}

function compactText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(name: string): string {
  return compactText(name)
    .replace(/^cuti bersama\s+/i, "")
    .replace(/[.。]+$/g, "")
    .trim();
}

function formatDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid parsed date: ${year}-${month}-${day}`);
  }

  return date.toISOString().slice(0, 10);
}

function expandDays(raw: string): number[] {
  const normalized = raw
    .replace(/[–—]/g, "-")
    .replace(/\bdan\b/gi, ",")
    .replace(/\bserta\b/gi, ",");

  const days: number[] = [];
  for (const match of normalized.matchAll(/\d{1,2}(?:\s*-\s*\d{1,2})?/g)) {
    const [start, end] = match[0].split("-").map((value) => Number(value.trim()));
    if (end && end >= start) {
      for (let day = start; day <= end; day += 1) {
        days.push(day);
      }
    } else {
      days.push(start);
    }
  }

  return [...new Set(days)].filter((day) => day >= 1 && day <= 31);
}

function extractDateParts(line: string, year: number): string[] {
  const dates: string[] = [];
  const monthPattern = new RegExp(`\\b(${Object.keys(MONTHS).join("|")})\\b`, "gi");

  for (const match of line.matchAll(monthPattern)) {
    const monthName = match[1].toLowerCase();
    const month = MONTHS[monthName];
    const prefix = line.slice(0, match.index).replace(/^\s*\d+\.\s*/, "");
    const cleanedPrefix = prefix
      .replace(WEEKDAYS, "")
      .replace(/\btanggal\b/gi, "")
      .replace(/\bke\b/gi, "")
      .trim();

    for (const day of expandDays(cleanedPrefix)) {
      dates.push(formatDate(year, month, day));
    }
  }

  return [...new Set(dates)];
}

function extractName(line: string): string {
  const withoutNumbering = line.replace(/^\s*\d+\.\s*/, "");
  const separatorMatch = withoutNumbering.match(/\s[-:]\s*(.+)$/);
  if (separatorMatch?.[1]) {
    return normalizeName(separatorMatch[1]);
  }

  const afterColon = withoutNumbering.split(":").at(-1);
  if (afterColon && afterColon !== withoutNumbering) {
    return normalizeName(afterColon);
  }

  return normalizeName(
    withoutNumbering
      .replace(WEEKDAYS, "")
      .replace(
        new RegExp(
          `\\b\\d{1,2}(?:\\s*(?:,|-|dan|serta)\\s*\\d{1,2})*\\s*(${Object.keys(MONTHS).join("|")})\\b`,
          "gi"
        ),
        ""
      )
      .replace(/\b\d{4}\b/g, "")
  );
}

function parseHolidayLine(
  line: string,
  fallbackType: HolidayType,
  year: number
): ScrapedHoliday[] {
  const normalizedLine = compactText(line);
  if (!normalizedLine || !/\d{1,2}/.test(normalizedLine)) {
    return [];
  }

  const type = /cuti bersama/i.test(normalizedLine)
    ? HolidayType.CUTI_BERSAMA
    : fallbackType;
  const dates = extractDateParts(normalizedLine, year);
  const name = extractName(normalizedLine);

  if (!dates.length || !name) {
    return [];
  }

  return dates.map((date) => ({
    date,
    name,
    type
  }));
}

function extractLines(html: string): string[] {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe").remove();

  const lines = new Set<string>();
  $("article, main, body")
    .find("h1, h2, h3, h4, p, li, td, th")
    .each((_index, element) => {
      const text = compactText($(element).text());
      if (text) {
        lines.add(text);
      }
    });

  return [...lines];
}

export function parseHolidayHtml(html: string, year: number): ScrapedHoliday[] {
  const lines = extractLines(html);
  let currentType: HolidayType = HolidayType.PUBLIC_HOLIDAY;
  const holidays: ScrapedHoliday[] = [];
  const monthPattern = new RegExp(`\\b(${Object.keys(MONTHS).join("|")})\\b`, "i");

  for (const line of lines) {
    const isSectionHeading = !monthPattern.test(line);

    if (/cuti bersama/i.test(line) && isSectionHeading) {
      currentType = HolidayType.CUTI_BERSAMA;
      continue;
    }

    if (
      /hari libur nasional|libur nasional/i.test(line) &&
      !/cuti bersama/i.test(line) &&
      isSectionHeading
    ) {
      currentType = HolidayType.PUBLIC_HOLIDAY;
      continue;
    }

    holidays.push(...parseHolidayLine(line, currentType, year));
  }

  const deduplicated = new Map<string, ScrapedHoliday>();
  for (const holiday of holidays) {
    deduplicated.set(`${holiday.date}:${holiday.type}`, holiday);
  }

  return [...deduplicated.values()].sort((a, b) =>
    `${a.date}:${a.type}`.localeCompare(`${b.date}:${b.type}`)
  );
}

async function upsertHolidays(holidays: ScrapedHoliday[], year: number): Promise<number> {
  let count = 0;

  for (const holiday of holidays) {
    await prisma.holiday.upsert({
      where: {
        holiday_date_type_unique: {
          date: toUtcDate(holiday.date),
          type: holiday.type
        }
      },
      create: {
        date: toUtcDate(holiday.date),
        name: holiday.name,
        type: holiday.type,
        year
      },
      update: {
        name: holiday.name,
        year
      }
    });
    count += 1;
  }

  return count;
}

export async function scrapeHolidays(year: number): Promise<ScrapeResult> {
  const sourceUrl = getSourceUrl(year);
  logger.info({ year, sourceUrl }, "Starting holiday scrape");

  const response = await axios.get<string>(sourceUrl, {
    timeout: 15000,
    headers: {
      "User-Agent":
        "indonesia-holiday-api/1.0 (+https://github.com/example/indonesia-holiday-api)"
    }
  });

  const holidays = parseHolidayHtml(response.data, year);
  if (!holidays.length) {
    throw new HttpError(422, "No holidays could be parsed from the source page", {
      sourceUrl
    });
  }

  const upsertedCount = await upsertHolidays(holidays, year);
  logger.info(
    {
      year,
      sourceUrl,
      scrapedCount: holidays.length,
      upsertedCount,
      publicHolidays: holidays.filter((holiday) => holiday.type === HolidayType.PUBLIC_HOLIDAY)
        .length,
      cutiBersama: holidays.filter((holiday) => holiday.type === HolidayType.CUTI_BERSAMA).length
    },
    "Finished holiday scrape"
  );

  return {
    year,
    sourceUrl,
    scrapedCount: holidays.length,
    upsertedCount,
    holidays
  };
}
