# Required GitHub Pages setting

Your source code is a Vite application. The raw repository cannot be used as
the website.

Open:

GitHub repository -> Settings -> Pages

Under Build and deployment set:

Source: GitHub Actions

Do NOT use:
Deploy from a branch

After changing the setting, push a commit and confirm that the new deployment
comes from the workflow named:

Deploy Routine App

The generated `dist` folder is what GitHub Pages must serve.

If the live site shows every HTML section at once, GitHub is still serving the
raw repository instead of the Vite build.
