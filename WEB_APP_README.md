# Moin Routine — Web/PWA Edition

This edition is designed to run as a responsive web app and installable PWA. Android Studio is not required.

## Run locally
1. `npm install`
2. `npm run dev`

## Production
1. `npm run build`
2. Deploy the `dist` folder to any HTTPS static host (Firebase Hosting, Netlify, Vercel, Cloudflare Pages, etc.).
3. Open the deployed site in Chrome/Edge/Safari and use the browser's **Install / Add to Home Screen** option when available.

Your theme and accent are saved locally. Routine history remains offline-first in IndexedDB unless your existing Firebase account configuration is enabled.
