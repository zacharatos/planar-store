# Planar Store

Shops the players walk into, for **Foundry VTT v14** and **dnd5e 6**. You open a shop full screen on the screens of the players you choose: the place, the owner, shelves with limited stock, a secret shelf behind a Charisma check, and a basket. *Buy* moves the item onto the hero's sheet, takes the coins (with change) and lowers the stock on every screen at once.

Shopping by "tell me what you want and I'll drag it onto your sheet" is slow, invisible to the others and has no limit on stock. This makes a shop a place, with someone behind the counter.

## Features

- **A full-screen shop** for the players you pick (or everyone online). Only you open a shop; a player closes it with *Leave*. A player who reloads while the shop is open for them walks straight back in.
- **Three shop types, each with its own look:** General Goods (oak and lantern light, price tags), Blacksmith (iron, a forge breathing at the bottom of the screen, riveted plates), Alchemist (smoked glass, drifting vapour, apothecary labels).
- **The place and the owner:** a picture, the shop's name, a flair line, a read-aloud description; the owner's portrait, name, role and a few lines about them, and things they say when you walk in, buy, can't afford something, find it sold out, or ask about the secret shelf.
- **Real stock.** Every item has a quantity (or ∞). Three potions means three potions: when one hero buys the last one, it greys out on everyone's screen at once. Purchases go through the GM's client one at a time, so two players can't both get the last one. *Restock* fills shelves back up to a number you set.
- **Stock from anywhere:** drag items in from the Items sidebar, any compendium (Plutonium imports too), a character sheet, or a whole Items folder.
- **Prices:** the item's own price; for a magic item with no price, the DMG 2024 value by rarity (consumables other than spell scrolls at half); your own price per item; a price multiplier per shop.
- **The secret shelf:** items under the counter. A hero asks (*"Got anything… special?"*), picks Persuasion, Intimidation or Deception, rolls with dnd5e's own roll (inspiration, Guidance and the like work), and beats the shop's DC to see it. Once per visit per hero; a failure locks it until next time. You can open or lock it for anyone by hand.
- **A basket** with a running total against the hero's purse; buying is all or nothing. Coins are paid like a shopkeeper would, with change in gold, silver and copper. With Planar Atlas, heroes can pay from the party's common purse.
- **Random events**, by shop type: when a shop opens (by the chance in your pack) or when you trigger one, something happens for the visit: a sale, a shortage, a fresh delivery. The players see a headline and the owner says a line; the effects (a price change on all or some shelves, a shelf sold out, an easier or harder secret shelf) last until the shop closes. The stock itself is never touched.
- **The owner can be a real NPC actor.** Link an actor to a shop's owner and the portrait (and the name, if you give none) come from its sheet, so the same actor can be used elsewhere with its token and sheet. Players see it even when they have no permission on that actor.
- **Undo** any purchase: the items come off the sheet, the coins and the stock go back.
- **A journal page** of every purchase and secret-shelf roll, with session labels (a Planar Codex note when the Codex is active), for your session log.
- **Journal buttons** for prep notes: `@Shop[Name]`, `@Shop[Name | all]`, `@Shop[Name | close]`.
- **A JSON pack** for your campaign's shops: names, places, descriptions, owners, lines, DCs, sounds. The stock is set in Foundry and is never touched by a pack import.
- **English or Greek, per user.** The EN/ΕΛ button switches the module for you alone.

The module ships no publisher content: no setting text, art or audio. The sample pack has one generic shop; the default sound is Foundry's own notification sound.

## Install

In Foundry: **Add-on Modules → Install Module**, paste this manifest URL and press Install:

```
https://github.com/zacharatos/planar-store/releases/latest/download/module.json
```

Enable **Planar Store** in your world (Game Settings → Manage Modules).

## Use

1. **Open the console** from the shop icon in the Tokens toolbar, or press **Alt+S**. Set the session label at the top ("S03").
2. **Shops.** Your pack's shops (or the sample). *Import JSON* loads a pack; *New shop* makes one by hand. The pencil edits a shop's texts, owner (and the NPC actor behind it: drop one on the box or type its name), secret shelf DC and skills, price multiplier and sounds; your edits stay over the pack.
3. **Stock.** Pick a shop, drag items onto *Shelves* or *Secret shelf*. Per item: stock (empty = ∞), *restock to*, your own price (`15gp`, `5 sp`), move to the other shelf, read the item again, remove. ⚠ marks an item that's unusual for the shop type (it can still be sold).
4. **Open it.** On the Shops tab, click heroes (a green dot means online), then *Open* on a shop, or *Everyone*. The eye previews the screen as a hero sees it (nothing is bought).
5. **Live.** Who is inside, their coins, the secret shelf per hero (open, lock, forget), send someone out, this visit's purchases with *Undo*. *Close* closes the shop for everyone. Each open shop has an **Event** box: *Random event*, or pick one and *Trigger*, or *End the event*; the GM-only note of the running event is shown there.
6. **Ledger.** Every purchase and roll; the book icon opens the journal page.

Players can't open a shop themselves. They buy, ask about the secret shelf, and *Leave*.

### Journal buttons

In any journal (GM only; players see the label as text):

```
@Shop[The Crossroads Store]                 the console, on that shop
@Shop[The Crossroads Store | all]{Go in}    open it for every player online
@Shop[The Crossroads Store | close]         close it
```

### The pack

```json
{
  "planarStorePack": 1,
  "id": "my-campaign",
  "name": "My campaign's shops",
  "types": { "blacksmith": { "name": { "en": "Smithy", "el": "Σιδεράδικο" }, "sound": "path/to/anvil.ogg" } },
  "shops": [{
    "id": "the-forge", "type": "blacksmith",
    "name": { "en": "The Forge", "el": "Το Καμίνι" }, "nameEn": "The Forge",
    "place": "Old Town", "img": "path/to/forge.webp",
    "flair": "“Steel that outlives you.”", "description": "Read-aloud text. A blank line starts a new paragraph.",
    "owner": { "name": "Bram", "img": "path/to/bram.webp", "role": "Smith", "about": "What the players see.", "gmNotes": "Only you." },
    "barks": { "enter": ["…"], "again": ["…"], "buy": ["…"], "poor": ["…"], "soldOut": ["…"], "secretYes": ["…"], "secretNo": ["…"] },
    "secret": { "skills": ["per", "itm", "dec"], "dc": 15, "label": "Anything else?", "whisperRoll": true },
    "priceMultiplier": 1, "soundscape": "Old Town", "sound": "path/to/bell.ogg"
  }]
}
```

Types are `general`, `blacksmith` and `alchemist`. Any text can be a string or `{ "en": …, "el": … }`. Skills are dnd5e skill ids. `soundscape` is a Planar Soundboard soundscape switched on when the shop opens (a setting).

#### The owner as an actor

`"owner": { "actor": "Bram the Smith" }` links the owner to an actor in the world: a name (accents and case ignored) or a UUID (`Actor.xxxx`, or a compendium one). The actor's portrait is shown in the shop, and its name too when `owner.name` is empty; the role, about and lines still come from the pack. The GM's client keeps a copy of the actor's name and portrait, so players need no permission on the actor, and the shop follows the sheet when it is renamed or gets a new picture. A link by name keeps working after a rename (the UUID is remembered); dropping an actor on the owner box in the console stores its UUID. Right-click the portrait on your own screen to open the sheet. A blank (mystery-man) portrait falls back to `owner.img`.

#### Random events

Events are listed per shop type (`types.<type>.events`) and per shop (`shops[].events`); a shop can roll its type's events and its own. A shop event with the same `id` as the type's replaces it, and `"eventsMode": "replace"` ignores the type's list. When a pack lists events for a type, it replaces the shipped sample events for that type.

```json
"types": { "blacksmith": {
  "eventChance": 0.25,
  "events": [{
    "id": "big-order", "weight": 2, "icon": "fa-truck",
    "title": { "en": "A big order", "el": "Μεγάλη παραγγελία" },
    "text": "What the players read in the banner.",
    "bark": ["A line the owner says.", "Another one."],
    "gm": "Only you see this in the Live tab and as a toast.",
    "fx": { "priceFactor": 1.1, "categoryFactors": { "weapons": 0.8 }, "outOf": ["ammunition"], "secretDcDelta": -2 }
  }]
}}
```

- `eventChance` (on a type or a shop; a number from 0 to 1, or a percentage) is the chance that one starts when the shop opens. Without it nothing happens by itself; you can still trigger events by hand. The world setting *Random shop events* turns the automatic rolls off.
- `weight` (default 1) makes an event likelier. A roll never repeats the event that ran last, if there is another.
- `fx` is optional (an event can be pure flavour). `priceFactor` multiplies every price; `categoryFactors` multiplies one shelf (`weapons`, `armor`, `shields`, `ammunition`, `potions`, `poisons`, `scrolls`, `consumables`, `tools`, `gear`, `food`, `other`); `outOf` shows those shelves as sold out; `secretDcDelta` changes the secret shelf's DC (−10 to +10). Factors are kept between 0.1 and 5.
- The event lasts until the shop closes or you end it. The ledger and the journal page note it.

## Settings

- **Party purse:** with Planar Atlas, offer to pay from the common purse.
- **Shop soundscapes:** switch Planar Soundboard when a shop with a soundscape opens.
- **Shop sound volume:** door-bell and coins, on each player's machine.
- **Language (world default)** and **Language (yours)**.
- **Random shop events:** let the pack's `eventChance` start an event when a shop opens (on by default).
- **Ledger page name.**

## Macro API

```js
const store = game.modules.get("planar-store").api;
store.open("The Forge", ["Ilka", "Tobin"]);   // or "all"
store.close("The Forge");                      // or store.close("The Forge", ["Ilka"])
store.preview("The Forge", actorId);
store.addItems("The Forge", [item1, item2], { hidden: true });
store.restock("The Forge");
store.setSecret("The Forge", actorId, "open");  // "locked", or null to forget
store.event("The Forge");                     // a random event of that shop (it must be open)
store.event("The Forge", "big-order");        // or one by id; store.events("The Forge") lists them
store.clearEvent("The Forge");
store.shops(); store.stock("The Forge"); store.live(); store.ledger(); store.undo(entryId);
store.console({ tab: "stock", shopId: "the-forge" });
```

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) (layout, checks, manual test list) and [docs/PUBLISHING.md](docs/PUBLISHING.md).

## License

MIT. See [LICENSE](LICENSE).
