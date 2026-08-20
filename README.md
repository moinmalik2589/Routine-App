# Moin Routine

A personal routine and habit tracker built as a responsive web app/PWA.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The production files are generated in `dist/`.

## Firebase Analytics

Firebase Analytics support lives in `src/firebase.js`.

Paste the Web App configuration from Firebase Console into the
`firebaseConfig` object. Do not add service-account credentials or private keys
to this client-side project.

## GitHub Pages

Deployment is handled by `.github/workflows/deploy-pages.yml`.

In the repository settings, set:

**Settings → Pages → Source → GitHub Actions**

The workflow builds the Vite project and publishes `dist/`. Do not deploy the
raw source directory as a Pages website.

## Project structure

- `index.html` — application shell
- `src/main.js` — app behaviour and UI logic
- `src/styles.css` — responsive styling and themes
- `src/firebase.js` — Firebase Analytics setup
- `public/` — manifest, icons and service worker
