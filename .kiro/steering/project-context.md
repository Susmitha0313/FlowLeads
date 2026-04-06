# Bobi — Project Context

## Overview
Bobi is a LinkedIn profile scraper app. Users paste a LinkedIn profile URL into a React Native (Expo) mobile app, the backend scrapes the profile using Playwright, stores it in MongoDB, and the app can save the contact to the phone or export all profiles to Excel.

## Stack
- Backend: Node.js + Express (ESM), MongoDB via Mongoose, Playwright (Chromium) for scraping
- Client: React Native with Expo (TypeScript), NativeWind (Tailwind CSS), Axios

## Project Structure
```
/
├── backend/
│   └── src/
│       ├── server.js              # Express app entry point, port 3000
│       ├── config/db.js           # Mongoose connection
│       ├── models/Profile.js      # Mongoose schema
│       ├── routes/profileRoutes.js
│       ├── controllers/profileController.js
│       └── services/
│           ├── scraperService.js  # Playwright LinkedIn scraper (singleton)
│           ├── contactService.js  # vCard (VCF) generation
│           └── excelService.js    # ExcelJS workbook export
└── client/
    ├── app/
    │   ├── index.tsx              # Main screen (URL input, extract, results)
    │   └── _layout.tsx
    └── src/
        ├── components/ProfileCard.tsx  # Profile display card
        ├── services/api.ts             # Axios API client
        └── utils/saveFile.ts           # File download/share helper
```

## API Routes (all under /api)
| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /auth/status | Check if LinkedIn session exists |
| POST | /extract | Scrape a LinkedIn profile by URL |
| GET | /profiles | List all saved profiles |
| GET | /profiles/export | Download all profiles as .xlsx |
| GET | /profiles/:id | Get single profile |
| DELETE | /profiles/:id | Delete profile |
| POST | /profiles/:id/refresh | Re-scrape a profile |
| GET | /profiles/:id/contact | Download profile as .vcf |

## Profile Schema (MongoDB)
Fields: `name`, `headline`, `designation`, `company`, `location`, `emails[]`, `phones[]`, `websites[]`, `profileUrl` (unique), `profileImageUrl`, `scrapedAt`, `savedToContacts`, `notes`, `tags[]`

## Key Behaviours
- Scraper is a singleton (`scraperService`) — browser stays alive between requests
- Session is persisted to `backend/src/auth/storage-state.json`; auto-login runs if missing
- `extractProfile` uses upsert (`findOneAndUpdate`) so re-scraping the same URL updates the existing record
- Contact save on iOS uses `Contacts.presentFormAsync` (native form); Android uses `addContactAsync`
- Excel export uses `saveFileFromUrl` → SAF folder picker on Android, share sheet on iOS/fallback
- VCF uses vCard 3.0 with CRLF line endings

## Environment Variables
- `backend/.env`: `PORT`, `MONGO_URL`, `LINKEDIN_EMAIL`, `LINKEDIN_PASSWORD`, `NODE_ENV`
- `client/.env`: `EXPO_PUBLIC_API_URL` (e.g. `http://192.168.0.111:3000/api`)

## Running the App
```bash
# Backend
cd backend && npm run dev

# Client
cd client && npx expo start
```
