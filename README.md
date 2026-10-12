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


## Verification of discovery breadth and UI status (2026-10-08)

The high-contrast, compact layout preserves accessible mobile hit targets. A blocked or ambiguous
HTTP request no longer advances the last confirmed offer check date. The refresh dialog exposes
counts of verified final seller pages and blocked sources from the last persisted run.

FULL/DEEP discovery plans distribute a bounded query budget over models **and** source adapters
instead of truncating at the first models. `plannedSources` means a source was queried, while
`reachableSources` means at least one discovery URL returned an accessible 2xx/3xx response.
Neither implies a new verified offer. Promotion remains subject to direct-page verification.

As of the last pre-change FULL on 2026-10-08, 2/20 direct URLs were verified and 11 blocked
automated access. The registry lists 31 sources, of which 23 offer discovery URLs; this is
configuration breadth, not 31 confirmed/live marketplace integrations.

## Market breadth repair (2026-10-11)

- **32 model families** are searched in the model registry (including IEM, TWS, Closed, Open and Bluetooth speakers). The 16 newly added headphone families have `quality: UNRATED` and `fit: null`; no performance claims, price benchmark, or B4B are invented.
- The dashboard defaults to the **complete saved non-historical offer set** rather than the small LIVE subset. The previous browser preference is migrated safely to the new `audio-board-v2` key. The LIVE switch remains available and strict.
- Visible counts distinguish `LIVE` offers (same direct seller verification and freshness requirements) from historical / stale / unverified **saved** offers.
- Five direct external searches (Vinted PL, OLX, Allegro, eBay DE, Kleinanzeigen) are links, **not evidence of individual listings**. Unscored research models are clearly segregated.
- `data/market-candidates.json` is rendered as research only. The scan may retain model-matched direct marketplace URLs in `UNVERIFIED LEAD` state when a source blocks automation or lacks structured price/stock. It never promotes such URLs to LIVE.
- A direct-page check that proves exact model, condition, explicit fixed asking price and availability may become LIVE even when shipping-to-Poland cost is unknown. LIVE prices are **item-only**, not landed/checkout totals. Explicit non-fixed bids/auctions stay research-only, as do unverified URLs and non-EU offers without import-cost verification.
- FULL/DEEP plans now target up to 240/320 model-source queries respectively. Coverage counts depend on accessible sites; anti-bot HTTP 403, no structured listing, or an inaccessible marketplace can still prevent live inventory ingestion.
- Updates to the model registry and market search require both unit and browser tests. A successful CI run proves the app builds and its static behavior, **not that a scheduled deep scan or production publication happened**.

## Condition labels and canonical search scope (2026-10-11)

- The headline price has an adjacent **Polish item-condition label** (NOWE, UŻYWANE,
  PO ZWROCIE / EKSPOZYCJI, OTWARTE OPAKOWANIE). LIVE/verified freshness is a
  **separate** status. An unknown research-lead condition is explicitly
  STAN NIEUSTALONY, never silently treated as NEW.
- All primary, secondary and research rows show condition independently from
  availability verification. The status is never proof of mechanical/electrical
  functionality; seller statements and direct-page price checks cannot test hardware.
- `config/model-registry.json` is the **single canonical list: 48 enabled model
  families**, up from 32. The browser watchlist now derives from it instead of a
  parallel hard-coded list. Sixteen additions concentrate on neutral/detail-oriented
  open headphones and wired IEMs (including ER4SR, HD 800 S, DT 1990 PRO, K702,
  Studio4 and MEST MkII). These are **search targets, not verified stock**.
- No invented quality grades, user-fit scores, same-condition market benchmarks,
  product prices, or simulated inventory were added.
- The 240-job FULL scan covers three stable marketplaces (Allegro, OLX, Vinted)
  and two **daily rotating** sources drawn from Subito, Kleinanzeigen,
  Marktplaats, Media Expert Outlet, eBay DE. With 48 families, that covers the
  five selected sources across all models (subject to per-run network deadline).
  DEEP still has 320 jobs and explores additional sources. All rotation is
  deterministic by UTC date and testable.
- Registries contain more providers than live integrations. Configuration coverage
  and search links are not proof of access, parsability, stock or current prices.

## European-only buying scope / HiFiShark asking-price evidence (2026-10-11)

- **Geographic scope is EUROPE, not EU:** Poland, EU, UK, Switzerland,
  Norway and other supported European marketplaces; never imply that an eBay
  listing is European just because the browsing domain ends in .de or .pl.
  Unknown seller origin does not qualify as confirmed European stock.
- HiFiShark is a **mandatory discovery source** in FULL (daily) and DEEP
  (weekly). Every enabled model gets a query before lower-priority sources
  consume the bounded job budget. A fifth direct source rotates across EU.
- HiFiShark indexes seller asking prices. A price extracted from the **same
  item's table row**, with a European-local marketplace identity, appears in
  a separate **CENY Z HIFISHARK** section. It is an indicative **indexed
  asking price**, NOT a seller-confirmed current asking price, buy-now
  price, stock confirmation or finalized shipping total. Currency and the
  aggregator-listed date are preserved; PLN conversion is optional.
- The refresh tries the aggregator `/goto/` link and inspects the destination
  seller page if accessible. Redirect failure or HTTP 403 retains the indexed
  price as **AGGREGATOR_PRICE_ONLY**, with a visible failure reason. Valid
  direct seller prices may be displayed separately even without confirmed
  stock, but LIVE still needs seller-page model, condition, price and
  availability evidence. Failed/unverified links never enter LIVE/B4B.
- A marketplace's localized identity indicates the market's country, **not
  verified physical seller location**. The UI discloses this uncertainty;
  global platforms without item-location evidence are excluded from
  European-only discovery. 14-day research lead retention remains.
- Historical globally sourced candidates with no geographic evidence are
  removed from the visible Europe-only research list, not rewritten to
  imply they were European. The underlying research ledger remains auditable.

## Canonical listening preference — DT 48 / speed and microdetail (2026-10-12)

The listener **owned and liked Beyerdynamic DT 48 at 25 ohms**. The exact DT 48 suffix (E/S/etc.) was **not confirmed**; do not assume it. This is a **primary subjective sound reference**, not a measured preference curve.

- **Primary priorities:** very fast, well-controlled transients/attack; fine microdetail; precise instrument separation; immediate, articulate, prominent midrange and realistic vocal articulation; low masking/overhang; taut rather than boosted bass.
- **Secondary preferences:** clarity and treble openness, but **bright treble alone must not be treated as evidence of real resolution**. Analytical presentation can derive from midrange definition rather than elevated top octave. An intimate soundstage is acceptable.
- **Generally avoid:** warm, soft, slow, dark, diffuse, overly bass-heavy sound when it sacrifices midrange articulation or attack.
- **Existing reference points:** Etymotic ER4P/S, Sony MDR-SA5000 and Beyerdynamic DT 880; the listener has Thieaudio Monarch MkII and uses iBasso DX220. DT 880 is a **distinct** tonal/spatial presentation, not a replacement for DT 48.
- **Shopping rule:** seek exceptional used value, with confirmed model/impedance/condition/price, explicit seller verification and transparent shipping/VAT/currency uncertainty. Do not equate an indexed asking price with an available offer.

Eight new **discovery targets** added to the canonical `config/model-registry.json` (56 enabled families total):
`Beyerdynamic DT 48 25 Ohm` (priority direct re-acquisition),
`Sony MDR-CD900ST` (intimate, articulate studio midrange),
`Sony MDR-M1` (modern closed monitor),
`Austrian Audio Hi-X65` (open, fast and revealing),
`Austrian Audio Hi-X60` (closed monitor alternative),
`Neumann NDH 30` (neutral, high midrange detail but smoother/full-range),
`Audio-Technica ATH-M70x` (critical closed monitoring),
`Focal Clear OG` (fast dynamic alternative, fuller than DT 48).

These are **candidate hypotheses, not claims of identical sound** and not current live listings. They retain `quality: UNRATED`, `fit: null`, no fictional prices or comparables. ER4SR, HD 800 S, ATH-ADX5000, DT 1990 Pro and other detail-oriented families are already on the list.

To preserve daily source coverage with 56 models, FULL default discovery budget is **280** jobs (56 × HiFiShark, Allegro, OLX, Vinted and one rotating European source); DEEP is **360** jobs. The source-provider cap, page verification and Europe-only constraints remain unchanged.

## Yield-first discovery and listener-specific searches (2026-10-12)

The daily FULL search remains **56 enabled model families × five source queries = 280 discovery requests**.
The previous core policy allocated 56 requests every day to each of OLX and Allegro, although the last
saved FULL receipt showed **0/48 reachable search pages** for both sources (automation access
restrictions, not proof of unavailable market listings). Marktplaats returned 23 directly verified
listing URLs in that receipt; HiFiShark yielded 205 priced indexed leads without a working
seller redirect. This is an **observed sample**, not a promise about future reachability.

The updated core is **HiFiShark (index only), Vinted PL (leads), Marktplaats, Subito**
plus one rotating exploratory slot: **Allegro, OLX, Kleinanzeigen, Media Expert Outlet,
eBay DE**. OLX and Allegro remain one-click manual searches and receive periodic automated
rechecks; never bypass marketplace access controls. The fixed baseline is a transparent
interim policy, not an adaptive algorithm trained on unverified outcomes.

For rare models, the canonical model registry now supports optional `searchTerms`.
Each provider/day deterministically selects a different exact synonym; DT 48's variants
all retain the explicit **25 Ω** specification. Aliases used for item-title verification
are separate from search query variants. **No generic DT 48 without impedance**
is promoted as a confirmed DT 48 25 Ω listing.

The canonical watchlist now sorts by **user search priority**, not a fabricated audio
quality score: DT 48 25 Ω first, followed by owned/listened references, then
comparative studio monitor hypotheses. Priority does not change the existing `quality`
and `fit` evidence requirements. Manual search links for HiFiShark, Vinted,
Subito and Marktplaats appear even when no verified offer is stored.

The expanded offer section counts **only additional seller advertisements**, excluding
the price/link already featured as the main item (e.g. DT 880: 2 additional ads,
not 3). The complete notes ledger still includes source provenance.

Validation: unit, typecheck, lint, build, Playwright, clean GitHub CI and public Pages
readback are required before claiming the changed UI is deployed. A successful build
does **not** imply fresh offers were fetched in a new market scan.
