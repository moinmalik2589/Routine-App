# Moin Routine — 3D Web/PWA Upgrade

This build is focused on browser and installable-PWA use. Android Studio is not required.

## Added in this build
- Persistent dark/light mode toggle on the main screen.
- Five persistent accent themes: Emerald, Violet, Ocean, Sunset and Rose.
- New glass/3D visual system with elevated cards, depth, responsive shadows and polished completion states.
- Fixed instant Home statistics: Done Today, Completion, Remaining and the progress ring update immediately when a checkbox changes.
- New bottom navigation: Dashboard, Home, Profile.
- New floating quick-add habit action.
- New “Next Up” focus card that automatically identifies the next incomplete habit.
- Perfect-day completion celebration.
- PWA install UI in User Profile.
- 192px and 512px install icons and updated service-worker cache.
- Improved mobile, tablet and desktop layouts.
- Existing analytics, heatmap, habit ranking, monthly progress, activity progress, scheduling, backups, prayer calculations and account flow remain available.

## Run
`npm install`
`npm run dev`

## Production
`npm run build`
Deploy `dist/` to an HTTPS host. The site can then be installed from a supported browser using Install / Add to Home Screen.
