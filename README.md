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
DIRECT_URL=<your Supabase session pooler URL on port 5432, used by Prisma migrations>
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

## API Documentation

Swagger UI documentation is available in the `docs` folder for GitHub Pages:

```text
docs/index.html
docs/openapi.json
```

To publish it:

```text
GitHub repo -> Settings -> Pages -> Build and deployment
Source: Deploy from a branch
Branch: main
Folder: /docs
```

After GitHub Pages is enabled, open the generated Pages URL. Enter your deployed API base URL, for example:

```text
https://indonesia-holiday-api.onrender.com
```

Then use Swagger UI's `Try it out` buttons to test requests directly from the documentation page. This works because the API enables CORS.

The API root route (`GET /`) redirects to `DOCS_URL`, so opening the Render base URL sends users to the Swagger documentation.

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

The scraper uses a provider chain. It tries fast structured public JSON sources first, then falls back to web/source discovery and HTML scraping. Records are normalized into the local `Holiday` model, with names containing `Cuti Bersama` classified as `CUTI_BERSAMA` and the rest as `PUBLIC_HOLIDAY`. The scrape has a hard timeout so automation does not hang indefinitely.

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
DATABASE_URL=<your Supabase runtime URL>
DIRECT_URL=<your Supabase session pooler URL on port 5432, used by Prisma migrations>
SCRAPER_SOURCE_URL_TEMPLATE=<optional fallback URL template containing {year}>
```

You can also run it manually from the GitHub Actions tab and provide a `year`, for example `2026`.
