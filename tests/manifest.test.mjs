import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { MODULE_ID } from "../scripts/constants.mjs";
import { CATEGORIES, SHOP_TYPES } from "../scripts/util.mjs";

const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const file = p => new URL(`../${p}`, import.meta.url);

test("manifest has the fields Foundry requires", () => {
  for (const k of ["id", "title", "description", "version", "compatibility"]) assert.ok(manifest[k], k);
  assert.match(manifest.id, /^[a-z0-9-]+$/);
  assert.equal(manifest.id, MODULE_ID, "constants.mjs and module.json must agree");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.compatibility.minimum && manifest.compatibility.verified);
  assert.equal(manifest.relationships.systems[0].id, "dnd5e");
});

test("socket is enabled (players ask the GM to buy)", () => {
  assert.equal(manifest.socket, true);
});

test("every referenced file exists", () => {
  for (const p of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(l => l.path), "data/default-pack.json"]) {
    assert.ok(existsSync(file(p)), p);
  }
});

const flatten = (obj, prefix = "") => Object.entries(obj).flatMap(([k, v]) =>
  v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
const langs = Object.fromEntries(manifest.languages.map(l => [l.lang, JSON.parse(readFileSync(file(l.path), "utf8"))]));

test("all languages define exactly the same keys as English", () => {
  const en = flatten(langs.en).sort();
  for (const [code, data] of Object.entries(langs)) assert.deepEqual(flatten(data).sort(), en, `${code} differs from en`);
});

test("placeholders match between languages", () => {
  const get = (o, path) => path.split(".").reduce((x, k) => x[k], o);
  const holders = s => (s.match(/\{\w+\}/g) ?? []).sort().join();
  for (const key of flatten(langs.en)) {
    for (const [code, data] of Object.entries(langs)) {
      assert.equal(holders(get(data, key)), holders(get(langs.en, key)), `${code}: ${key}`);
    }
  }
});

test("every localization key used in the code exists", () => {
  const known = new Set(flatten(langs.en).map(k => k.replace(/^PLANAR_STORE\./, "")));
  const sources = readdirSync(file("scripts")).filter(n => n.endsWith(".mjs") && n !== "util.mjs")
    .map(n => readFileSync(file(`scripts/${n}`), "utf8")).join("\n");
  const used = [...sources.matchAll(/\b(?:t|warn|info)\(\s*"([\w.]+)"/g)].map(m => m[1]);
  assert.ok(used.length > 100, `found the t() calls (${used.length})`);
  for (const key of used) assert.ok(known.has(key), `missing key ${key}`);
  const ternary = [...sources.matchAll(/\?\s*"([A-Z]\w*\.[\w.]+)"\s*:\s*"([A-Z]\w*\.[\w.]+)"/g)].flatMap(m => [m[1], m[2]]);
  for (const key of ternary) assert.ok(known.has(key), `missing key ${key}`);
  const raw = [...sources.matchAll(/"PLANAR_STORE\.([\w.]+)"/g)].map(m => m[1]);
  assert.ok(raw.length > 5);
  for (const key of raw) assert.ok(known.has(key), `missing key ${key}`);
  const settings = readFileSync(file("scripts/settings.mjs"), "utf8");
  for (const [, key] of settings.matchAll(/world\("(\w+)"/g)) {
    assert.ok(known.has(`Settings.${key}.Name`) && known.has(`Settings.${key}.Hint`), `setting ${key}`);
  }
  // Keys built from a list: check every member.
  for (const k of ["shops", "stock", "live", "ledger"]) assert.ok(known.has(`Console.Tab.${k}`), k);
  for (const c of CATEGORIES) assert.ok(known.has(`Category.${c}`), c);
  for (const c of ["when", "session", "hero", "shop", "what", "paid"]) assert.ok(known.has(`Page.Col.${c}`), c);
  for (const f of ["item", "rarity", "none", "priceless"]) assert.ok(known.has(`Stock.From.${f}`), f);
  for (const v of ["open", "all", "close"]) assert.ok(known.has(`Enricher.${v}`), v);
  const errors = ["Empty", "Missing", "Hidden", "Priceless", "SoldOut", "NotEnough", "TooPoor", "TooPoorParty", "ItemGone", "NoShop", "NoUser",
    "NotInside", "NoHero", "NoGM", "NoReply", "Failed", "Unknown", "BadSkill", "BadRoll", "NoEntry"];
  for (const e of errors) assert.ok(known.has(`Error.${e}`), e);
  for (const [, code] of sources.matchAll(/fail\("(\w+)"/g)) assert.ok(errors.includes(code), `Error.${code} is in the list`);
});

test("the shipped pack names every shop type in both languages and is valid", () => {
  const pack = JSON.parse(readFileSync(file("data/default-pack.json"), "utf8"));
  for (const s of SHOP_TYPES) assert.ok(pack.types[s]?.name?.en && pack.types[s]?.name?.el, s);
});

test("the repo ships no campaign or publisher content", () => {
  const texts = ["data/default-pack.json", "lang/en.json", "lang/el.json", "README.md", "styles/store.css", "module.json"]
    .filter(p => existsSync(file(p))).map(p => [p, readFileSync(file(p), "utf8")]);
  for (const [p, text] of texts) {
    for (const word of ["Shemeshka", "Sigil", "Fortune's Wheel", "Mortuary", "Morte", "Nanouk", "Lothrik", "Elaion", "Dumien", "Marigia", "Doomguard", "Armory", "Great Bazaar", "Τροχός"]) {
      assert.ok(!text.includes(word), `${p} mentions ${word}`);
    }
  }
});
