# Bobi — Project Context

## Overview
Bobi is a LinkedIn profile scraper app. Users paste a LinkedIn profile URL into a React Native (Expo) mobile app, the backend scrapes the profile using Playwright (persistent Chromium context), stores it in MongoDB, and the app can save the contact to the phone or export all profiles to Excel.

## Stack
- Backend: Node.js + Express (ESM), MongoDB via Mongoose, Playwright (Chromium) for scraping, ExcelJS for exports, JWT for middleware auth
- Client: React Native with Expo (TypeScript), NativeWind (Tailwind CSS), Axios, Expo Router (file-based routing)

## Project Structure
```
/
├── backend/
│   └── src/
│       ├── server.js                    # Express app entry point, port 3000
│       ├── config/db.js                 # Mongoose connection
│       ├── models/Profile.js            # Mongoose schema (text index on name/company/designation)
│       ├── routes/profileRoutes.js      # All routes registered under /api
│       ├── controllers/
│       │   ├── authController.js        # getAuthStatus, login, logout
│       │   └── profileController.js     # extractProfile, getProfiles, getProfileById,
│       │                                #   updateProfile, deleteProfile, refreshProfile,
│       │                                #   exportProfiles, downloadContact
│       ├── middleware/auth.js           # JWT requireAuth middleware (Bearer token)
│       ├── services/
│       │   ├── scraperService.js        # Playwright scraper — persistent context (user-data/)
│       │   ├── contactService.js        # vCard 3.0 (VCF) generation
│       │   └── excelService.js          # ExcelJS workbook export
│       ├── scripts/
│       │   └── generateSession.js       # One-time manual login script → saves session to user-data/
│       └── user-data/                   # Chromium persistent profile (session lives here)
└── client/
    ├── app/
    │   ├── _layout.tsx                  # Root layout — checks auth on mount, redirects to /login
    │   ├── index.tsx                    # Home screen (URL input, extract, profile result, side drawer)
    │   ├── login.tsx                    # Login screen — triggers Playwright browser on server
    │   └── profiles.tsx                 # Saved profiles list with search, pagination, edit modal
    └── src/
        ├── components/
        │   ├── ProfileCard.tsx          # Profile display card (save contact, export Excel)
        │   └── home/SideDrawer.tsx      # Slide-in drawer (avatar, nav links, logout)
        ├── services/api.ts              # Axios client — auto-redirects to /login on 401
        └── utils/saveFile.ts            # File download/share helper (SAF on Android, share sheet on iOS)
```

## API Routes (all under /api)
| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /auth/status | Check if LinkedIn session is active (via Playwright headless check) |
| POST | /auth/login | Opens Playwright browser on server for manual LinkedIn login |
| POST | /auth/logout | Deletes session and closes browser context |
| POST | /extract | Scrape a LinkedIn profile by URL |
| GET | /profiles | List saved profiles (pagination: `page`, `limit`; full-text `search`) |
| GET | /profiles/export | Download all profiles as .xlsx |
| GET | /profiles/:id | Get single profile |
| PATCH | /profiles/:id | Update profile fields |
| DELETE | /profiles/:id | Delete profile |
| POST | /profiles/:id/refresh | Re-scrape a profile |
| GET | /profiles/:id/contact | Download profile as .vcf |

## Profile Schema (MongoDB)
Fields: `name`, `headline`, `designation`, `company`, `location`, `emails[]`, `phones[]`, `websites[]`, `profileUrl` (unique), `profileImageUrl`, `scrapedAt`, `savedToContacts`, `notes`, `tags[]`  
Text index on: `name`, `company`, `designation`

## Key Behaviours
- Scraper uses a **persistent Chromium context** (`user-data/` directory) — no separate storage-state.json; session survives server restarts automatically
- `hasValidSession()` launches a headless context against `user-data/` and checks for the LinkedIn primary nav to confirm login
- `startLoginSession()` opens a visible browser at `linkedin.com/login` using the same `user-data/` dir; user logs in manually, then closes the browser
- `generateSession.js` is a standalone script for the same purpose with a 5-minute timeout and feed-detection loop
- `extractProfile` uses upsert (`findOneAndUpdate`) so re-scraping the same URL updates the existing record
- `_layout.tsx` is the single auth guard — checks `/auth/status` on mount and redirects to `/login` if inactive
- Axios interceptor in `api.ts` globally handles `401 NO_SESSION` / `SESSION_EXPIRED` by redirecting to `/login`
- Login screen polls `/auth/status` every 3 seconds after triggering the server browser, auto-navigates home when session becomes active
- Contact save on iOS uses `Contacts.presentFormAsync` (native form); Android requests permission then uses `presentFormAsync`
- Excel export and VCF download use `saveFileFromUrl` → SAF folder picker on Android, share sheet on iOS/fallback
- VCF uses vCard 3.0 with CRLF line endings; phone numbers are normalised (digits only, `+` prefix)
- `requireAuth` JWT middleware exists but is **not currently applied** to any routes

## Environment Variables
- `backend/.env`: `PORT`, `MONGO_URL`, `NODE_ENV`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`, `APP_DEEP_LINK_SCHEME`, `APP_WEB_URL`, `JWT_SECRET`
- `client/.env`: `EXPO_PUBLIC_API_URL` (LAN IP for device), `EXPO_PUBLIC_API_URL_WEB` (localhost for web), `EXPO_PUBLIC_LINKEDIN_CLIENT_ID`, `EXPO_PUBLIC_LINKEDIN_REDIRECT_URI`

## Running the App
```bash
# Backend
cd backend && npm run dev

# Client
cd client && npx expo start
```
