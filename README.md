# Personal Audio — Deal Board

Independent static application for jacquer-AI/personal-audio-deal-board.
Production: https://jacquer-ai.github.io/personal-audio-deal-board/

## Run and verify
Node 22 or newer:
```
npm ci
npm run build
npm run dev
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```
Production browser acceptance:
```
BASE_URL=https://jacquer-ai.github.io/personal-audio-deal-board/ npm run test:e2e
```
In PowerShell set $env:BASE_URL before the last command.

## Data contract
Google Sheets is semantic SSOT:
https://docs.google.com/spreadsheets/d/1LhS3CPng5nrwFE2O-xG46TJJZbmfSs7wpW1xKkQPmTs/edit

data/sheet-snapshot.json records bounded authenticated reads from Rynek PLN, B4B Ranking,
IEM, TWS, Closed Portable, Wireless Speakers, Live Deals, Method on 2026-10-07.
data/offers.json is generated, not the source of truth.

Refresh generated prices with one command:
```
npm run sync -- path/to/refreshed-sheet-snapshot.json
```
The input uses the same tab-keyed {range,majorDimension,values} format as the committed
snapshot. Retrieve the eight named tab ranges through the authenticated Google Drive
connector and replace that input; do not edit generated prices. There is no local Google
API credential available to this app, so it does not silently fetch private Sheets.
The browser needs no credentials. Refreshes require review and a new deploy, not a browser refresh.

Rynek PLN wins over older category/Live Deals/Ranking values. The prototype is reference
only. Same-condition comparisons use the explicitly stored benchmark, never MSRP.
Svanar EUR109 historical conversion uses the stored EUR/PLN4.37111 snapshot.
Fit remains the 1–5 category-tab score; letter fits are not invented.

LIVE/RECENT STORE DUNU is conservatively LEAD ONLY, not LIVE VERIFIED.
Used verified records display LIVE USED, preserving the original verification evidence.
Unknown import landed cost excludes current-buy ranking. Historical records have no B4B.
Additional Live Deals sources are included only when they do not override newer prices.
New supplementary models without a valid current-market benchmark show no B4B.

Live-only limits ranking eligibility. Source rows stay visible under matching models, including
leads and imports with explicit status, so source evidence is not concealed. History is hidden
unless explicitly enabled. MSRP, new market, same-condition market and concrete price are separate.

## Source link checks
```
node scripts/check-links.mjs
npm run build
```
data/link-validation.json records HTTP reachability, not stock/price confirmation.
HTTP404/410 makes the generated source STALE / REVERIFY and removes buy-now eligibility.
403/network restrictions do not establish a dead listing; retain SSOT status and visibly label
its snapshot provenance. Never replace a dead URL with a search result.
Prices and verification are as recorded in Sheets, not real-time marketplace monitoring.

## Deploy and rollback
GitHub Pages is a dedicated Actions deployment for this repository. The workflow runs
typecheck, lint, unit tests, build and Playwright before publishing dist/.
No research or genealogy repositories/resources are dependencies.
Rollback: revert the responsible commit in this repository and redeploy via the same workflow.
Public readback and deployed browser E2E are required before canonical-link cutover.

## Verification limits
The automated 200%/400% reflow check uses equivalent CSS viewport widths.
An additional Chromium CSS zoom check verifies 200% at 1440/1024/390/320; native browser chrome zoom is not available in the in-app browser.
Automated axe is supplemented by keyboard focus/skip-link/dialog and visual inspection.
No backend, auth, trackers, runtime FX service, analytics or commercial hosting dependency.

