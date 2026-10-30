// Loads the real entry point against stubbed Foundry globals and runs a shop through the GM's side: open it for a
// player, stock it, the player buys over the socket (coins, items, stock, ledger), undo, the secret shelf, leave.
// Catches broken imports, missing exports, hook wiring and the all-or-nothing bookkeeping; it does not replace
// testing in Foundry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hooks = { once: {}, on: {} };
globalThis.Hooks = {
  once: (name, fn) => { hooks.once[name] = fn; },
  on: (name, fn) => { (hooks.on[name] ??= []).push(fn); },
  callAll: () => true
};
class FakeApp { static DEFAULT_OPTIONS = {}; }
let ids = 0;
const rid = () => `id${++ids}`;
globalThis.foundry = {
  applications: { api: { ApplicationV2: FakeApp, DialogV2: class {} } },
  utils: { randomID: rid, deepClone: v => structuredClone(v), escapeHTML: s => s }
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 }, JOURNAL_ENTRY_PAGE_FORMATS: { MARKDOWN: 2 }, DICE_ROLL_MODES: { PRIVATE: "gmroll" } };
globalThis.CONFIG = { TextEditor: { enrichers: [] }, DND5E: { skills: {} } };
globalThis.document = { body: { addEventListener() {} } };

const settings = new Map();
const registered = { settings: [], keys: [], sockets: [] };
let socketHandler = null;
const sent = [];

const gm = { id: "gm", name: "GM", isGM: true, active: true };
const p1 = { id: "p1", name: "Player One", isGM: false, active: true };
const p2 = { id: "p2", name: "Player Two", isGM: false, active: false };
const users = [gm, p1, p2];

/* An actor with an items collection that behaves enough like Foundry's. */
function makeActor(id, name, owner, currency) {
  const list = [];
  const items = {
    find: fn => list.find(fn) ?? null,
    get: id => list.find(i => i.id === id) ?? null,
    filter: fn => list.filter(fn),
    get size() { return list.length; },
    list
  };
  const actor = {
    id, name, type: "character", hasPlayerOwner: true, img: "", items,
    system: { currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0, ...currency } },
    testUserPermission: u => u.id === owner,
    update: async data => { if (data["system.currency"]) actor.system.currency = structuredClone(data["system.currency"]); return actor; },
    createEmbeddedDocuments: async (type, docs) => docs.map(d => {
      const item = { ...structuredClone(d), id: rid(), getFlag: (m, k) => item.flags?.[m]?.[k] };
      item.update = async u => { if ("system.quantity" in u) item.system.quantity = u["system.quantity"]; return item; };
      item.delete = async () => { list.splice(list.indexOf(item), 1); };
      list.push(item);
      return item;
    }),
    deleteEmbeddedDocuments: async (type, idsToGo) => { for (const i of idsToGo) { const at = list.findIndex(x => x.id === i); if (at >= 0) list.splice(at, 1); } }
  };
  return actor;
}
const ilka = makeActor("a1", "Ilka Thorn", "p1", { gp: 23, sp: 4 });
const tobin = makeActor("a2", "Tobin of the Reeds", "p2", { gp: 1 });
p1.character = ilka;
p2.character = tobin;
const actors = [ilka, tobin];

/* World items the GM drags into the shop. */
const worldItem = (id, name, type, sys) => ({
  uuid: `Item.${id}`, documentName: "Item", name, type, img: `${id}.webp`,
  system: { quantity: 1, price: { value: 0, denomination: "gp" }, type: { value: "" }, rarity: "", description: { value: `<p>${name}.</p>` }, ...sys },
  toObject() { return { name: this.name, type: this.type, img: this.img, system: structuredClone(this.system), flags: {} }; }
});
const worldItems = [
  worldItem("shield", "Shield", "equipment", { price: { value: 10, denomination: "gp" }, type: { value: "shield" } }),
  worldItem("arrows", "Arrows", "consumable", { price: { value: 1, denomination: "gp" }, quantity: 20, type: { value: "ammo" } }),
  worldItem("potion", "Potion of Healing", "consumable", { price: { value: 50, denomination: "gp" }, type: { value: "potion" }, rarity: "common" }),
  worldItem("cloak", "Cloak of Elvenkind", "equipment", { rarity: "uncommon", type: { value: "clothing" } })
];
globalThis.fromUuid = async uuid => worldItems.find(i => i.uuid === uuid) ?? null;

globalThis.game = {
  user: gm,
  users: Object.assign([...users], { activeGM: { isSelf: true }, get: id => users.find(u => u.id === id) ?? null }),
  actors: Object.assign([...actors], { get: id => actors.find(a => a.id === id) ?? null }),
  modules: new Map([["planar-store", {}]]),
  settings: {
    register: (mod, key, cfg) => { registered.settings.push(`${mod}.${key}`); settings.set(key, cfg.default); },
    get: (mod, key) => settings.get(key),
    set: async (mod, key, v) => { settings.set(key, structuredClone(v)); return v; }
  },
  keybindings: { register: (mod, key) => registered.keys.push(`${mod}.${key}`) },
  socket: {
    on: (event, fn) => { registered.sockets.push(event); socketHandler = fn; },
    emit: (event, msg) => { sent.push(msg); }
  },
  i18n: { localize: k => k, format: k => k, lang: "en" },
  folders: Object.assign([], { find: () => null })
};
const langFile = code => JSON.parse(readFileSync(new URL(`../lang/${code}.json`, import.meta.url), "utf8"));
const defaultPack = JSON.parse(readFileSync(new URL("../data/default-pack.json", import.meta.url), "utf8"));
globalThis.fetch = async url => ({ json: async () => (String(url).endsWith("lang/en.json") ? langFile("en") : String(url).endsWith("lang/el.json") ? langFile("el") : defaultPack) });
const toasts = [];
globalThis.ui = { notifications: { warn: m => toasts.push(["warn", m]), info: m => toasts.push(["info", m]), error: m => toasts.push(["error", m]) }, controls: { render() {} } };
const journal = [];
globalThis.Folder = { create: async data => ({ id: "f1", ...data }) };
globalThis.JournalEntry = { create: async data => { journal.push(data); return { pages: { contents: [{ uuid: "JournalEntry.j1.JournalEntryPage.p1", update: async () => {} }] } }; } };

await import("../scripts/main.mjs");
const api = () => game.modules.get("planar-store").api;
const SHOP = "sample-general";

/** A player asks over the socket; returns the GM's answer. */
async function playerAsks(from, kind, data) {
  const id = rid();
  await socketHandler({ op: "ask", id, kind, data, from });
  return sent.find(m => m.op === "answer" && m.id === id)?.res;
}
const rowId = name => api().stock(SHOP).find(r => r.name === name)?.id;

test("registers settings, a keybinding and the enricher on init", () => {
  hooks.once.init();
  for (const k of ["state", "live", "ledger", "pack", "session", "pageUuid", "partyPurse", "soundscapes", "volume", "textLanguage", "language", "pageName"]) {
    assert.ok(registered.settings.includes(`planar-store.${k}`), k);
  }
  assert.deepEqual(registered.keys, ["planar-store.open"]);
  assert.equal(CONFIG.TextEditor.enrichers.length, 1);
  assert.ok(CONFIG.TextEditor.enrichers[0].pattern.test("@Shop[Crossroads | all]"));
});

test("exposes an api on ready and listens on the module socket", async () => {
  await hooks.once.ready();
  assert.deepEqual(registered.sockets, ["module.planar-store"]);
  for (const fn of ["console", "open", "close", "preview", "shops", "shop", "stock", "addItems", "restock", "setSecret", "undo", "live", "ledger", "pack", "syncPage", "markdown"]) {
    assert.equal(typeof api()[fn], "function", fn);
  }
  assert.equal(api().shops().length, 1, "the sample shop from the shipped pack");
  assert.equal(api().shop("Crossroads").id, SHOP);
});

test("the GM stocks the shop: shelves, the secret shelf, prices by rarity", async () => {
  await api().addItems(SHOP, worldItems.slice(0, 3));
  await api().addItems(SHOP, [worldItems[3]], { hidden: true });
  await api().addItems(SHOP, [worldItems[0]]);
  const rows = api().stock(SHOP);
  assert.equal(rows.length, 4, "the second shield is +1 on the same row");
  assert.equal(rows.find(r => r.name === "Shield").qty, 2);
  assert.equal(rows.find(r => r.name === "Arrows").bundle, 20);
  const cloak = rows.find(r => r.name === "Cloak of Elvenkind");
  assert.equal(cloak.hidden, true);
  assert.equal(cloak.price, 40000, "uncommon: 400 gp from the DMG table");
  assert.equal(cloak.priceFrom, "rarity");
  assert.match(cloak.desc, /Cloak/);
});

test("open for one player; offline players are named; nobody else is inside", async () => {
  settings.set("session", "S03");
  const users = await api().open(SHOP, ["Ilka"]);
  assert.deepEqual(users, ["p1"]);
  assert.deepEqual(api().live().open[SHOP].users, ["p1"]);
  assert.ok(toasts.some(([, m]) => m.includes("Ilka Thorn")));
  const res = await playerAsks("p2", "buy", { shopId: SHOP, basket: [{ rowId: rowId("Shield"), n: 1 }] });
  assert.equal(res.error, "NotInside", "Tobin was not let in");
});

test("a purchase: items on the sheet, coins with change, stock down, a ledger line", async () => {
  const res = await playerAsks("p1", "buy", { shopId: SHOP, basket: [{ rowId: rowId("Shield"), n: 1 }, { rowId: rowId("Arrows"), n: 1 }] });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.total, 1100);
  assert.deepEqual(ilka.system.currency, { pp: 0, gp: 12, ep: 0, sp: 4, cp: 0 });
  const arrows = ilka.items.list.find(i => i.name === "Arrows");
  assert.equal(arrows.system.quantity, 20, "one bundle of 20");
  assert.equal(arrows.flags["planar-store"].source, "Item.arrows");
  assert.equal(api().stock(SHOP).find(r => r.name === "Shield").qty, 1);
  const e = api().ledger().entries.at(-1);
  assert.equal(e.kind, "buy");
  assert.equal(e.session, "S03");
  assert.equal(e.actorName, "Ilka Thorn");
  // Buying arrows again stacks onto the same item.
  const sold = await playerAsks("p1", "buy", { shopId: SHOP, basket: [{ rowId: rowId("Arrows"), n: 1 }] });
  assert.equal(sold.error, "SoldOut");
  await api().addItems(SHOP, [worldItems[1]]);
  const again = await playerAsks("p1", "buy", { shopId: SHOP, basket: [{ rowId: rowId("Arrows"), n: 1 }] });
  assert.equal(again.ok, true);
  assert.equal(ilka.items.list.filter(i => i.name === "Arrows").length, 1);
  assert.equal(arrows.system.quantity, 40);
  assert.deepEqual(ilka.system.currency, { pp: 0, gp: 11, ep: 0, sp: 4, cp: 0 });
});

test("all or nothing: too poor, sold out, the secret shelf before it's open", async () => {
  const before = structuredClone(ilka.system.currency);
  const items = ilka.items.list.length;
  const poor = await playerAsks("p1", "buy", { shopId: SHOP, basket: [{ rowId: rowId("Potion of Healing"), n: 1 }] });
  assert.equal(poor.error, "TooPoor");
  assert.match(poor.have, /11 gp, 4 sp/);
  const tooMany = await playerAsks("p1", "buy", { shopId: SHOP, basket: [{ rowId: rowId("Shield"), n: 2 }] });
  assert.equal(tooMany.error, "NotEnough");
  const hidden = await playerAsks("p1", "buy", { shopId: SHOP, basket: [{ rowId: rowId("Cloak of Elvenkind"), n: 1 }] });
  assert.equal(hidden.error, "Hidden");
  assert.deepEqual(ilka.system.currency, before);
  assert.equal(ilka.items.list.length, items);
});

test("an item that vanished from the world rolls everything back", async () => {
  const shieldRow = rowId("Shield");
  const before = structuredClone(ilka.system.currency);
  await api().addItems(SHOP, [worldItems[1]]);
  const items = ilka.items.list.length;
  const gone = worldItems.splice(0, 1)[0];
  const res = await playerAsks("p1", "buy", { shopId: SHOP, basket: [{ rowId: rowId("Arrows"), n: 1 }, { rowId: shieldRow, n: 1 }] });
  worldItems.unshift(gone);
  assert.equal(res.error, "ItemGone");
  assert.deepEqual(ilka.system.currency, before);
  assert.equal(ilka.items.list.length, items);
  assert.equal(ilka.items.list.find(i => i.name === "Arrows").system.quantity, 40, "the stacked arrows were taken back off");
  assert.equal(api().stock(SHOP).find(r => r.id === shieldRow).qty, 1);
});

test("undo gives the coins, the items and the stock back", async () => {
  const first = api().ledger().entries.find(e => e.kind === "buy");
  await api().undo(first.id);
  assert.deepEqual(ilka.system.currency, { pp: 0, gp: 22, ep: 0, sp: 4, cp: 0 }, "12 gp back on top of 10 gp 4 sp");
  assert.equal(ilka.items.list.find(i => i.name === "Shield"), undefined);
  assert.equal(ilka.items.list.find(i => i.name === "Arrows").system.quantity, 20);
  assert.equal(api().stock(SHOP).find(r => r.name === "Shield").qty, 2);
  assert.equal(api().ledger().entries.find(e => e.id === first.id).undone, true);
  assert.equal((await api().undo(first.id)).ok, false, "only once");
});

test("the secret shelf: once per visit, the GM can open it by hand", async () => {
  const fail = await playerAsks("p1", "secret", { shopId: SHOP, skill: "per", total: 8 });
  assert.deepEqual([fail.ok, fail.result], [true, "locked"]);
  const again = await playerAsks("p1", "secret", { shopId: SHOP, skill: "itm", total: 30 });
  assert.equal(again.result, "locked", "no second try this visit");
  assert.equal(again.again, true);
  await api().setSecret(SHOP, "a1", "open");
  assert.equal(api().live().open[SHOP].secret.a1, "open");
  const cloak = await playerAsks("p1", "buy", { shopId: SHOP, basket: [{ rowId: rowId("Cloak of Elvenkind"), n: 1 }] });
  assert.equal(cloak.error, "TooPoor", "open now, but 400 gp is a lot");
  const kinds = api().ledger().entries.map(e => e.kind);
  assert.ok(kinds.includes("secret") && kinds.includes("gm"));
});

test("leave: the player walks out and the shop closes behind the last one", async () => {
  const res = await playerAsks("p1", "leave", { shopId: SHOP });
  assert.equal(res.ok, true);
  assert.equal(api().live().open[SHOP], undefined);
  const after = await playerAsks("p1", "buy", { shopId: SHOP, basket: [{ rowId: rowId("Shield"), n: 1 }] });
  assert.equal(after.error, "NotInside", "only the GM opens it again");
});

test("toolbar button for the GM only", () => {
  const g = { tokens: { tools: {} } };
  hooks.on.getSceneControlButtons[0](g);
  assert.ok(g.tokens.tools["planar-store"]);
  game.user = p1;
  const p = { tokens: { tools: {} } };
  hooks.on.getSceneControlButtons[0](p);
  assert.deepEqual(p.tokens.tools, {});
  game.user = gm;
  assert.doesNotThrow(() => hooks.on.getSceneControlButtons[0]({}));
});

test("the ledger page is written a moment after a change", async () => {
  await new Promise(r => setTimeout(r, 2300));
  assert.equal(journal.length, 1);
  assert.match(journal[0].pages[0].text.markdown, /Ilka Thorn/);
  assert.equal(settings.get("pageUuid"), "JournalEntry.j1.JournalEntryPage.p1");
});
