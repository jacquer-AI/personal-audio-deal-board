# AUDIO MARKET REFRESH

Canonical research rules for the Personal Audio Deal Board.

- Work only on products in config/model-registry.json, except DEEP challenger discovery.
- Poland first, then EU; UK/non-EU only after landed-cost comparison.
- Search pages, snippets and aggregators are LEAD ONLY.
- LIVE VERIFIED / LIVE USED requires the final concrete seller page with exact model, condition, price and availability.
- Compare NEW with NEW, USED with USED, B-STOCK with B-STOCK, OPEN-BOX with OPEN-BOX.
- Preserve every observation; do not overwrite history.
- n>=5 same-condition observations: robust median/range. n=3-4: provisional. n<=2: INSUFFICIENT MARKET SAMPLE.
- Historical, sold and out-of-stock listings never rank live.
- B4B = QualityWeight × same-condition market / offer price. Never use MSRP as the market benchmark.
- Non-EU stays NON-EU / TLC until landed cost is known.
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
