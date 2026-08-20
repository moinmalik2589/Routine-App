# Deploy this app to GitHub Pages

This is a Vite application. GitHub Pages must publish the generated `dist` folder,
not the raw repository source.

## One-time setup

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Push this project to the `main` branch.

The included workflow will automatically run `npm ci`, then `npm run build`,
and deploy the generated `dist/` folder.

To check a deployment:
**GitHub repository → Actions → Deploy Vite app to GitHub Pages**.
