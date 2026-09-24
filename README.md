# Pulse Speed Test

A dependency-free Node.js speed-test site with a responsive HTML/CSS/JavaScript frontend.

## Run locally

```powershell
node server.js
```

Then open `http://localhost:3000`.

## Real measurements

The browser measures elapsed time while it:

- makes five uncached round trips to `GET /api/ping` for ping and jitter;
- reads actual streamed bytes from `GET /api/download` for download Mbps; and
- uploads eight MB of cryptographically randomized bytes to `POST /api/upload` for upload Mbps.

Each test request contains a unique cache-busting value and server responses disable caching. Results therefore measure the real path between the browser and the running server. For an internet-facing result, deploy this server to the geographic edge/server you intend to test against; a localhost run will naturally measure only the local machine's networking path.

## Optional server identity configuration

```powershell
$env:SPEEDTEST_SERVER_NAME = 'Mumbai Edge 01'
$env:SPEEDTEST_SERVER_LOCATION = 'Mumbai, IN'
$env:SPEEDTEST_ISP = 'Example ISP (from trusted edge lookup)'
node server.js
```

The browser cannot safely discover an ISP itself. Feed `SPEEDTEST_ISP` from your reverse proxy or a trusted server-side IP-intelligence service in production.

Recent test results and color-mode selection are stored only in the visitor's browser via LocalStorage. No database is required for this private, per-device history.
