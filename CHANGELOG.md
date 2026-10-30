# Changelog

All notable changes to this module. The format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [0.2.0]

- **Fix: the secret shelf's roll dialog opened behind the shop.** The shop screen now keeps itself under any window opened above it (the dnd5e roll dialog, a sheet) and comes back when it closes, so the player can actually make the roll.
- **Fix: a shop closed by the GM, and the secret shelf's result, were never read by the open screen** (a method named `open` hid the getter of the same name).
- **Fix: a ×1.1 price multiplier charged one copper too much** (floating-point rounding).
- **Random events** per shop type and per shop, configured in the JSON pack (`events`, `eventChance`, `eventsMode`): price changes on all or some shelves, a shelf sold out, an easier or harder secret shelf, a banner for the players and a line from the owner. Rolled by chance when a shop opens (world setting *Random shop events*) or triggered from the console's Live tab and the macro API (`event`, `events`, `clearEvent`). The module ships three generic sample events per type.
- **The owner can be a real NPC actor** (`owner.actor` in the pack, or dropped on the console's edit form): the portrait, and the name when the pack gives none, come from the actor's sheet and follow it; players don't need permission on the actor. Right-click the portrait to open the sheet (GM).
- **A tuned shop screen:** a compact header, three columns that scroll on their own (the secret-shelf button, the item detail and the Buy button always stay on screen), clearer prices and stock, a docked item detail instead of an overlay, better fit on laptop-sized windows.

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
