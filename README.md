# Indonesia Holiday API

Production-ready REST API for Indonesian national holidays (`Hari Libur Nasional`) and collective leave days (`Cuti Bersama`) using Express, Prisma, PostgreSQL, Axios, and Cheerio.

## Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Set `DATABASE_URL` to your Supabase PostgreSQL connection string.

## Endpoints

```http
GET /health
GET /holidays
GET /holidays?year=2026
GET /holidays?type=PUBLIC_HOLIDAY
GET /holidays?type=CUTI_BERSAMA
POST /admin/scrape?year=2026
```

## Sample API Response

```json
[
  {
    "id": "4ab81aa3-2b20-4c7d-b2ea-60236c133f50",
    "date": "2026-01-01",
    "name": "Tahun Baru 2026 Masehi",
    "type": "PUBLIC_HOLIDAY",
    "year": 2026,
    "createdAt": "2026-05-04T02:00:00.000Z",
    "updatedAt": "2026-05-04T02:00:00.000Z"
  }
]
```

## Scraper

The scraper exposes `scrapeHolidays(year: number)`. It fetches a trusted public page, detects separate sections for `Hari Libur Nasional` and `Cuti Bersama`, normalizes dates to `YYYY-MM-DD`, and upserts records using the unique `(date, type)` constraint.

The built-in 2026 source is a government-domain announcement from Kabupaten Grobogan that explicitly labels both holiday categories. For other years, configure `SCRAPER_SOURCE_URL_TEMPLATE` with a `{year}` placeholder.
