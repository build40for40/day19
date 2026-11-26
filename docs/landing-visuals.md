# Gobbler landing visuals

The landing page was designed on main at `ce42faa` and rebased onto the logo update at `ef3b5f1`, keeping the current gratitude copy, real widget screenshots, installation instructions, logo and brand colours.

The original turkey logo, favicons, Gobbler wordmark markup and logo sizing rules are unchanged. The clay illustration is separate decorative artwork, not a replacement logo.

## Generated asset

`workers/mcp/landing/images/gobbler-clay.webp` was generated with the built-in image generation tool, then encoded as a 960 × 960 transparent WebP (118,082 bytes, metadata stripped). The generated original remains outside the repository. No new runtime dependency is needed.

### Final generation prompt

Use case: 3d-stylized. Asset type: transparent landing-page hero illustration for Gobbler, a warm playful gratitude app.
Create one beautifully art-directed handmade clay turkey mascot perched proudly on a small stack of three cream paper envelopes tied with a thin tomato-red ribbon. The turkey has a round cream body, small head on a curved neck, a tiny dark oxblood dot eye, a tomato-red beak and wattle, two small feet, and a glorious fan of exactly five rounded elongated terracotta-red tail feathers. It should feel like a tactile collectible ceramic toy, charming, slightly imperfect, sophisticated editorial claymation rather than generic cartoon. A small raised tomato-red heart seals the front envelope. A single small cream blank note peeks out of the back envelope. No lettering.
Palette tightly limited to tomato #E9573B, deep oxblood #4A1410, warm cream #FFF4E6; muted terracotta variations from physical lighting. Three-quarter view, camera slightly above at eye height of turkey. Soft studio key light from upper left, realistic matte clay grain and folds of thick paper, gentle contact shadows between objects, high-end 3D product render, no shiny plastic. Full object centred with comfortable transparent margin all around, roughly square composition. It will sit on a deep oxblood website background. Isolated transparent background, no floor, no backdrop, no ground shadow outside the object, no lettering, no watermark, no extra objects, no cropped feathers.

## Motion

The clay mascot and paper notes enter once over 1.4 seconds. Fine pointers can tilt the scene up to 5 degrees horizontally and 4 degrees vertically. Touch pointers remain static. Reduced-motion preferences disable the entrance, tilt, hover movement and smooth scrolling.

The image and notes are separate layers using CSS perspective. There is no WebGL canvas or continuously running animation loop. The page stays readable without JavaScript.

## Visual verification

Browser review included desktop at 1440px, tablet at 768px, and phones at 390px and 320px, with no horizontal page overflow. The entrance was paused and visually inspected at 0, 350, 700, 1050 and 1400ms; mobile mid and final frames and both horizontal tilt extremes were also inspected. A local-only review harness lives outside the repository and is not served by the production Worker.

The tablet review found the contact row overlapping the widget screenshot; the product section now stacks below 1001px, and a subsequent browser check confirmed clearance. The smallest phone layout stacks the install buttons. Assets and navigation use relative paths for both the root and `/gobbler/` deployment; both paths were checked in the local preview.

JavaScript syntax, Git whitespace checks, the widget build and Worker/widget typechecks passed. All 29 tests across four test files passed. After rebasing, the latest logo assets were verified unchanged against main, and the mobile browser check confirmed the original 38px turkey logo and 28vw wordmark sizing with no overflow. Native OS reduced-motion emulation was not available in the browser tool; the reduced-motion CSS and event guards were reviewed in source.
