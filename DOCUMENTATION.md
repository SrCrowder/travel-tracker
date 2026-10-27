# Travel Tracker — Documentation

Personal travel diary web application. Log trips, locations, photos, and notes. View everything on an interactive map with timeline and calendar views. Export trips as PDF keepsakes.

---

## Table of Contents

1. [Features](#1-features)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Running Locally (Dev Mode)](#4-running-locally-dev-mode)
5. [Running Locally with Docker](#5-running-locally-with-docker)
6. [Deploying to a Server (GitHub Container Registry)](#6-deploying-to-a-server-github-container-registry)
7. [Environment Variables](#7-environment-variables)
8. [Database Schema](#8-database-schema)
9. [REST API Reference](#9-rest-api-reference)
10. [Adding a New Language](#10-adding-a-new-language)
11. [Adding Features — Key Patterns](#11-adding-features--key-patterns)
12. [Data Backup & Reset](#12-data-backup--reset)
13. [Common Problems & Fixes](#13-common-problems--fixes)

---

## 1. Features

| Feature | Description |
|---|---|
| Trip management | Create, edit, delete trips with title, dates, description, tags, cover photo |
| Cover photo reposition | Drag to set the focal point of the cover image (shown in cards and hero) |
| Locations | Add locations to a trip with coordinates, dates, star rating, description, private notes |
| Interactive map | react-leaflet map with numbered markers; toggle between straight-line and road routing (OSRM) |
| Timeline view | Day-by-day breakdown of each trip, with the photos/videos taken each day |
| Photos & videos | Upload, view in lightbox, play, download the original, delete; attach to a location or the trip generally. Photos: JPG, PNG, GIF, WebP, AVIF, **HEIC** (iPhone), TIFF. Videos: **MOV** (iPhone), MP4, WebM |
| Bulk import | Drop many photos and videos at once: their date and GPS are read in the browser, shown on a map, grouped into places (named with OpenStreetMap) and imported into a new or an existing trip |
| Media on the map | Geotagged photos/videos appear on the trip map as thumbnails (grouped when zoomed out); click to open/play |
| Travel calendar | Calendar view highlighting days with active trips |
| Stats bar | Totals: adventures, countries, days travelled, locations |
| Search | Command-palette style search (⌘K / Ctrl+K) across all trips and locations |
| Tag filtering | Filter trips by tag (adventure, food, hiking, culture, beach, city, nature) |
| Dark mode | Toggleable; persisted in localStorage |
| Language selector | Spanish (default) and English; persisted in localStorage |
| Export PDF | Downloads a formatted travel journal PDF with cover page, locations, notes, and photos |
| PWA | Installable as a home screen app on Android/Chrome |

---

## 2. Tech Stack

### Backend
| Package | Role |
|---|---|
| Node.js + Express | REST API server |
| TypeScript | Type safety |
| better-sqlite3 | SQLite database (single file, no server needed) |
| multer | File upload handling |
| zod | Validation of every request body |
| dotenv | Environment variable loading |
| vitest + supertest | API tests (`npm test`) |

### Frontend
| Package | Role |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool and dev server |
| Tailwind CSS | Utility-first styling |
| Framer Motion | Animations |
| TanStack Query v5 | Server state management (caching, refetching) |
| Zustand | Client state (dark mode, language) — persisted via localStorage |
| react-router-dom v6 | Client-side routing |
| react-leaflet + Leaflet | Interactive maps |
| react-dropzone | Drag-and-drop file uploads |
| react-calendar | Calendar component |
| date-fns | Date formatting and locale |
| i18next + react-i18next | Internationalisation |
| lucide-react | Icons |
| @react-pdf/renderer | Client-side PDF generation (lazy-loaded ~2 MB chunk) |
| vite-plugin-pwa | PWA manifest and service worker generation |
| axios | HTTP client |

### Infrastructure
| Tool | Role |
|---|---|
| nginx | Serves built frontend; proxies `/api/` and `/uploads/` to backend |
| Docker + Docker Compose | Containerisation |
| GitHub Actions + ghcr.io | Builds and publishes the images (`ghcr.io/srcrowder/travel-tracker-*`) |

---

## 3. Project Structure

```
travel-tracker/
├── docker-compose.yml          # Local build (builds images from source)
├── docker-compose.hub.yml      # Production (pulls pre-built images from ghcr.io)
├── .github/workflows/ghcr.yml  # Builds and publishes both images on every push to main
├── .env.example                # Reference for environment variables
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts            # Express app entry point, startup
│       ├── database/
│       │   ├── db.ts           # SQLite connection (better-sqlite3)
│       │   ├── migrations.ts   # Versioned schema migrations (PRAGMA user_version)
│       │   ├── queries.ts      # Shared queries (trip + locations + photos as JSON)
│       │   ├── index.ts        # initDatabase(): migrate, seed demo data on a new DB
│       │   └── seed.ts         # Seeds example data if DB is empty
│       ├── middleware/
│       │   ├── auth.ts         # Optional login (WEB_USER / WEB_PASSWORD), session cookie
│       │   └── upload.ts       # Multer config (10 MB/file, UUID filenames, image content check)
│       ├── routes/
│       │   ├── trips.ts        # CRUD for trips, cover image upload
│       │   ├── locations.ts    # CRUD for locations within a trip
│       │   └── photos.ts       # Photo upload and delete
│       └── types/
│           └── index.ts        # Shared TypeScript types (Trip, Location, Photo)
│
└── frontend/
    ├── Dockerfile              # Multi-stage: node build → nginx serve
    ├── nginx.conf              # nginx config with API proxy rules
    ├── vite.config.ts          # Vite config: PWA plugin, manualChunks, dev proxy
    ├── index.html              # HTML shell with PWA meta tags
    ├── package.json
    ├── tailwind.config.js
    ├── public/
    │   ├── favicon.svg
    │   └── icons/
    │       └── icon.svg        # PWA app icon
    └── src/
        ├── main.tsx            # React entry, i18n init, QueryClient, Router
        ├── App.tsx             # Route definitions
        ├── index.css           # Global styles, Tailwind directives, custom classes
        ├── api/
        │   └── client.ts       # axios instance + all API calls + getImageUrl()
        ├── components/         # Reusable UI components
        │   ├── Navbar.tsx
        │   ├── AddTripModal.tsx        # Create/edit trip (2-step wizard)
        │   ├── CoverPositionPicker.tsx # Drag-to-reposition cover image
        │   ├── InteractiveMap.tsx      # Leaflet map with route toggle
        │   ├── LocationPanel.tsx       # Side panel: edit location, photos
        │   ├── PhotoGallery.tsx        # Grid gallery with lightbox
        │   ├── PhotoUploadModal.tsx    # Multi-file upload modal
        │   ├── Timeline.tsx            # Day-by-day trip timeline
        │   ├── TripCalendar.tsx        # Calendar highlight view
        │   ├── TripCard.tsx            # Dashboard trip card
        │   ├── TripPdfDocument.tsx     # @react-pdf/renderer PDF layout
        │   ├── FilterBar.tsx
        │   ├── StatsSection.tsx
        │   ├── EmptyState.tsx
        │   ├── DarkModeToggle.tsx
        │   ├── LoadingSpinner.tsx
        │   └── Lightbox.tsx
        ├── hooks/
        │   └── useTripPdfExport.tsx    # Fetches images as base64, renders PDF, downloads
        ├── pages/
        │   ├── Login.tsx       # Login page (only shown when WEB_PASSWORD is set)
        │   ├── Dashboard.tsx   # Home page: trip list, stats, search, filter
        │   └── TripDetail.tsx  # Single trip: map, timeline, photos tabs
        ├── store/
        │   └── useStore.ts     # Zustand store: darkMode + language (localStorage)
        ├── types/
        │   └── index.ts        # Shared TS interfaces: Trip, Location, Photo, etc.
        └── i18n/
            ├── index.ts        # i18next initialisation
            ├── useDateLocale.ts # Returns date-fns locale matching active language
            └── locales/
                ├── en.json     # English translations
                └── es.json     # Spanish translations (default language)
```

---

## 4. Running Locally (Dev Mode)

Best for active development — hot reload on both frontend and backend.

### Prerequisites
- Node.js 22+ (the Docker images use Node 24)
- `ffmpeg` / `ffprobe` on the PATH for video uploads and the video tests
- npm

### Backend

```bash
cd backend
npm ci
npm run dev
# API available at http://localhost:3001
# Health check: http://localhost:3001/health

npm test          # API tests (each test file uses its own temporary database)
npm run typecheck
```

### Frontend (separate terminal)

```bash
cd frontend
npm ci
npm run dev
# App available at http://localhost:5173
```

Vite proxies `/api/` and `/uploads/` to `localhost:3001` automatically (configured in `vite.config.ts`).

> **Note:** The PWA service worker does **not** register in dev mode. That is normal — it only activates in a production build.

---

## 5. Running Locally with Docker

Builds both images from source and starts the full stack. Good for testing production behaviour before pushing to `main`.

```bash
cd travel-tracker
docker compose -f docker-compose.yml up --build
# App available at http://localhost:5173
```

Data is persisted in `./docker-data/`:
```
docker-data/
├── db/       ← SQLite file (travel.db)
└── uploads/  ← Uploaded photos
```

Force a clean rebuild (e.g. after changing `package.json`):
```bash
docker compose -f docker-compose.yml build --no-cache
docker compose -f docker-compose.yml up
```

Stop and remove containers:
```bash
docker compose -f docker-compose.yml down
```

---

## 6. Deploying to a Server (GitHub Container Registry)

### How images are published

Every push to `main` runs `.github/workflows/ghcr.yml`, which builds both images and pushes them to GitHub Container Registry:

- `ghcr.io/srcrowder/travel-tracker-backend`
- `ghcr.io/srcrowder/travel-tracker-frontend`

Tags: `:latest`, `:AAAA.MM.DD` and `:sha-<commit>` on every push to `main`; `:X.Y.Z` and `:X.Y` when you push a `vX.Y.Z` git tag. It can also be started by hand from the **Actions** tab → *Publicar imagen en ghcr.io* → *Run workflow*. There's nothing to build or push from your machine.

### Step 1 — First-time server setup (volumes)

The containers need these host directories to exist before starting:

```bash
mkdir -p /mnt/nvme/apps/travel-tracker/{ddbb,uploads}
chmod -R 777 /mnt/nvme/apps/travel-tracker
```

### Step 2 — Deploy on the server

Copy `docker-compose.hub.yml` to the server (or edit it there), then:

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

### Updating the app

Push to `main`, wait for the workflow to finish (Actions tab), then on the server:

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

### How the containers communicate

```
Browser
  │
  └─► Reverse proxy (NPM / OpenResty) → port 5173 on host
                                              │
                                        travel-tracker-ui  (nginx)
                                              │
                                    /api/*  ──┤──► travel-tracker-api :3001
                                    /uploads/ ┘
```

The frontend container's nginx proxies all `/api/` and `/uploads/` requests to the backend container on the internal Docker network. The browser only ever talks to one host — no hardcoded IP needed.

---

## 7. Environment Variables

### Backend (`backend/.env` or compose environment)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the Express server listens on |
| `NODE_ENV` | `development` | `production` disables verbose errors |
| `CLIENT_URL` | *(empty)* | Only if the frontend is served from **another origin** (CORS). Not needed behind the bundled nginx or the Vite dev proxy |
| `DATA_DIR` / `UPLOADS_DIR` | `backend/data`, `backend/uploads` | Where the database and the uploaded files live (`/app/data`, `/app/uploads` in Docker) |
| `MAX_IMAGE_MB` / `MAX_VIDEO_MB` | `50` / `4096` | Largest photo / video accepted |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe` | Needed for videos (included in the Docker image). Without them video uploads are refused |
| `SEED_DEMO` | `true` | Adds 3 demo trips **only when the database is created**. Set `false` to start empty |
| `WEB_USER` | `admin` | Login username (only used when `WEB_PASSWORD` is set) |
| `WEB_PASSWORD` | *(empty)* | Set it to require a login for the whole app (API and photos). Empty = no login, fine on a private LAN |
| `SESSION_DAYS` | `30` | How long a login lasts |
| `SESSION_SECRET` | *(auto)* | Key that signs session cookies. If unset, a random one is created in `data/session.secret`. Changing `WEB_PASSWORD` logs everyone out |

### Frontend (Vite build-time only)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `` (empty) | Base URL for API calls. **Keep empty** — nginx proxies internally. Only set this if you are NOT using nginx as a proxy (e.g. pointing directly to a remote API server) |

> **Important:** `VITE_API_URL` is baked into the JavaScript bundle at build time, not at runtime. Changing it requires a rebuild. The Dockerfile default is now empty, so `docker build` always produces a relative-URL image that works on any host via nginx proxy.

---

## 8. Database Schema

SQLite file lives at:
- **Dev:** `backend/data/travel.db` (created automatically)
- **Docker local:** `./docker-data/db/travel.db`
- **Server (`docker-compose.hub.yml`):** `/mnt/nvme/apps/travel-tracker/ddbb/travel.db`

### Tables

#### `trips`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `title` | TEXT | Required |
| `description` | TEXT | Optional |
| `start_date` | TEXT | ISO date string `YYYY-MM-DD` |
| `end_date` | TEXT | ISO date string |
| `cover_image` | TEXT | Filename in uploads directory |
| `cover_position_x` | REAL | 0–100, horizontal focal point (default 50) |
| `cover_position_y` | REAL | 0–100, vertical focal point (default 50) |
| `tags` | TEXT | JSON array e.g. `["beach","food"]` |
| `created_at` | TEXT | Auto-set by SQLite |

#### `locations`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `trip_id` | INTEGER FK | Cascade deletes with trip |
| `name` | TEXT | Required |
| `country` | TEXT | Optional |
| `lat` | REAL | Required |
| `lng` | REAL | Required |
| `date_start` | TEXT | Optional |
| `date_end` | TEXT | Optional |
| `description` | TEXT | Public-facing text |
| `notes` | TEXT | Private notes |
| `order_index` | INTEGER | Position in route |
| `rating` | INTEGER | 1–5 or NULL |

#### `photos`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `trip_id` | INTEGER FK | Cascade deletes with trip |
| `location_id` | INTEGER FK | NULL = general trip photo |
| `media_type` | TEXT | `image` or `video` |
| `status` | TEXT | `ready`, or for videos being converted `processing` → `ready` / `failed` |
| `filename` | TEXT | Browser-friendly file: the upload itself, or a JPEG (HEIC/TIFF) / H.264 MP4 (MOV, HEVC…) copy |
| `original_filename` | TEXT | The untouched upload when it differs from `filename` (never modified, metadata included) |
| `thumb_filename` | TEXT | 480 px WebP thumbnail (poster frame for videos) |
| `original_name` | TEXT | Original file name from upload |
| `caption` | TEXT | Optional |
| `taken_at` / `taken_offset` | TEXT | Local date-time it was taken (EXIF / QuickTime tags) and its UTC offset |
| `lat` / `lng` | REAL | GPS position, if the file has one |
| `camera` | TEXT | e.g. `Apple iPhone 15` |
| `width` / `height` / `duration` | | Pixels (after rotation) and seconds (videos) |
| `created_at` | TEXT | Upload time |

#### How uploads are processed

1. The type is detected from the file's **bytes** (never its name or MIME type); anything else is rejected with `400`.
2. Photos: EXIF is read (`exifr`), a thumbnail is made (`sharp`), and HEIC/TIFF get a JPEG copy for the browser (HEIC is decoded with `heic-decode`, since `sharp`'s libvips has no HEVC decoder).
3. Videos: `ffprobe` reads date, GPS and camera (`com.apple.quicktime.*` tags), `ffmpeg` grabs a poster frame. H.264 videos are remuxed to MP4 (no quality loss); anything else (iPhone HEVC, 10-bit HDR…) is re-encoded to H.264 1080p **in the background** — the upload answers at once with `status: processing` and the trip page refreshes until it's ready. Interrupted conversions resume on restart.
4. Photos uploaded before this existed get thumbnails and EXIF data in the background on startup.

### Adding a new column (migrations)

Migrations live in `backend/src/database/migrations.ts`. Each entry runs once, in order, inside a transaction, and `PRAGMA user_version` records how many have run. To change the schema, **append** a new entry (never edit one that has shipped):

```typescript
(db) => {
  db.exec(`ALTER TABLE trips ADD COLUMN my_new_column TEXT DEFAULT ''`);
},
```

Databases created before versioning (user_version 0) are handled by migration 1, which is idempotent.

---

## 9. REST API Reference

Base URL: `http://localhost:3001` (dev) or via nginx proxy `/api/` (production)

When `WEB_PASSWORD` is set, every `/api/*` route (except `/api/auth/*`) and `/uploads/*` returns `401` without a valid session cookie.

### Auth

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/auth/me` | — | `{ authRequired, authenticated }` |
| POST | `/api/auth/login` | `{ username, password }` | Sets the `tt_session` cookie. `401` on wrong credentials, `429` after 10 failures in 15 min from the same IP, or 100 in total from all IPs (blocks new logins only; open sessions keep working) |
| POST | `/api/auth/logout` | — | Clears the session cookie |

### Trips

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/trips` | — | All trips with location summaries |
| GET | `/api/trips/:id` | — | Single trip with full locations + photos |
| POST | `/api/trips` | multipart/form-data | Create trip |
| PUT | `/api/trips/:id` | multipart/form-data | Update trip |
| DELETE | `/api/trips/:id` | — | Delete trip + all photos from disk |

**Form fields for POST/PUT:**
- `title`, `description`, `start_date`, `end_date` (strings)
- `tags` (JSON array of strings e.g. `'["beach","food"]'`; max 20 tags of up to 40 characters, anything else returns `400`)
- `cover_image` (file, optional)
- `cover_position_x`, `cover_position_y` (numbers 0–100, optional)
- `remove_cover` (`'true'` string, PUT only — removes existing cover)

### Locations

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/trips/:tripId/locations` | — | All locations for a trip |
| POST | `/api/trips/:tripId/locations` | JSON | Create location |
| PUT | `/api/trips/:tripId/locations/:id` | JSON | Update location |
| DELETE | `/api/trips/:tripId/locations/:id` | — | Delete location |
| POST | `/api/trips/:tripId/locations/reorder` | `{ order: [{id, order_index}] }` | Reorder locations |

### Photos

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/trips/:tripId/photos` | — | All photos for a trip |
| POST | `/api/trips/:tripId/photos` | multipart/form-data | Upload one or more photos |
| PATCH | `/api/trips/:tripId/photos/:id` | `{ caption }` | Update caption |
| DELETE | `/api/trips/:tripId/photos/:id` | — | Delete photo (removes file from disk) |

**Upload form fields:**
- `photos` (one or more files, up to 50 per request: photos — jpg, png, gif, webp, avif, heic, tiff, max 50 MB — and videos — mov, mp4, webm, max 4 GB. The type is detected from the content and non-media files are rejected with `400`)
- `location_id` (number, optional — omit for general trip photo)
- `caption` (string, optional — applied to all uploaded files)

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ status: "ok", timestamp: "..." }` |

---

## 10. Adding a New Language

1. Add a new locale file at `frontend/src/i18n/locales/xx.json` (copy `en.json` as a template and translate all values).

2. Register it in `frontend/src/i18n/index.ts`:
```typescript
import xx from './locales/xx.json';
// add to the resources object:
resources: { es: { translation: es }, en: { translation: en }, xx: { translation: xx } }
```

3. Add the date-fns locale in `frontend/src/i18n/useDateLocale.ts`:
```typescript
import { xx } from 'date-fns/locale';
// add to the map:
const localeMap: Record<string, Locale> = { es, en, xx };
```

4. Add a selector option in the language selector component in `Navbar.tsx`.

The default language is set in `frontend/src/i18n/index.ts` (`lng: 'es'`). Change it there to make a different language the default.

---

## 11. Adding Features — Key Patterns

### Adding a new field to Trip

1. **DB migration** — append an entry to `backend/src/database/migrations.ts`:
   ```typescript
   (db) => db.exec(`ALTER TABLE trips ADD COLUMN my_field TEXT DEFAULT ''`),
   ```

2. **Validation** — add the field to `tripFields` in `backend/src/validation.ts`.

3. **Backend routes** — `backend/src/routes/trips.ts`: add it to the SQL INSERT/UPDATE, and to `TripRow` in `backend/src/types/index.ts`.

4. **Test** — cover it in `backend/test/api.test.ts`.

5. **Frontend type** — `frontend/src/types/index.ts`: add to the `Trip` interface.

6. **UI** — `frontend/src/components/addTrip/TripInfoStep.tsx` for editing, `frontend/src/pages/TripDetail.tsx` or `frontend/src/components/TripCard.tsx` for display.

7. **Translations** — add keys to both `en.json` and `es.json`.

### Adding a new API route

1. Create `backend/src/routes/myroute.ts` (copy an existing one as template).
2. Register it in `backend/src/index.ts`: `app.use('/api/myroute', myRouter)`.
3. Add the corresponding API calls in `frontend/src/api/client.ts`.

### Adding a new component

Standard pattern:
```typescript
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

export default function MyComponent() {
  const { t } = useTranslation();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <p>{t('mySection.myKey')}</p>
    </motion.div>
  );
}
```

### Fetching data (TanStack Query pattern)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const { data, isLoading } = useQuery({
  queryKey: ['trips'],
  queryFn: () => tripsApi.getAll().then(r => r.data),
});

const qc = useQueryClient();
const mutation = useMutation({
  mutationFn: (id: number) => tripsApi.delete(id),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
});
```

### Cover image display (always use object-position)

When displaying a trip's cover image, always respect the stored focal point:
```tsx
<img
  src={getImageUrl(trip.cover_image)}
  className="w-full h-full object-cover"
  style={{ objectPosition: `${trip.cover_position_x ?? 50}% ${trip.cover_position_y ?? 50}%` }}
/>
```

### Lazy-loading a heavy library

Follow the PDF export pattern in `useTripPdfExport.tsx`:
```typescript
const { myFunction } = await import('heavy-library');
```
Then add it to `manualChunks` in `vite.config.ts` so it gets its own chunk and doesn't bloat the main bundle.

---

## 12. Data Backup & Reset

### Backup

Everything important is in two places:

```
# Database
/mnt/nvme/apps/travel-tracker/ddbb/travel.db

# Uploaded photos
/mnt/nvme/apps/travel-tracker/uploads/
```

To back up, just copy those two locations. The SQLite file is a single portable file.

### Reset everything (wipe all data)

```bash
docker compose -f docker-compose.hub.yml down
rm -rf /mnt/nvme/apps/travel-tracker/ddbb/*
rm -rf /mnt/nvme/apps/travel-tracker/uploads/*
docker compose -f docker-compose.hub.yml up -d
# The app will seed example data on first startup
```

### Reset for local Docker dev

```bash
docker compose -f docker-compose.yml down
rm -rf docker-data/
docker compose -f docker-compose.yml up -d
```

---

## 13. Common Problems & Fixes

### App shows 504 Gateway Timeout

The reverse proxy (NPM/OpenResty) can't reach port 5173. Check container status:
```bash
docker compose -f docker-compose.hub.yml ps
docker compose -f docker-compose.hub.yml logs --tail=50
```
Most likely causes:
- Frontend waiting for backend healthcheck (wait ~30 seconds after first start)
- Volume directories don't exist → create them (see §6)
- Port conflict → `docker compose down` then `up -d`

### App calls localhost:3001 instead of server

The frontend image was built without an empty `VITE_API_URL`. The images published by GitHub Actions always use an empty value; pull the latest one:
```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

### Uploaded images return 404

nginx regex location was matching before the proxy rule. The nginx config uses `^~` prefix to prevent this:
```nginx
location ^~ /uploads/ { proxy_pass http://backend:3001/uploads/; }
```
If you edit `nginx.conf`, always keep `^~` on the `/api/` and `/uploads/` blocks.

### "Failed to save trip" error

Likely a CORS issue. Ensure `CLIENT_URL: "*"` is set in `docker-compose.hub.yml` under the backend environment, or set it to your exact domain.

### PDF export is slow

Normal — it fetches all trip photos as base64 before generating. A trip with many large photos can take 10–30 seconds. The button shows a spinner during the process.

### PWA install prompt not appearing

- Must be served over HTTPS
- Must be a production build (not dev server)
- Chrome requires the site to have been visited before and pass installability criteria
- On iOS Safari: use Share → "Add to Home Screen" manually (iOS doesn't show automatic prompts)

### Service worker is stale / app not updating

The `sw.js` file has `Cache-Control: no-cache` in nginx, so browsers always fetch a fresh service worker. If the app still seems stale, in Chrome DevTools → Application → Service Workers → click "Update" and reload.

### Backend won't start / DB errors

Check backend logs:
```bash
docker logs travel-tracker-api --tail=50
```
If the DB file is corrupted, stop containers, delete `travel.db`, and restart — the app will recreate it with seed data.
