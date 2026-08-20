# GitHub Pages deployment

The app is built with Vite. GitHub Pages must publish the `dist` output, not the raw source files.

## GitHub setting

Open the repository and go to:

Settings → Pages → Build and deployment → Source → GitHub Actions

Do not choose "Deploy from a branch".

## Deploy

Push to `main`:

```bash
git add .
git commit -m "Update Routine app"
git push origin main
```

Then open the Actions tab. The `Deploy Routine App` workflow should finish with a green check.

## If an old unstyled page still appears

The previous version registered a service worker. Test the site in an Incognito window first.
If Incognito is correct, clear the old site's stored data/service worker in the normal browser.
