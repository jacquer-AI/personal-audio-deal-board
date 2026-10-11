# Vinted discovery — Personal Audio Deal Board

Added 2026-10-11.

Vinted Poland is a daily discovery source. The dashboard searches Vinted by the model typed into the main search box, or by each model in the expanded offer panel. All Vinted pages open in a separate browser tab.

This is **external search only**. Vinted listings are not returned as verified price cards: the registry intentionally sets `canVerifyOffer=false`. No undocumented API or login automation is used.

Before a Vinted offer can enter LIVE / B4B, independent direct-offer verification must confirm exact variant, seller, availability, condition and full delivered price including buyer-protection and delivery fees; used electronics additionally require battery-health and authenticity checks. Search snippets alone are LEAD ONLY.

Repository source: `config/source-registry.json`; dashboard helper: `src/lib/vinted.ts`.
