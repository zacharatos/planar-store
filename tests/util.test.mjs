import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as u from "../scripts/util.mjs";

const shipped = JSON.parse(readFileSync(new URL("../data/default-pack.json", import.meta.url), "utf8"));
const row = (id, extra = {}) => u.normalizeRow({ id, uuid: `Item.${id}`, name: id, price: 100, qty: 3, bundle: 1, category: "gear", ...extra });

test("text and language helpers", () => {
  assert.equal(u.fold("  Το  Οπλοστάσιο "), "το οπλοστασιο");
  assert.equal(u.slug("The Armory!"), "the-armory");
  assert.equal(u.slug("Το Μαγαζί"), "το-μαγαζι");
  assert.equal(u.slug("!!!"), "shop");
  assert.equal(u.escapeHTML(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(u.textToHTML("One *two*\nthree\n\n**Four** <b>"), "<p>One <em>two</em><br>three</p><p><strong>Four</strong> &lt;b&gt;</p>");
  assert.equal(u.textToHTML("<p>kept</p>"), "<p>kept</p>");
  assert.equal(u.htmlToPlain("<p>a&amp;b</p><p>c</p>"), "a&b c");
  assert.equal(u.pickLanguage("world", "auto", "el"), "el");
  assert.equal(u.localText({ en: "Smith", el: "Σιδεράς" }, "el"), "Σιδεράς");
  assert.equal(u.localText("plain", "el"), "plain");
  assert.equal(u.lookup({ A: { B: "x" } }, "A.B"), "x");
  assert.equal(u.fill("{a} and {b}", { a: 1 }), "1 and {b}");
  assert.equal(u.pickLine(["a", "b", "c"], 0.99), "c");
  assert.equal(u.pickLine([], 0.5), "");
  assert.equal(u.pickLine(["", "  ", "x"], 0), "x");
});

test("trimHTML keeps whole paragraphs", () => {
  const long = Array.from({ length: 40 }, (_, i) => `<p>Paragraph number ${i} with some words.</p>`).join("");
  const out = u.trimHTML(long, 300);
  assert.ok(out.length < 330);
  assert.ok(out.endsWith("</p><p>…</p>"));
  assert.equal(u.trimHTML("<p>short</p>", 300), "<p>short</p>");
});

test("coins: values, text, prices", () => {
  assert.equal(u.coinValue({ pp: 1, gp: 2, ep: 1, sp: 3, cp: 4 }), 1000 + 200 + 50 + 30 + 4);
  assert.deepEqual(u.toCoins(1150), { pp: 0, gp: 11, ep: 0, sp: 5, cp: 0 });
  assert.equal(u.priceText(1150), "11 gp 5 sp");
  assert.equal(u.priceText(0), "0 gp");
  assert.equal(u.priceText(7), "7 cp");
  assert.equal(u.coinsText({ gp: 23, sp: 4 }), "23 gp, 4 sp");
  assert.equal(u.coinsText({}), "0 gp");
  assert.equal(u.parsePrice("15gp"), 1500);
  assert.equal(u.parsePrice("3 gp 5 sp"), 350);
  assert.equal(u.parsePrice("12"), 1200);
  assert.equal(u.parsePrice("2 χρυσά, 3 ασημένια"), 230);
  assert.equal(u.parsePrice("0.5 gp"), 50);
  assert.equal(u.parsePrice("nonsense"), null);
  assert.equal(u.parsePrice(""), null);
});

test("spendCoins pays like a shopkeeper (no electrum as change)", () => {
  assert.deepEqual(u.spendCoins({ gp: 23, sp: 4 }, 1100), { pp: 0, gp: 12, ep: 0, sp: 4, cp: 0 });
  assert.deepEqual(u.spendCoins({ pp: 1 }, 30), { pp: 0, gp: 9, ep: 0, sp: 7, cp: 0 });
  assert.deepEqual(u.spendCoins({ gp: 1, cp: 5 }, 5), { pp: 0, gp: 1, ep: 0, sp: 0, cp: 0 });
  assert.deepEqual(u.spendCoins({ ep: 2 }, 60), { pp: 0, gp: 0, ep: 0, sp: 4, cp: 0 });
  assert.deepEqual(u.spendCoins({ gp: 2, sp: 9 }, 250), { pp: 0, gp: 0, ep: 0, sp: 4, cp: 0 });
  assert.equal(u.spendCoins({ gp: 1 }, 101), null);
  assert.deepEqual(u.spendCoins({ gp: 3 }, 0), { pp: 0, gp: 3, ep: 0, sp: 0, cp: 0 });
  // Value is always conserved.
  for (const [purse, cost] of [[{ pp: 2, gp: 1, ep: 3, sp: 7, cp: 9 }, 1234], [{ pp: 1 }, 1], [{ sp: 50 }, 499]]) {
    assert.equal(u.coinValue(u.spendCoins(purse, cost)), u.coinValue(purse) - cost);
  }
});

test("categories and the shop types' usual shelves", () => {
  assert.equal(u.categoryOf({ type: "weapon", subtype: "martialM" }), "weapons");
  assert.equal(u.categoryOf({ type: "equipment", subtype: "heavy" }), "armor");
  assert.equal(u.categoryOf({ type: "equipment", subtype: "shield" }), "shields");
  assert.equal(u.categoryOf({ type: "equipment", subtype: "trinket" }), "gear");
  assert.equal(u.categoryOf({ type: "consumable", subtype: "potion" }), "potions");
  assert.equal(u.categoryOf({ type: "consumable", subtype: "poison" }), "poisons");
  assert.equal(u.categoryOf({ type: "consumable", subtype: "ammo" }), "ammunition");
  assert.equal(u.categoryOf({ type: "consumable", subtype: "scroll" }), "scrolls");
  assert.equal(u.categoryOf({ type: "consumable", subtype: "food" }), "food");
  assert.equal(u.categoryOf({ type: "consumable", subtype: "wand" }), "consumables");
  assert.equal(u.categoryOf({ type: "tool" }), "tools");
  assert.equal(u.categoryOf({ type: "loot" }), "gear");
  assert.equal(u.categoryOf({ type: "spell" }), "other");
  assert.equal(u.fitsType("blacksmith", "weapons"), true);
  assert.equal(u.fitsType("blacksmith", "potions"), false);
  assert.equal(u.fitsType("alchemist", "potions"), true);
  assert.equal(u.fitsType("nonsense", "potions"), true);
  for (const t of u.SHOP_TYPES) for (const c of u.TYPE_CATEGORIES[t]) assert.ok(u.CATEGORIES.includes(c), c);
});

test("prices: the item's own, else the DMG value by rarity", () => {
  assert.deepEqual(u.itemPrice({ value: 15, denomination: "gp" }), { cp: 1500, from: "item" });
  assert.deepEqual(u.itemPrice({ value: 5, denomination: "sp" }), { cp: 50, from: "item" });
  assert.deepEqual(u.itemPrice({ value: 0, rarity: "uncommon", type: "equipment" }), { cp: 40000, from: "rarity" });
  assert.deepEqual(u.itemPrice({ value: 0, rarity: "common", type: "consumable", subtype: "potion" }), { cp: 5000, from: "rarity" }, "consumables are half");
  assert.deepEqual(u.itemPrice({ value: 0, rarity: "rare", type: "consumable", subtype: "scroll" }), { cp: 400000, from: "rarity" }, "scrolls are not halved");
  assert.deepEqual(u.itemPrice({ value: 0, rarity: "very rare" }), { cp: 4000000, from: "rarity" });
  assert.deepEqual(u.itemPrice({ value: 0, rarity: "artifact" }), { cp: null, from: "priceless" });
  assert.deepEqual(u.itemPrice({ value: 0 }), { cp: 0, from: "none" });
  assert.equal(u.rowPrice({ price: 1000 }, 1.5), 1500);
  assert.equal(u.rowPrice({ price: 1000, override: 700 }, 1), 700);
  assert.equal(u.rowPrice({ price: 333 }, 1.1), 367, "rounded up to the copper");
  assert.equal(u.rowPrice({ price: null }), null);
  assert.equal(u.rowPrice({ price: 100 }, -2), 100, "a bad multiplier counts as 1");
});

test("stock rows: made from a snapshot, cleaned, restocked", () => {
  const r = u.makeRow({ uuid: "Compendium.x.Item.a", name: "Arrows", img: "a.webp", type: "consumable", subtype: "ammo", value: 1, denomination: "gp", quantity: 20 }, "r1");
  assert.equal(r.category, "ammunition");
  assert.equal(r.price, 100);
  assert.equal(r.bundle, 20);
  assert.equal(r.qty, 1);
  assert.equal(r.hidden, false);
  assert.equal(u.normalizeRow(null), null);
  const n = u.normalizeRow({ id: "x", qty: "", restock: "4", override: "", bundle: 0, category: "bogus", type: "weapon" });
  assert.equal(n.qty, null, "empty = unlimited");
  assert.equal(n.restock, 4);
  assert.equal(n.override, null);
  assert.equal(n.bundle, 1);
  assert.equal(n.category, "weapons");
  const rows = u.restockRows([row("a", { qty: 0, restock: 3 }), row("b", { qty: 5, restock: 3 }), row("c", { qty: null, restock: 3 })]);
  assert.deepEqual(rows.map(x => x.qty), [3, 5, null]);
  const st = u.normalizeState({ shops: { a: { stock: [{ id: "r" }, null], visits: "2" }, bad: null } });
  assert.equal(st.shops.a.stock.length, 1);
  assert.equal(st.shops.a.visits, 2);
  assert.equal(st.shops.bad, undefined);
  assert.deepEqual(u.normalizeState(null), { schema: 1, shops: {} });
});

test("the basket: stock, the secret shelf, sold out, all or nothing", () => {
  const rows = [row("rope", { price: 100, qty: 3 }), row("torch", { price: 1, qty: null }), row("key", { price: 5000, qty: 1, hidden: true }), row("gone", { qty: 0 }), row("relic", { price: null })];
  const ok = u.checkBasket(rows, [{ rowId: "rope", n: 2 }, { rowId: "torch", n: 10 }, { rowId: "rope", n: 1 }], { multiplier: 1 });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.total, 300 + 10);
  assert.equal(ok.lines.find(l => l.rowId === "rope").n, 3, "the same row twice is merged");
  assert.equal(u.checkBasket(rows, [], {}).errors[0].code, "Empty");
  assert.equal(u.checkBasket(rows, [{ rowId: "rope", n: 4 }]).errors[0].code, "NotEnough");
  assert.equal(u.checkBasket(rows, [{ rowId: "rope", n: 4 }]).errors[0].left, 3);
  assert.equal(u.checkBasket(rows, [{ rowId: "gone", n: 1 }]).errors[0].code, "SoldOut");
  assert.equal(u.checkBasket(rows, [{ rowId: "key", n: 1 }]).errors[0].code, "Hidden");
  assert.equal(u.checkBasket(rows, [{ rowId: "key", n: 1 }], { secretOpen: true }).total, 5000);
  assert.equal(u.checkBasket(rows, [{ rowId: "relic", n: 1 }]).errors[0].code, "Priceless");
  assert.equal(u.checkBasket(rows, [{ rowId: "nope", n: 1 }]).errors[0].code, "Missing");
  assert.equal(u.checkBasket(rows, [{ rowId: "rope", n: 1 }], { multiplier: 1.5 }).total, 150);
  const after = u.moveStock(rows, ok.lines, -1);
  assert.equal(after.find(r => r.id === "rope").qty, 0);
  assert.equal(after.find(r => r.id === "torch").qty, null, "unlimited stays unlimited");
  assert.equal(u.moveStock(after, ok.lines, +1).find(r => r.id === "rope").qty, 3);
  assert.deepEqual(u.visibleRows(rows, false).map(r => r.id), ["rope", "torch", "gone", "relic"]);
  assert.equal(u.visibleRows(rows, true).length, 5);
});

test("who is inside: open for some, one shop per player, leave, secret results", () => {
  const meta = { visit: "v1", since: "2026-10-30T20:00:00.000Z" };
  let l = u.openFor(null, "smith", ["p1", "p2"], meta);
  assert.deepEqual(l.open.smith.users, ["p1", "p2"]);
  l = u.openFor(l, "smith", ["p3"], { visit: "v2", since: "x" });
  assert.equal(l.open.smith.visit, "v1", "a shop that is open keeps its visit");
  l.open.smith.secret.a1 = "open";
  l = u.openFor(l, "alch", ["p1"], { visit: "v3", since: "y" });
  assert.deepEqual(l.open.smith.users, ["p2", "p3"], "p1 walked over to the alchemist");
  assert.equal(u.shopOfUser(l, "p1"), "alch");
  assert.equal(u.shopOfUser(l, "nobody"), null);
  l = u.leave(l, "alch", "p1");
  assert.equal(l.open.alch, undefined, "the last one out closes it");
  l = u.leave(l, "smith", "p2");
  assert.deepEqual(l.open.smith.users, ["p3"]);
  assert.equal(l.open.smith.secret.a1, "open");
  assert.equal(u.leave(l, "nope", "p3").open.smith.users.length, 1);
  assert.deepEqual(u.normalizeLive({ open: { s: { users: ["a", "a", 3], secret: { x: "open", y: "maybe" } } } }).open.s, { visit: "", since: "", users: ["a"], secret: { x: "open" }, event: null });
  assert.equal(u.secretResult(15, 15), "open");
  assert.equal(u.secretResult(14, 15), "locked");
});

test("packs: validate, fill in a shop, find it by name", () => {
  assert.deepEqual(u.validatePack(shipped), []);
  assert.equal(u.validatePack(null).length, 1);
  assert.match(u.validatePack({ planarStorePack: 9 })[0], /schema/);
  assert.match(u.validatePack({ shops: {} })[0], /list/);
  const bad = u.validatePack({ shops: [{ id: "A B", name: "x", type: "general" }, { id: "a", type: "tavern" }, { id: "a", name: "y", type: "general", secret: { dc: "hard", skills: ["persuasion"] } }], types: { tavern: {} } });
  assert.equal(bad.length, 7);
  const packShop = { id: "smith", type: "blacksmith", name: { en: "The Forge", el: "Το Καμίνι" }, owner: { name: "Bram", about: "Big." }, secret: { dc: 18, skills: ["itm"] }, priceMultiplier: 1.2 };
  const d = u.shopDef("smith", packShop, { edit: { owner: { about: "Bigger." }, secret: { dc: 16 } } });
  assert.equal(d.type, "blacksmith");
  assert.equal(d.owner.name, "Bram");
  assert.equal(d.owner.about, "Bigger.", "the GM's edit wins");
  assert.equal(d.secret.dc, 16);
  assert.deepEqual(d.secret.skills, ["itm"]);
  assert.equal(d.priceMultiplier, 1.2);
  assert.equal(d.fromPack, true);
  const hand = u.shopDef("stall", null, { custom: { name: "Stall", type: "nonsense" } });
  assert.equal(hand.type, "general");
  assert.equal(hand.secret.dc, 15);
  assert.deepEqual(hand.secret.skills, ["per", "itm", "dec"]);
  assert.equal(hand.custom, true);
  const defs = [d, hand];
  assert.equal(u.findShop(defs, "smith"), d);
  assert.equal(u.findShop(defs, "το καμινι"), d);
  assert.equal(u.findShop(defs, "Forge"), d);
  assert.equal(u.findShop(defs, "sta"), hand);
  assert.equal(u.findShop(defs, ""), null);
  assert.equal(u.findShop(defs, "nothing"), null);
  assert.deepEqual(u.parseShopArgs("Το Καμίνι | all"), { target: "Το Καμίνι", verb: "all" });
  assert.deepEqual(u.parseShopArgs("Forge"), { target: "Forge", verb: "open" });
  assert.deepEqual(u.parseShopArgs("Forge|Close"), { target: "Forge", verb: "close" });
});

test("the ledger page, newest first", () => {
  let l = u.normalizeLedger(null);
  l = u.addEntry(l, { id: "1", kind: "buy", date: "2026-10-30T20:10:00.000Z", session: "S03", actorName: "Ilka", shopName: "Forge", lines: [{ name: "Shield", n: 1 }, { name: "Dagger", n: 2 }], total: 1400, payer: "hero" });
  l = u.addEntry(l, { id: "2", kind: "secret", date: "2026-10-30T20:20:00.000Z", session: "S03", actorName: "Tobin", shopName: "Forge | back", skill: "itm", total: 17, dc: 15, result: "open" });
  l = u.addEntry(l, { id: "3", kind: "buy", date: "2026-10-30T20:30:00.000Z", actorName: "Ilka", shopName: "Forge", lines: [{ name: "Rope", n: 1 }], total: 100, payer: "party", undone: true });
  const L = { title: "Purchases", intro: "Intro", none: "None", secret: "secret", gm: "gm", party: "(party)", undone: "undone",
    cols: { when: "When", session: "Session", hero: "Hero", shop: "Shop", what: "What", paid: "Paid" } };
  const md = u.pageMarkdown(l, L);
  assert.match(md, /^---\ntags: \[store\]\n---\n# Purchases/);
  assert.ok(md.indexOf("Rope") < md.indexOf("Shield"), "newest first");
  assert.match(md, /Shield, 2× Dagger \| 14 gp \|/);
  assert.match(md, /secret \(itm 17 vs DC 15\) ✓/);
  assert.match(md, /Forge \\\| back/, "pipes escaped");
  assert.match(md, /~~Rope~~ undone \| 1 gp \(party\)/);
  assert.match(u.pageMarkdown(u.normalizeLedger(null), L), /None/);
  let big = u.normalizeLedger(null);
  for (let i = 0; i < u.MAX_LEDGER + 5; i++) big = u.addEntry(big, { id: String(i) });
  assert.equal(big.entries.length, u.MAX_LEDGER);
  assert.equal(big.entries[0].id, "5");
});

test("prices: the multiplier and an event's factors, rounded the way a shopkeeper would", () => {
  assert.equal(u.rowPrice({ price: 100 }, 1.1), 110, "100 × 1.1 is 110, not 111");
  assert.equal(u.rowPrice({ price: 1500, category: "weapons" }, 1, { categoryFactors: { weapons: 0.8 } }), 1200);
  assert.equal(u.rowPrice({ price: 1500, category: "armor" }, 1, { categoryFactors: { weapons: 0.8 } }), 1500, "other shelves are untouched");
  assert.equal(u.rowPrice({ price: 1000, category: "gear" }, 1.5, { priceFactor: 2 }), 3000, "factors multiply");
  assert.equal(u.rowPrice({ price: 3, category: "gear" }, 1, { priceFactor: 0.5 }), 2, "rounded up to a whole copper");
  assert.equal(u.rowPrice({ price: 10, override: 20 }, 1, { priceFactor: 2 }), 40, "an own price is moved too");
  assert.equal(u.rowPrice({ price: null }, 1, { priceFactor: 2 }), null, "not for sale stays so");
});

test("events: cleaned, pooled by type and shop, picked by weight, validated", () => {
  const fx = u.normalizeFx({ priceFactor: 99, categoryFactors: { weapons: 0.8, nonsense: 2, gear: 1 }, outOf: ["potions", "potions", "xx"], secretDcDelta: 40, junk: 1 });
  assert.deepEqual(fx, { priceFactor: u.FX_RANGE.max, categoryFactors: { weapons: 0.8 }, outOf: ["potions"], secretDcDelta: u.DC_DELTA_MAX });
  assert.deepEqual(u.normalizeFx({ priceFactor: 1, secretDcDelta: 0 }), {}, "no-ops are dropped");
  assert.equal(u.normalizeEvent({ id: "Bad Id", title: "x" }), null);
  assert.equal(u.normalizeEvent({ id: "empty" }), null, "nothing to show");
  const e = u.normalizeEvent({ id: "sale", title: { en: "Sale", el: "Έκπτωση" }, bark: "Cheap today!", weight: 3, icon: "fa-tag", gm: "Secret", fx: { priceFactor: 0.9 } });
  assert.deepEqual([e.weight, e.icon, e.bark, e.fx], [3, "fa-tag", ["Cheap today!"], { priceFactor: 0.9 }]);
  assert.equal(u.normalizeEvent({ id: "w", title: "w", weight: -4 }).weight, 1);

  const type = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
  const mine = [{ id: "b", title: "B2" }, { id: "c", title: "C" }];
  assert.deepEqual(u.eventPool({ typeEvents: type, shopEvents: mine }).map(x => [x.id, x.title]), [["a", "A"], ["b", "B2"], ["c", "C"]], "a shop event with the type's id replaces it");
  assert.deepEqual(u.eventPool({ typeEvents: type, shopEvents: mine, mode: "replace" }).map(x => x.id), ["b", "c"]);
  assert.deepEqual(u.eventPool({}), []);

  const pool = u.eventPool({ typeEvents: [{ id: "a", title: "A", weight: 1 }, { id: "b", title: "B", weight: 3 }] });
  assert.equal(u.pickEvent(pool, { rnd: 0 }).id, "a");
  assert.equal(u.pickEvent(pool, { rnd: 0.3 }).id, "b", "a weighs 1 of 4");
  assert.equal(u.pickEvent(pool, { rnd: 0, exclude: ["a"] }).id, "b", "not the one that just ran");
  assert.equal(u.pickEvent(pool.slice(0, 1), { rnd: 0.5, exclude: ["a"] }).id, "a", "unless it is the only one");
  assert.equal(u.pickEvent([]), null);

  assert.equal(u.normalizeChance(0.25), 0.25);
  assert.equal(u.normalizeChance(30), 0.3, "above 1 reads as a percentage");
  assert.equal(u.normalizeChance(500), 1);
  assert.equal(u.normalizeChance(-1), null);
  assert.equal(u.normalizeChance(""), null);

  const rows = [row("sword", { category: "weapons" }), row("rope", { category: "gear" })];
  assert.deepEqual(u.eventRows(rows, { outOf: ["weapons"] }).map(r => r.qty), [0, 3], "the stock itself is untouched, the copy is empty");
  assert.equal(rows[0].qty, 3);
  assert.equal(u.eventRows(rows, null), rows);

  assert.match(u.describeFx({ priceFactor: 1.2, categoryFactors: { weapons: 0.9 }, outOf: ["potions"], secretDcDelta: -2 }), /all ×1\.2 · weapons ×0\.9 · out: potions · DC -2/);
  assert.equal(u.fxPercent(0.8), "−20%");
  assert.equal(u.fxPercent(1.1), "+10%");

  const live = u.normalizeLive({ open: { s: { users: ["a"], event: u.eventSnapshot(e, "2026-10-30T20:00:00.000Z") } } }).open.s.event;
  assert.equal(live.id, "sale");
  assert.equal(live.gm, undefined, "the GM's note never reaches the players' data");
  assert.equal(u.normalizeLive({ open: { s: { users: [], event: { title: "no id" } } } }).open.s.event, null);

  const good = { planarStorePack: 1, types: { general: { eventChance: 0.2, events: [{ id: "x", title: "X", fx: { priceFactor: 0.9, outOf: ["gear"] } }] } }, shops: [{ id: "s", name: "S", type: "general", events: [{ id: "y", text: "Y" }], eventsMode: "replace" }] };
  assert.deepEqual(u.validatePack(good), []);
  const bad = u.validatePack({ planarStorePack: 1, types: { general: { eventChance: "lots", events: [{ id: "A B", title: "t" }, { id: "dup", title: "t" }, { id: "dup", title: "t" }, { id: "none" }, { id: "fx", title: "t", fx: { priceFactor: 0, outOf: ["moon"], secretDcDelta: "x", magic: 1 } }] } }, shops: [{ id: "s", name: "S", type: "general", eventsMode: "both", events: "no" }] });
  for (const re of [/eventChance/, /lower case/, /appears twice/, /needs a title/, /priceFactor/, /not a shelf/, /secretDcDelta/, /unknown effect/, /eventsMode/, /must be a list/]) assert.ok(bad.some(m => re.test(m)), `${re} is reported`);
});

test("an owner linked to an actor: its portrait and name, from the copy the GM's client keeps", () => {
  const owner = { name: { en: "Brisa" }, img: "pack.webp", actor: "Brisa Tolland" };
  const snap = { ref: "Brisa Tolland", uuid: "Actor.abc", name: "Brisa T.", img: "actors/brisa.webp" };
  const linked = u.applyOwnerSnap(owner, snap);
  assert.deepEqual([linked.linked, linked.img, linked.actorUuid, linked.actorName], [true, "actors/brisa.webp", "Actor.abc", "Brisa T."]);
  assert.deepEqual(linked.name, { en: "Brisa" }, "the pack's own name wins");
  assert.equal(u.applyOwnerSnap({ ...owner, name: "" }, snap).name, "Brisa T.", "no name in the pack: the actor's");
  assert.equal(u.applyOwnerSnap(owner, { ...snap, img: "icons/svg/mystery-man.svg" }).img, "pack.webp", "a blank portrait falls back");
  assert.equal(u.applyOwnerSnap(owner, { ...snap, ref: "someone else" }).linked, false, "a copy of another link is ignored");
  assert.equal(u.applyOwnerSnap({ name: "x", actor: "" }, snap).linked, false);
  assert.equal(u.normalizeOwnerSnap({ ref: "a" }), null);

  const def = u.shopDef("s", { id: "s", type: "general", name: "S", owner: { actor: "Brisa Tolland" }, events: [{ id: "e", title: "E" }], eventChance: 40 }, { ownerSnap: snap, edit: {} });
  assert.deepEqual([def.owner.linked, def.owner.img, def.eventChance, def.events.length], [true, "actors/brisa.webp", 0.4, 1]);
  const unlinked = u.shopDef("s", { id: "s", type: "general", name: "S", owner: { actor: "Brisa Tolland" } }, { ownerSnap: snap, edit: { owner: { actor: "" } } });
  assert.equal(unlinked.owner.linked, false, "the GM can unlink an actor the pack links");
});

test("the ledger page lists events", () => {
  let l = u.addEntry(u.normalizeLedger(null), { id: "1", kind: "event", date: "2026-10-30T20:10:00.000Z", shopName: "Forge", title: "The forge roars", eventId: "roar" });
  const L = { title: "T", intro: "I", none: "N", secret: "s", gm: "g", event: "event", party: "p", undone: "u", cols: { when: "When", session: "Session", hero: "Hero", shop: "Shop", what: "What", paid: "Paid" } };
  assert.match(u.pageMarkdown(l, L), /event: The forge roars/);
});
