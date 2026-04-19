# Bobi — LinkedIn Profile Scraper

A mobile app that scrapes LinkedIn profiles and saves contact details to your phone or exports them to Excel.

---

## How it works

1. Log in to LinkedIn once via a browser window opened on the server
2. Paste any LinkedIn profile URL into the app
3. The backend scrapes the profile using Playwright and stores it in MongoDB
4. Save the contact directly to your phone or export all profiles as `.xlsx`

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js + Express (ESM), MongoDB + Mongoose, Playwright (Chromium) |
| Client | React Native + Expo (TypeScript), NativeWind, Expo Router, Axios |
| Exports | ExcelJS (`.xlsx`), vCard 3.0 (`.vcf`) |

---

## Project Structure

```
/
├── backend/
│   └── src/
│       ├── server.js                  # Express entry point (port 3000)
│       ├── config/db.js               # Mongoose connection
│       ├── models/Profile.js          # Profile schema
│       ├── routes/profileRoutes.js    # All routes under /api
│       ├── controllers/
│       │   ├── authController.js
│       │   └── profileController.js
│       ├── middleware/auth.js         # JWT middleware (Bearer token)
│       ├── services/
│       │   ├── scraperService.js      # Playwright scraper
│       │   ├── contactService.js      # VCF generation
│       │   └── excelService.js        # Excel export
│       ├── scripts/
│       │   └── generateSession.js     # One-time manual login script
│       └── user-data/                 # Chromium persistent profile (session)
└── client/
    ├── app/
    │   ├── _layout.tsx                # Auth guard + root layout
    │   ├── index.tsx                  # Home screen
    │   ├── login.tsx                  # Login screen
    │   └── profiles.tsx               # Saved profiles list
    └── src/
        ├── components/
        │   ├── ProfileCard.tsx
        │   └── home/SideDrawer.tsx
        ├── services/api.ts            # Axios client
        └── utils/saveFile.ts          # File download/share helper
```

---

## API Reference

All routes are prefixed with `/api`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/auth/status` | Check if LinkedIn session is active |
| `POST` | `/auth/login` | Open Playwright browser for manual login |
| `POST` | `/auth/logout` | Delete session and close browser |
| `POST` | `/extract` | Scrape a LinkedIn profile by URL |
| `GET` | `/profiles` | List profiles (`page`, `limit`, `search`) |
| `GET` | `/profiles/export` | Download all profiles as `.xlsx` |
| `GET` | `/profiles/:id` | Get a single profile |
| `PATCH` | `/profiles/:id` | Update profile fields |
| `DELETE` | `/profiles/:id` | Delete a profile |
| `POST` | `/profiles/:id/refresh` | Re-scrape a profile |
| `GET` | `/profiles/:id/contact` | Download profile as `.vcf` |

---

## Setup

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Playwright Chromium — installed automatically with `npm install`

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in your values
npm run dev
```

### Client

```bash
cd client
npm install
cp .env.example .env   # set EXPO_PUBLIC_API_URL to your machine's LAN IP
npx expo start
```

---

## Environment Variables

### `backend/.env`

```env
PORT=3000
MONGO_URL=mongodb+srv://<user>:<password>@cluster.mongodb.net/...
NODE_ENV=development
JWT_SECRET=your_jwt_secret
```

### `client/.env`

```env
# LAN IP so physical devices can reach the backend
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000/api

# Used when running in a browser (web)
EXPO_PUBLIC_API_URL_WEB=http://localhost:3000/api
```

---

## LinkedIn Session

Bobi uses a **persistent Chromium profile** (`backend/src/user-data/`) to maintain the LinkedIn session across server restarts. You only need to log in once.

### Option A — via the app (recommended)

1. Start the backend
2. Open the app — you'll land on the login screen
3. Tap **Login with LinkedIn** — a browser window opens on the server
4. Log in manually (including 2FA if prompted)
5. The app polls every 3 seconds and navigates home automatically once the session is detected

### Option B — standalone script

```bash
cd backend
node src/scripts/generateSession.js
```

Opens a visible browser, waits up to 5 minutes for you to log in, then saves the session automatically.

---

## Profile Schema

```
name, headline, designation, company, location
emails[], phones[], websites[]
profileUrl (unique), profileImageUrl
scrapedAt, savedToContacts, notes, tags[]
```

Full-text search index on `name`, `company`, and `designation`.

---

## Features

- Scrape any public LinkedIn profile by URL
- Persistent Chromium session — no repeated logins
- Upsert on re-scrape — same URL updates the existing record
- Save contact to phone (native contacts form on iOS & Android)
- Export all profiles to `.xlsx` with styled headers
- Download individual profiles as `.vcf` (vCard 3.0)
- Full-text search + pagination on saved profiles
- Edit profile fields directly in the app
- Deep link / share sheet support — share a LinkedIn URL directly to Bobi
- Auto-redirect to login on session expiry (401 handling in Axios interceptor)
