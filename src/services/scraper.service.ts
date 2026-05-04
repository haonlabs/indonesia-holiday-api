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

type SourceDocument = {
  url: string;
  html: string;
};

type FetchHtmlOptions = {
  timeoutMs?: number;
  unavailableOrigins?: Set<string>;
  warnOnFailure?: boolean;
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

const OFFICIAL_BASE_URLS = [
  "https://www.kemenkopmk.go.id",
  "https://kemenkopmk.go.id",
  "https://www2.kemenkopmk.go.id"
];

const REQUEST_HEADERS = {
  "User-Agent":
    "indonesia-holiday-api/1.0 (+https://github.com/example/indonesia-holiday-api)"
};

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

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isOfficialKemenkoPmkUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "kemenkopmk.go.id" || hostname.endsWith(".kemenkopmk.go.id");
  } catch {
    return false;
  }
}

function buildDiscoveryUrls(year: number): string[] {
  const query = encodeURIComponent(`libur nasional cuti bersama tahun ${year}`);
  const pathQuery = encodeURIComponent(`libur nasional cuti bersama ${year}`).replace(
    /%20/g,
    "+"
  );

  return unique(
    OFFICIAL_BASE_URLS.flatMap((baseUrl) => [
      baseUrl,
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`,
      `${baseUrl}/?s=${query}`,
      `${baseUrl}/search?search=${query}`,
      `${baseUrl}/search/node?keys=${query}`,
      `${baseUrl}/search/node/${pathQuery}`,
      `${baseUrl}/index.php/search/node/${pathQuery}`
    ])
  );
}

function buildSearchDiscoveryUrls(year: number): string[] {
  const query = encodeURIComponent(
    `site:kemenkopmk.go.id libur nasional cuti bersama tahun ${year}`
  );

  return [
    `https://duckduckgo.com/html/?q=${query}`,
    `https://www.bing.com/search?q=${query}`
  ];
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_value, index) => start + index);
}

function buildGenericArticleCandidates(year: number): string[] {
  const slugs: string[] = [
    `pemerintah-tetapkan-hari-libur-nasional-dan-cuti-bersama-tahun-${year}`,
    `skb-3-menteri-libur-nasional-dan-cuti-bersama-tahun-${year}`,
    `index.php/pemerintah-tetapkan-hari-libur-nasional-dan-cuti-bersama-tahun-${year}`,
    `index.php/skb-3-menteri-libur-nasional-dan-cuti-bersama-tahun-${year}`
  ];

  for (const publicHolidayCount of range(10, 25)) {
    for (const cutiBersamaCount of range(0, 15)) {
      slugs.push(
        `pemerintah-tetapkan-${publicHolidayCount}-hari-libur-nasional-dan-${cutiBersamaCount}-cuti-bersama-tahun-${year}`,
        `pemerintah-tetapkan-${publicHolidayCount}-hari-libur-nasional-dan-${cutiBersamaCount}-hari-cuti-bersama-tahun-${year}`
      );
    }
  }

  return unique(
    slugs.flatMap((slug) =>
      OFFICIAL_BASE_URLS.map((baseUrl) => `${baseUrl}/${slug}`)
    )
  );
}

function resolveCandidateUrl(href: string, sourceUrl: string): string | undefined {
  try {
    const url = new URL(href, sourceUrl);

    const redirectParam =
      url.searchParams.get("uddg") ||
      url.searchParams.get("q") ||
      url.searchParams.get("url");

    if (redirectParam && redirectParam.startsWith("http")) {
      return new URL(redirectParam).toString();
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function extractCandidateUrls(html: string, sourceUrl: string, year: number): string[] {
  const $ = cheerio.load(html);
  const candidates: string[] = [];

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (!href) {
      return;
    }

    const label = compactText(`${$(element).text()} ${href}`).toLowerCase();
    if (
      !label.includes(String(year)) ||
      !label.includes("libur") ||
      !label.includes("cuti")
    ) {
      return;
    }

    const candidateUrl = resolveCandidateUrl(href, sourceUrl);
    if (!candidateUrl) {
      return;
    }

    if (isOfficialKemenkoPmkUrl(candidateUrl)) {
      candidates.push(candidateUrl.split("#")[0]);
    }
  });

  $("loc").each((_index, element) => {
    const loc = compactText($(element).text());
    const label = loc.toLowerCase();
    if (
      label.includes(String(year)) &&
      label.includes("libur") &&
      label.includes("cuti") &&
      isOfficialKemenkoPmkUrl(loc)
    ) {
      candidates.push(loc.split("#")[0]);
    }
  });

  return unique(candidates);
}

function getOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function isUnavailableOriginError(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    ["ECONNABORTED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"].includes(
      String(error.code)
    ) &&
    !error.response
  );
}

async function fetchHtml(
  url: string,
  options: FetchHtmlOptions = {}
): Promise<string | undefined> {
  const origin = getOrigin(url);
  if (origin && options.unavailableOrigins?.has(origin)) {
    return undefined;
  }

  try {
    const response = await axios.get<string>(url, {
      timeout: options.timeoutMs ?? 15000,
      headers: REQUEST_HEADERS,
      responseType: "text",
      validateStatus: (status) => status >= 200 && status < 400
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      logger.debug({ url }, "Candidate holiday source returned 404");
      return undefined;
    }

    if (origin && isUnavailableOriginError(error)) {
      options.unavailableOrigins?.add(origin);
    }

    const log = options.warnOnFailure === false ? logger.debug : logger.warn;
    log.call(logger, { url, error }, "Failed to fetch candidate holiday source");
    return undefined;
  }
}

function isValidHolidaySource(html: string, year: number): boolean {
  const holidays = parseHolidayHtml(html, year);
  return (
    holidays.some((holiday) => holiday.type === HolidayType.PUBLIC_HOLIDAY) &&
    holidays.some((holiday) => holiday.type === HolidayType.CUTI_BERSAMA)
  );
}

async function findFirstValidCandidate(
  candidateUrls: Iterable<string>,
  year: number
): Promise<SourceDocument | undefined> {
  const urls = unique([...candidateUrls]);
  let currentIndex = 0;
  let sourceDocument: SourceDocument | undefined;
  const unavailableOrigins = new Set<string>();

  const worker = async () => {
    while (!sourceDocument && currentIndex < urls.length) {
      const candidateUrl = urls[currentIndex];
      currentIndex += 1;

      const html = await fetchHtml(candidateUrl, {
        timeoutMs: 3000,
        unavailableOrigins,
        warnOnFailure: false
      });
      if (!html || !isValidHolidaySource(html, year)) {
        continue;
      }

      sourceDocument = {
        url: candidateUrl,
        html
      };
    }
  };

  await Promise.all(Array.from({ length: 8 }, () => worker()));
  return sourceDocument;
}

async function discoverOfficialSourceDocument(year: number): Promise<SourceDocument | undefined> {
  logger.info({ year }, "Discovering official holiday source");

  const candidateUrls = new Set<string>(buildGenericArticleCandidates(year));
  const directCandidate = await findFirstValidCandidate(candidateUrls, year);
  if (directCandidate) {
    logger.info(
      { year, sourceUrl: directCandidate.url },
      "Discovered official holiday source"
    );
    return directCandidate;
  }

  const searchCandidateUrls = new Set<string>();
  for (const discoveryUrl of buildSearchDiscoveryUrls(year)) {
    const html = await fetchHtml(discoveryUrl, {
      timeoutMs: 10000,
      warnOnFailure: false
    });
    if (!html) {
      continue;
    }

    for (const candidateUrl of extractCandidateUrls(html, discoveryUrl, year)) {
      searchCandidateUrls.add(candidateUrl);
    }
  }

  const searchCandidate = await findFirstValidCandidate(searchCandidateUrls, year);
  if (searchCandidate) {
    logger.info(
      { year, sourceUrl: searchCandidate.url },
      "Discovered official holiday source"
    );
    return searchCandidate;
  }

  const unavailableDiscoveryOrigins = new Set<string>();
  for (const discoveryUrl of buildDiscoveryUrls(year)) {
    const html = await fetchHtml(discoveryUrl, {
      timeoutMs: 5000,
      unavailableOrigins: unavailableDiscoveryOrigins
    });
    if (!html) {
      continue;
    }

    if (isValidHolidaySource(html, year)) {
      return { url: discoveryUrl, html };
    }

    for (const candidateUrl of extractCandidateUrls(html, discoveryUrl, year)) {
      candidateUrls.add(candidateUrl);
    }
  }

  const discoveredSource = await findFirstValidCandidate(candidateUrls, year);
  if (discoveredSource) {
    logger.info(
      { year, sourceUrl: discoveredSource.url },
      "Discovered official holiday source"
    );
    return discoveredSource;
  }

  return undefined;
}

async function getSourceDocument(year: number): Promise<SourceDocument> {
  const discoveredSource = await discoverOfficialSourceDocument(year);
  if (discoveredSource) {
    return discoveredSource;
  }

  if (env.SCRAPER_SOURCE_URL_TEMPLATE) {
    const url = env.SCRAPER_SOURCE_URL_TEMPLATE.replace("{year}", String(year));
    const html = await fetchHtml(url);
    if (html && isValidHolidaySource(html, year)) {
      return { url, html };
    }
  }

  throw new HttpError(
    400,
    `Could not discover an official holiday source for ${year}. The government may not have published it yet.`
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
  const sourceDocument = await getSourceDocument(year);
  const sourceUrl = sourceDocument.url;
  logger.info({ year, sourceUrl }, "Starting holiday scrape");

  const holidays = parseHolidayHtml(sourceDocument.html, year);
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
