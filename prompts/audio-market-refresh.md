# AUDIO MARKET REFRESH

Canonical research rules for the Personal Audio Deal Board.

- Work only on products in config/model-registry.json, except DEEP challenger discovery.
- Poland first, then EU; UK/non-EU only after landed-cost comparison.
- Search pages, snippets and aggregators are LEAD ONLY.
- LIVE VERIFIED / LIVE USED requires the final concrete seller page with exact model, condition, positive fixed asking price and availability. A missing Poland shipping quote MUST NOT block promotion; display the verified product-only price with a visible shipping/fees-unknown warning. Auction starting bids, speculative or negotiable metadata without an established asking price stay research-only.
- Compare NEW with NEW, USED with USED, B-STOCK with B-STOCK, OPEN-BOX with OPEN-BOX.
- Preserve every observation; do not overwrite history.
- n>=5 same-condition observations: robust median/range. n=3-4: provisional. n<=2: INSUFFICIENT MARKET SAMPLE.
- Historical, sold and out-of-stock listings never rank live.
- B4B = QualityWeight × same-condition market / offer price. Never use MSRP as the market benchmark.
- Non-EU stays NON-EU / TLC until landed cost is known; this separate import-risk rule does not apply to EU product-only offers.
- Offer fingerprint = model/revision + condition + seller + canonical direct URL.
- Observation = offer fingerprint + price/currency + condition + timestamp.
- Use config/source-registry.json and respect access restrictions, anti-bot controls and rate limits. Never invent an API.

QUICK: reverify current concrete URLs only.
FULL: QUICK plus new offers for known models. Every discovered URL remains LEAD until final-page verification.
DEEP: FULL plus challenger discovery. Challengers remain unadjudicated and cannot enter live B4B automatically.

Refresh research may write only:
data/market-current.json
data/market-observations.jsonl
data/refresh-delta.json
data/market-candidates.json
data/market-stats.json

Do not edit code, workflows, registries, quality/fit judgments or the Google Sheet. Do not perform transactions or outreach. Do not expose secrets.

Return a compact receipt: mode, timestamp, sources attempted/restricted, current URLs verified/stale/ambiguous, discovered leads, directly verified additions, challenger candidates, price changes, sold/stale deltas and blockers.

## Canonical listener-specific execution notes (2026-10-12)

- This file inherits the audio forensic master on Google Drive (`PROMPT_MASTER_AUDIO_BEST_BUY_LIVE_MARKET_FORENSIC_v1_0_CURRENT`) and the global source-verification master, but **current user preference wins**: the listener owned and liked **Beyerdynamic DT 48 25 Ω**. Sound preferences are fast transients, microdetail, immediate articulated midrange, clean separation and tight controlled bass. Bright treble alone is not a proxy for resolution.
- Current device is **iBasso DX220**; do not reuse the older Drive master statement that it is DX200. Verify the installed AMP module before asserting demanding-headphone voltage headroom.
- The `priority` and `searchTerms` fields in model registry are **user-interest/retrieval controls, not technical sound-fit evidence**. DT48 search strings must explicitly include 25 Ω; no unspecified 48 model or 200 Ω / 250 Ω substitution.
- Separate model suitability, verified seller asking price, listing freshness, shipping-to-Poland uncertainty and total cost. Same-condition sold transaction values must not be conflated with active asking prices.
- A blocked OLX/Allegro search page is evidence of **automation access restriction**, not evidence that the market has no stock. Never bypass marketplace rate limits/captchas. Manual model-specific search links remain available.
- If a buyer-facing listing is featured as the main result, don't repeat that same record under additional offers. No invented quality/fit scores, no simulated shipping rates, no speculative bargains.
- When analyzing new acquisition results, report per source **requests / reachable pages / candidate ads / seller pages checked / directly verified / blocked / stale**, plus unresolved blockers. Compare yield, not raw record count.
