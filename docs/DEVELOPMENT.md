# Development

## Layout

```
module.json              manifest (id = planar-store; the id is permanent once published)
scripts/
  main.mjs               hooks: init (settings, keybinding Alt+S, @Shop enricher), ready (pack, dictionaries, socket, api,
                         walk a reloading player back into an open shop), GM toolbar button
  constants.mjs  settings.mjs
  i18n.mjs               t(): the module's own en/el dictionaries (lang/*.json, loaded on ready), so each user can switch language
  util.mjs               pure helpers (no Foundry globals), all unit-tested: text and language, coins (copper, change-making),
                         item categories and prices (DMG value by rarity), stock rows, the basket check, who is inside
                         (open / leave / one shop per player), the secret-shelf result, packs and shop definitions, the ledger
                         and its Markdown page
  state.mjs              serial() (one write at a time), the shops (shipped pack < imported pack < hand-made < the GM's edits),
                         stock, live, ledger, heroes and users, language
  rpc.mjs                the socket: players ask (buy / secret / leave), the active GM answers
  trade.mjs              GM side: open and close shops (+ Soundboard soundscape), buy (all or nothing, rollback), undo,
                         the secret shelf (rolls and by hand), create / edit / delete shops
  stock.mjs              item snapshots, drops (an Item or an Items folder), rows, restock
  shop.mjs               the full-screen shop (plain DOM + CSS): place, owner, shelves, secret shelf, basket; follows the
                         `live` setting; the GM's preview
  console.mjs            GM console (ApplicationV2): Shops, Stock, Live, Ledger
  page.mjs               the "Purchases" journal page (a Planar Codex note when the Codex is active)
  enrich.mjs             @Shop[Name], @Shop[Name | all], @Shop[Name | close] (GM buttons)
data/default-pack.json   the shipped pack: type names and generic lines (en + el), one sample shop, no campaign content
styles/store.css         .planar-store-screen (+ ps-type-*), .planar-store (console), a.pst-button
lang/en.json el.json     interface strings (keys under PLANAR_STORE.*)
tests/                   util (helpers), manifest + languages + content guard, link (main.mjs + stock, open, buy over the
                         socket, refusals, rollback, undo, secret shelf, leave, toolbar, page against stubbed globals), tools
tools/                   stamp-manifest, package, release-api, check-syntax
.github/workflows/       ci.yml, release.yml
```

There is no build step: Foundry loads `scripts/main.mjs` directly.

## How it fits together

- **Who writes.** Only the active GM's client writes, inside `serial()`: the `state`, `live` and `ledger` settings, the heroes' items and coins. Players never write; they `ask()` over the socket and get one answer back (10 s timeout). With no GM online, nothing can be bought.
- **Opening a shop** writes `live.open[shopId] = { visit, since, users, secret }`. Every client hears the setting change; `ShopScreen.sync()` opens the screen for the users listed and closes it for anyone removed. A player in one shop who is sent to another leaves the first. *Leave* asks the GM to remove the user (and the browser remembers it left that visit, so a reload doesn't pull it back in). The shop closes when the last one leaves.
- **A purchase** (`trade.buy`): check the basket against the stock (`checkBasket`: hidden rows need the secret shelf open for that hero this visit), check the coins (`spendCoins`), then copy each item from its UUID onto the sheet (stacking onto the same item unless it's armour or a container; `flags.planar-store.source` marks the copy), pay (the actor's currency, or the Atlas purse through its API), lower the stock, write the ledger. Any failure takes the items back off and changes nothing else.
- **Undo** takes off only what that purchase added (a later purchase stacked onto the same item stays), gives the coins back (the same coins if possible) and the stock.
- **The secret shelf.** The player rolls with `actor.rollSkill` on their own client (private to GM and roller if the pack says so) and sends the total; the GM's client compares it with the DC and writes `open` or `locked` for that hero into `live`. A second ask in the same visit gets the same answer. The GM can set it by hand.
- **Data.**
  - `state = { schema, shops: { id: { stock: [row], edit: {}, custom: def|null, visits } } }`
  - Row: `{ id, uuid, name, img, type, subtype, rarity, category, price (cp), priceFrom, override (cp|null), bundle, qty (null = ∞), restock, hidden, desc }`
  - `live = { schema, open: { shopId: { visit, since, users: [userId], secret: { actorId: "open"|"locked" } } } }`
  - `ledger = { schema, entries: [...] }` (last 500): `buy { lines, total, payer, paid, created: [{id, qty}], stacked: [{id, add}], undone }`, `secret { skill, total, dc, result }`, `gm { result }`.
  - Pack: see the README. A shop definition is the pack's shop, then a hand-made shop's fields, then the GM's edits (`shopDef`).

## Run the checks

```
npm test
```

Syntax check on every `.mjs`, then: the helpers in `util.mjs`, the manifest, language parity and every key used in code, a content guard, a link test of `main.mjs` (settings, api, stock with a rarity price, open for one player, a purchase over the socket with change and stacking, refusals, rollback when an item vanished, undo, the secret shelf, leave, toolbar, the journal page), and the release tools.

These tests do not start Foundry. The shop screen, the console, rolls, sounds, the socket between real clients and drag and drop have to be tried by hand.

## Try it in Foundry

Symlink the repo into your user data and restart the world:

```
ln -s /path/to/repo /path/to/FoundryData/Data/modules/planar-store
```

Reload the browser (F5) after each change. Use a second (and third) browser logged in as players.

### Manual test checklist

**Setup**
- Enable the module: no console errors. The shop icon is in the GM's Tokens toolbar (not the players'); Alt+S opens the console.
- Shops tab: the sample shop. *Import JSON* with a pack: its shops appear; a broken pack lists its problems and changes nothing.
- *New shop*: name + type → it appears and opens for editing. Edit texts, owner, DC, skills; *Save*; re-import the pack: your edits stay. *Back to the pack* drops them.

**Stock**
- Drag an item from the Items sidebar, one from a compendium (a Plutonium import), one from a sheet, and a whole Items folder: rows appear with picture, price and category. Dropping the same item again adds +1.
- A magic item with no price shows the DMG value with a small R; a consumable one is half. An artifact shows "—" until you give it a price.
- Change stock (empty = ∞), restock-to, your own price (`15gp`, `2 χρυσά`); move a row to the secret shelf and back; *Restock* fills rows up to their number.
- A potion in a blacksmith shows ⚠ (it's still sold).

**Opening**
- Pick one hero and *Open*: only that player's screen fills with the shop (fade in, door sound on their machine). The other player sees nothing. Toast for the GM.
- *Everyone*: every online player. An offline player walks in when they log in.
- The eye: the GM's own preview as the first picked hero, with the secret shelf visible; *Buy* says what it would cost and buys nothing.
- A player reloads: they're back in the shop. A player clicks *Leave*: their screen closes, the GM's Live tab drops them, they can't get back in until the GM opens it again (also after a reload).
- *Close* on the Shops or Live tab: every screen closes. A shop with a soundscape switches the Soundboard on opening (setting on).

**Buying**
- Add items with + on a card, from the item's detail (click a card; the description shows), change quantities in the basket. The total and the hero's purse update; the purse turns red when it's not enough.
- *Buy*: items appear on the sheet (arrows stack, armour doesn't), coins drop with change, the stock drops on every open screen at once, the owner says a line, the GM gets a toast and a ledger line.
- Two players both put the last potion in their basket; one buys: it greys out on the other's screen and leaves their basket with a note. Both press *Buy* at the same moment: one gets it, the other is told it's sold out.
- Not enough coin: a clear message with what they have; nothing changes. Party purse (Planar Atlas active, setting on): tick *Pay from the party purse*; the Atlas purse history gets a line.
- Undo in Live or Ledger: items off, coins back, stock back; the line is struck through.

**The secret shelf**
- A shop with secret items shows the lock tab and the button under the owner. A shop without them shows neither.
- *Got anything… special?* → pick a skill → dnd5e's roll dialog → roll. Pass: the tab *Under the counter* opens with its items for that hero only; the others still see the lock. Fail: "Not today."; no second try this visit. The GM sees both in Live (open / lock / forget by hand) and the ledger.
- Close and reopen the shop (a new visit): they can ask again.

**Page and language**
- The "Purchases" page appears (Codex note with Planar Codex, otherwise a GM-only page in "Planar Store") and updates ~2 s after each purchase or roll.
- EN/ΕΛ in the console switches only the GM. A player with Greek sees a Greek shop screen whatever the GM uses.
- `@Shop[Name]` in a journal: GM button opens the console on that shop; `| all` opens it for everyone online; `| close` closes it. Players see only the label.

## Changing things

- **New user-facing text:** add the key to `lang/en.json` and `lang/el.json`. The language test fails if they differ.
- **A new shop type:** add it to `SHOP_TYPES` and `TYPE_CATEGORIES` (util.mjs), `TYPE_ICON` (constants.mjs), the shipped pack (name and lines in both languages) and its `ps-type-<id>` rules in the CSS.
- **Data shape:** add fields freely (the `normalize*` functions set defaults); a change of meaning bumps `STATE_SCHEMA` with a migration.

## Versions

Follow [SemVer](https://semver.org/). Update `CHANGELOG.md` first, then tag. Compatibility lives in `module.json` (`minimum`, `verified`); raise `verified` only after testing on that Foundry build.
