# Gobbler logo

The turkey from the widget's done screen, in the landing page's colours (tomato, oxblood and cream).

- `gobbler-logo.svg` and `.png` (1024px): on cream. For app icons and store listings.
- `gobbler-logo-transparent.svg` and `.png` (1024px): no background, for other colours.
- `gobbler-logo-120.png`: the size Google's OAuth consent screen asks for (Google Auth Platform, Branding, App logo).

The same drawing also makes `workers/mcp/landing/turkey.svg`, `favicon.ico`, `apple-touch-icon.png` and the inline turkey in the landing page's header. Change the turkey in `make.mjs`, then from the repo root:

```sh
node brand/make.mjs && sh brand/render.sh
```

`render.sh` needs macOS, Google Chrome and exiftool. The widget draws its own copy in its theme colours, in `workers/mcp/widget/src/main.ts`.
