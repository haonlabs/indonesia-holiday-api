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

## Render Deployment

Use these Render settings:

```text
Build Command: npm install && npm run build
Pre-Deploy Command: npm run db:deploy
Start Command: npm start
```

Required environment variables:

```text
NODE_ENV=production
DATABASE_URL=<your Supabase session pooler URL on port 5432>
```

Do not run `prisma db push` in Render's build command. Builds should compile the app; migrations should run as a pre-deploy step or manually with `npm run db:deploy`.

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
