# Streamview

A compact, dark streaming-player template built with HTML, CSS, JavaScript and Shaka Player. No broadcast sources, playback keys, hosting account details or payment destination are included.

## Run

Install Node.js 20 or later. Run `npm start`, then open http://localhost:4173. No package installation or build step is needed. Run `npm test` for the player-state checks.

## Add your own sources

Copy `dist/streams.example.json` to `dist/streams.json`. Set names and URLs for sources you own or have permission to use. Keep the three camera IDs and the channel ID unchanged. The public template opens with empty slots until sources are configured.

The player uses ordinary browser requests through Shaka Player. The media server must permit playback from your site's origin. This template does not include playback keys, an authentication bypass, or a video proxy. Use sources that work without private client-side credentials.

The local source file is ignored by Git. Anything you deploy to a browser is still visible to visitors; Git ignore rules do not protect deployed files.

## Controls

- Three cameras with one large view, or a single camera. Select a preview to bring it forward.
- Sound follows the selected camera. All videos start muted.
- A separate live channel opens on selection. Its on-air status is not verified automatically.
- Go live catches up to the newest available video. Returning to the tab catches up while playback is active; deliberate pauses stay paused.
- Picture in picture and fullscreen depend on browser support.
- Connection details show basic local playback metrics. Copying is an explicit action; the app sends no analytics or diagnostic reports.

The inherited F12 shortcut suppression is a UI behavior, not a security feature. Browser tools and page source remain accessible.

## Donation image

The included `dist/donation-qr.svg` is a non-scannable placeholder. Replace it with your own authorized payment image and update its alternative text when ready.

## Third-party code

Shaka Player 4.14.8 is bundled under Apache 2.0. Its license is retained at `dist/vendor/SHAKA-LICENSE.txt`.
