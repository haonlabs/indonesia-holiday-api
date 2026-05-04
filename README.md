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

On Render free tier, pre-deploy commands are unavailable. Use:

```text
Build Command: npm install && npm run build
Start Command: npm start
```

Then run migrations manually from your machine before or after deploying:

```bash
npm run db:deploy
```

There is also an emergency fallback start command:

```text
Start Command: npm run start:migrate
```

Use that only if you cannot run migrations elsewhere, because Render free services can cold-start and this would check migrations every time the service starts.

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

The scraper discovers official Kemenko PMK source pages at runtime for the requested year. It searches official Kemenko PMK pages, extracts candidate links mentioning `libur nasional`, `cuti bersama`, and the requested year, then accepts a source only after it can parse both `PUBLIC_HOLIDAY` and `CUTI_BERSAMA` records from the page. `SCRAPER_SOURCE_URL_TEMPLATE` remains available as an optional fallback.

## Yearly Automation

The GitHub Actions workflow at `.github/workflows/yearly-holiday-maintenance.yml` runs every January 1 at 07:15 WIB. It:

```text
1. Installs dependencies
2. Generates Prisma Client
3. Applies migrations
4. Scrapes the current year
5. Deletes holiday data older than 5 years
```

Add these GitHub repository secrets:

```text
DATABASE_URL=<your Supabase session pooler URL>
SCRAPER_SOURCE_URL_TEMPLATE=<optional fallback URL template containing {year}>
```

You can also run it manually from the GitHub Actions tab and provide a `year`, for example `2026`.
