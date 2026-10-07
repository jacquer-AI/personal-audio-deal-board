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

Live-only limits ranking eligibility. Primary links stay visible in every record. Secondary sources,
including leads and imports with explicit status, expand under Więcej ofert. History is hidden
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

Fresh sessions default to Compact; a saved Comfortable preference is preserved. Secondary
filters, notes and methodology start closed. The desktop E2E budget checks at least 40% less
space before the first result, a toolbar under 140 px, three complete records above the fold,
and a visible primary action. scripts/capture-layout.mjs captures all four acceptance viewports.


## Market refresh architecture
One architecture, two workflows:

- `.github/workflows/refresh-market.yml` operates market data (workflow_dispatch, QUICK every 6 h, FULL daily, DEEP weekly).
  It verifies direct seller pages, merges, validates, and commits `data/market-*.json`, `data/refresh-delta.json`,
  `data/offers.json` and the append-only `data/market-observations.jsonl` only when something materially changed
  (`DELTA=NONE` otherwise: no commit, no deploy). Because GITHUB_TOKEN pushes do not trigger workflows, it dispatches `pages.yml` itself.
- `.github/workflows/pages.yml` builds, tests and deploys the dashboard on every push to main, then reads production back.

Rules: a lead (search result, snippet, aggregator, listing) is never LIVE; LIVE needs a final seller page with exact model,
condition, price and availability. Blocked sites become `ACCESS_RESTRICTED_REVERIFY`. Observations are appended only when
price/result/condition/URL changed. Same-condition market samples: n>=5 ROBUST, 3-4 PROVISIONAL, <=2 INSUFFICIENT.
DEEP challengers live only in `data/market-candidates.json` as UNADJUDICATED. Semantic baseline = committed
`data/sheet-snapshot.json` (SHEETS_SYNC=SNAPSHOT; no live Sheets credential is available to the workflow).
Source adapters: `scripts/sources/`. Canonical research prompt: `prompts/audio-market-refresh.md`.

### One-click refresh from the dashboard
`↻ Odśwież` → QUICK/FULL/DEEP + scope → URUCHOM calls the private ZEN dispatcher through Tailscale.
The dispatcher authenticates the tailnet identity and dispatches `refresh-market.yml`. No GitHub token is entered,
stored or sent by the browser. Session storage contains only the run ID and start time for recovery after reload.
Progress is polled through the dispatcher, with the exact public Actions run as a read-only fallback.
An older delta file never proves DELTA=NONE: the workflow's successful “No material change” step confirms that outcome.
Changed runs wait for their own delta receipt and Pages deployment; an unconfirmed publication is not reported as OK.
New builds offer an explicit reload so an active dialog or comparison is not lost. The manual GitHub link is a fallback.
