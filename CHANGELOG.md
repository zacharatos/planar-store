# Changelog

All notable changes to this module. The format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [0.1.0]

First release.

- **Shops that take over the players' screens**, opened by the GM for the players he picks (or everyone online). Players close a shop with *Leave*; only the GM opens it again. A reload while a shop is open walks the player back in.
- **Three shop types with their own looks:** General Goods, Blacksmith, Alchemist.
- **The place and its owner:** picture, name, flair line, description; portrait, role, a few lines, and things the owner says (on entering, a return visit, a purchase, too poor, sold out, the secret shelf).
- **Stock with real quantities** (or unlimited), restock-to numbers, live on every screen; purchases are handled one at a time by the GM's client.
- **Stock from anywhere:** Items sidebar, compendiums (Plutonium imports included), sheets, whole Items folders.
- **Prices:** the item's own; DMG 2024 value by rarity for unpriced magic items; per-item price; per-shop multiplier.
- **The secret shelf:** Persuasion, Intimidation or Deception against the shop's DC, once per visit per hero; GM open/lock by hand.
- **Basket, all or nothing,** with change made in gold, silver and copper; optional payment from the Planar Atlas party purse.
- **Undo** for any purchase (items, coins, stock).
- **Ledger page** «Purchases» (a Planar Codex note when the Codex is active); `@Shop[…]` journal buttons; a JSON pack for shop texts and owners; a macro API; English and Greek per user.
