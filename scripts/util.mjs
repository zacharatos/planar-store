// Pure helpers: no Foundry globals here, so everything in this file is unit-tested (tests/util.test.mjs).

export const STATE_SCHEMA = 1;
export const PACK_SCHEMA = 1;
export const LANGUAGES = ["en", "el"];

/** The shop types the engine draws (each has its own look). A pack can rename them and give each a sound. */
export const SHOP_TYPES = ["general", "blacksmith", "alchemist"];

/** Shelf categories, in the order the tabs show them. */
export const CATEGORIES = ["weapons", "armor", "shields", "ammunition", "potions", "poisons", "scrolls", "consumables", "tools", "gear", "food", "other"];

/** What each shop type usually sells. Only a warning in the GM's stock list, never a block. */
export const TYPE_CATEGORIES = {
  general: ["gear", "tools", "ammunition", "food", "consumables", "other"],
  blacksmith: ["weapons", "armor", "shields", "ammunition"],
  alchemist: ["potions", "poisons", "consumables", "scrolls", "gear"]
};

/** The skills a hero may use to ask about the secret shelf (dnd5e skill ids). */
export const SECRET_SKILLS = ["per", "itm", "dec"];

/** How many ledger lines the world keeps. */
export const MAX_LEDGER = 500;

/* ------------------------------------------------------------------ */
/* Text and language                                                   */
/* ------------------------------------------------------------------ */

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Lower case, no accents, single spaces: "Το  Οπλοστάσιο" matches "το οπλοστασιο". */
export function fold(text) {
  return String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** "The Armory!" → "the-armory"; Greek letters are kept. */
export function slug(text) {
  return fold(text).replace(/[^a-z0-9α-ω]+/g, "-").replace(/^-+|-+$/g, "") || "shop";
}

/** A dotted key from a nested dictionary ("Console.Tab.stock"), or undefined. */
export function lookup(dict, key) {
  const v = String(key).split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), dict);
  return typeof v === "string" ? v : undefined;
}

/** Fill {placeholders}; unknown ones stay as written. */
export function fill(text, data) {
  if (!data) return text;
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in data && data[k] != null ? String(data[k]) : m));
}

/** The language to use: the user's choice, else the world default, else Foundry's language (Greek or English). */
export function pickLanguage(user, world, foundry) {
  if (LANGUAGES.includes(user)) return user;
  if (LANGUAGES.includes(world)) return world;
  return foundry === "el" ? "el" : "en";
}

/** Text that can be a string or { en, el }. */
export function localText(value, lang = "en") {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[lang] ?? value.en ?? Object.values(value).find(v => typeof v === "string") ?? "";
}

/** Typed text as HTML: paragraphs at blank lines, line breaks kept, *italic* and **bold**. HTML passes through. */
export function textToHTML(text) {
  const s = String(text ?? "").trim();
  if (!s) return "";
  if (/^<(p|div|ul|ol|h\d|blockquote|table)[\s>]/i.test(s)) return s;
  const inline = x => escapeHTML(x).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\n/g, "<br>");
  return s.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${inline(p)}</p>`).join("");
}

/** HTML to one line of plain text. */
export function htmlToPlain(html) {
  return String(html ?? "")
    .replace(/<(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

/** Keep a description short enough to store in the world setting: cut the HTML at a block boundary. */
export function trimHTML(html, max = 2000) {
  const s = String(html ?? "");
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const ends = ["</p>", "</li>", "</ul>", "</table>"].map(tag => { const i = cut.lastIndexOf(tag); return i < 0 ? -1 : i + tag.length; });
  const at = Math.max(...ends);
  return at > max * 0.3 ? `${cut.slice(0, at)}<p>…</p>` : `<p>${escapeHTML(htmlToPlain(s).slice(0, Math.floor(max / 2)))}…</p>`;
}

/** One random line from a list (rnd in [0, 1) for tests). */
export function pickLine(list, rnd = Math.random()) {
  const l = (Array.isArray(list) ? list : [list]).filter(x => typeof x === "string" && x.trim());
  return l.length ? l[Math.min(l.length - 1, Math.floor(rnd * l.length))] : "";
}

/* ------------------------------------------------------------------ */
/* Coins (all prices are kept in copper)                               */
/* ------------------------------------------------------------------ */

export const COINS = ["pp", "gp", "ep", "sp", "cp"];
export const COIN_CP = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };

export const noCoins = () => Object.fromEntries(COINS.map(c => [c, 0]));
/** A purse from anything ({gp: "3"} or an actor's system.currency): whole, non-negative numbers. */
export const cleanCoins = (c = {}) => Object.fromEntries(COINS.map(k => [k, Math.max(0, Math.trunc(Number(c?.[k]) || 0))]));
export const coinValue = c => COINS.reduce((sum, k) => sum + (Number(c?.[k]) || 0) * COIN_CP[k], 0);
export const isZero = c => COINS.every(k => !Number(c?.[k]));
/** b − a, per coin. */
export const diffCoins = (a, b) => Object.fromEntries(COINS.map(k => [k, (Number(b?.[k]) || 0) - (Number(a?.[k]) || 0)]));
export const addCoins = (a, b) => Object.fromEntries(COINS.map(k => [k, (Number(a?.[k]) || 0) + (Number(b?.[k]) || 0)]));

/** A copper amount as gp / sp / cp (no platinum, no electrum): 1150 → { gp: 11, sp: 5 }. */
export function toCoins(cp) {
  let rest = Math.max(0, Math.round(Number(cp) || 0));
  const out = noCoins();
  for (const k of ["gp", "sp", "cp"]) { out[k] = Math.floor(rest / COIN_CP[k]); rest -= out[k] * COIN_CP[k]; }
  return out;
}

/** "11 gp 5 sp" from copper. Zero is "0 gp". */
export function priceText(cp) {
  const c = toCoins(cp);
  const parts = ["gp", "sp", "cp"].filter(k => c[k]).map(k => `${c[k]} ${k}`);
  return parts.length ? parts.join(" ") : "0 gp";
}

/** "3 gp, 5 sp" for a purse (zero coins left out). */
export function coinsText(c, empty = "0 gp") {
  const parts = COINS.filter(k => Number(c?.[k])).map(k => `${Math.abs(Number(c[k]))} ${k}`);
  return parts.length ? parts.join(", ") : empty;
}

/**
 * "15gp", "3 gp 5 sp", "12" (gold), "2 χρυσά" → copper. Null when nothing is understood.
 * Greek coin words: χρυσά/χρ (gp), ασημένια/ασ (sp), χάλκινα/χαλ (cp), ηλέκτρινα (ep), πλατινένια (pp).
 */
export function parsePrice(text) {
  const s = fold(text).replace(/,/g, " ");
  if (!s) return null;
  const words = [
    ["pp", /^(pp|platinum|πλατιν[α-ω]*|πλ)$/], ["gp", /^(gp|gold|χρυσ[α-ω]*|χρ|gc)$/], ["ep", /^(ep|electrum|ηλεκτρ[α-ω]*|ηλ)$/],
    ["sp", /^(sp|silver|ασημ[α-ω]*|ασ)$/], ["cp", /^(cp|copper|χαλκ[α-ω]*|χαλ)$/]
  ];
  let total = 0, found = false;
  const re = /(\d+(?:\.\d+)?)\s*([a-zα-ω]+)?/g;
  let m;
  while ((m = re.exec(s))) {
    const unit = m[2] ? words.find(([, rx]) => rx.test(m[2]))?.[0] : "gp";
    if (!unit) continue;
    total += Number(m[1]) * COIN_CP[unit];
    found = true;
  }
  return found ? Math.round(total) : null;
}

/**
 * Pay `costCp` out of `purse` like a shopkeeper: the biggest coins that fit go first, and if that doesn't add up,
 * one more coin is handed over and the change comes back as gold, silver and copper (never electrum).
 * Returns the new purse, or null if the purse can't afford it.
 */
export function spendCoins(purse, costCp) {
  const p = cleanCoins(purse);
  let rest = Math.max(0, Math.round(Number(costCp) || 0));
  if (coinValue(p) < rest) return null;
  for (const k of COINS) {
    const n = Math.min(p[k], Math.floor(rest / COIN_CP[k]));
    p[k] -= n;
    rest -= n * COIN_CP[k];
  }
  if (rest > 0) {
    // Every coin still in the purse is worth more than what's left to pay: hand over the smallest one.
    const k = [...COINS].reverse().find(x => p[x] > 0);
    p[k] -= 1;
    const change = toCoins(COIN_CP[k] - rest);
    for (const c of ["gp", "sp", "cp"]) p[c] += change[c];
  }
  return p;
}

/* ------------------------------------------------------------------ */
/* Items: categories and prices                                        */
/* ------------------------------------------------------------------ */

/**
 * The shelf an item goes on, from its dnd5e data.
 * @param {{type: string, subtype?: string, baseItem?: string}} info  type = item.type; subtype = system.type.value
 */
export function categoryOf({ type, subtype = "" } = {}) {
  const sub = String(subtype ?? "").toLowerCase();
  switch (type) {
    case "weapon": return "weapons";
    case "equipment":
      if (sub === "shield") return "shields";
      if (["light", "medium", "heavy", "natural"].includes(sub)) return "armor";
      return "gear";
    case "consumable":
      if (sub === "potion") return "potions";
      if (sub === "poison") return "poisons";
      if (sub === "ammo") return "ammunition";
      if (sub === "scroll") return "scrolls";
      if (sub === "food") return "food";
      return "consumables";
    case "tool": return "tools";
    case "loot": case "container": case "backpack": return "gear";
    default: return "other";
  }
}

/** Does the item fit the shop's type? (A warning for the GM, never a block.) */
export const fitsType = (shopType, category) => !TYPE_CATEGORIES[shopType] || TYPE_CATEGORIES[shopType].includes(category);

/** DMG 2024, Magic Item Rarities and Values (gp). Artifacts are priceless. */
export const RARITY_GP = { common: 100, uncommon: 400, rare: 4000, veryRare: 40000, legendary: 200000 };
const RARITY_ALIASES = { "very rare": "veryRare", veryrare: "veryRare", "very-rare": "veryRare" };
export const normRarity = r => { const s = String(r ?? "").trim(); return RARITY_ALIASES[s.toLowerCase()] ?? s; };

/**
 * An item's price in copper: its own price if it has one; otherwise, for a magic item, the DMG value by rarity
 * (halved for a consumable other than a Spell Scroll). { cp, from: "item" | "rarity" | "none" | "priceless" }.
 */
export function itemPrice({ value = 0, denomination = "gp", rarity = "", type = "", subtype = "" } = {}) {
  const own = Math.round((Number(value) || 0) * (COIN_CP[denomination] ?? 100));
  if (own > 0) return { cp: own, from: "item" };
  const r = normRarity(rarity);
  if (r === "artifact") return { cp: null, from: "priceless" };
  if (RARITY_GP[r]) {
    const half = type === "consumable" && String(subtype).toLowerCase() !== "scroll";
    return { cp: RARITY_GP[r] * 100 * (half ? 0.5 : 1), from: "rarity" };
  }
  return { cp: 0, from: "none" };
}

/**
 * What a row costs in this shop (override wins), after the shop's multiplier and, if one is running, the random
 * event's price effects (`fx`, see normalizeFx). Null = not for sale. Rounded up to a whole copper; the product is
 * rounded first so that 100 × 1.1 is 110 and not 111 (floating point gives 110.00000000000001).
 */
export function rowPrice(row, multiplier = 1, fx = null) {
  const base = row?.override != null ? Number(row.override) : row?.price;
  if (base == null || !Number.isFinite(Number(base))) return null;
  const pos = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 1);
  const factor = pos(multiplier) * pos(fx?.priceFactor) * pos(fx?.categoryFactors?.[row?.category]);
  return Math.ceil(Math.round(Number(base) * factor * 1e6) / 1e6);
}

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

/**
 * A stock row from an item snapshot. qty null = unlimited (∞). bundle = how many come with one purchase
 * (the item's own quantity: "Arrows (20)").
 */
export function makeRow(snap, id) {
  const p = itemPrice(snap);
  return {
    id,
    uuid: String(snap.uuid ?? ""),
    name: String(snap.name ?? "?"),
    img: String(snap.img ?? ""),
    type: String(snap.type ?? ""),
    subtype: String(snap.subtype ?? ""),
    rarity: normRarity(snap.rarity),
    category: categoryOf(snap),
    price: p.cp,
    priceFrom: p.from,
    override: null,
    bundle: Math.max(1, Math.trunc(Number(snap.quantity) || 1)),
    qty: 1,
    restock: null,
    hidden: !!snap.hidden,
    desc: String(snap.desc ?? "")
  };
}

/** Clean a row read from storage. */
export function normalizeRow(r) {
  if (!r || typeof r !== "object" || !r.id) return null;
  const num = v => (v === null || v === undefined || v === "" ? null : Math.max(0, Math.trunc(Number(v) || 0)));
  return {
    ...r,
    name: String(r.name ?? "?"),
    category: CATEGORIES.includes(r.category) ? r.category : categoryOf(r),
    price: r.price == null ? null : Math.max(0, Number(r.price) || 0),
    override: r.override == null || r.override === "" ? null : Math.max(0, Number(r.override) || 0),
    bundle: Math.max(1, Math.trunc(Number(r.bundle) || 1)),
    qty: num(r.qty),
    restock: num(r.restock),
    hidden: !!r.hidden
  };
}

/** The world's shop data: { schema, shops: { id: { stock: [rows], edit: {}, custom: def|null, visits } } }. */
export function normalizeState(data) {
  const out = { schema: STATE_SCHEMA, shops: {} };
  const shops = data && typeof data === "object" && data.shops && typeof data.shops === "object" ? data.shops : {};
  for (const [id, s] of Object.entries(shops)) {
    if (!s || typeof s !== "object") continue;
    out.shops[id] = {
      stock: (Array.isArray(s.stock) ? s.stock : []).map(normalizeRow).filter(Boolean),
      edit: s.edit && typeof s.edit === "object" ? s.edit : {},
      custom: s.custom && typeof s.custom === "object" ? s.custom : null,
      visits: Math.max(0, Math.trunc(Number(s.visits) || 0)),
      ownerSnap: normalizeOwnerSnap(s.ownerSnap),
      lastEvent: typeof s.lastEvent === "string" ? s.lastEvent : ""
    };
  }
  return out;
}

export const emptyShopState = () => ({ stock: [], edit: {}, custom: null, visits: 0, ownerSnap: null, lastEvent: "" });

/**
 * The owner's linked NPC actor as the GM's client last read it: { ref, uuid, name, img }. Players can't always read
 * an actor they have no permission on, so the GM's client copies the name and portrait into the shop's state, and
 * every screen reads the copy. `ref` is what the pack or the console linked (a UUID or a name).
 */
export function normalizeOwnerSnap(snap) {
  if (!snap || typeof snap !== "object" || !snap.ref || !snap.name) return null;
  return { ref: String(snap.ref), uuid: String(snap.uuid ?? ""), name: String(snap.name), img: String(snap.img ?? "") };
}

/** Foundry's blank portrait: a linked actor that still has it falls back to the picture the pack gives. */
export const isPlaceholderImg = src => /(^|\/)mystery-man\.(svg|webp|png)$/i.test(String(src ?? ""));

const hasText = v => !!localText(v, "en");

/** The owner with the linked actor applied: its portrait always, its name when the pack gives none. */
export function applyOwnerSnap(owner, snap) {
  const ref = String(owner?.actor ?? "").trim();
  const s = normalizeOwnerSnap(snap);
  if (!ref || !s || s.ref !== ref) return { ...owner, actor: ref, linked: false };
  const img = s.img && !isPlaceholderImg(s.img) ? s.img : owner.img;
  return { ...owner, actor: ref, linked: true, actorName: s.name, actorUuid: s.uuid, img: img ?? "", name: hasText(owner.name) ? owner.name : s.name };
}

/** Restock: every row with a restock number goes back up to it (never down). */
export function restockRows(rows) {
  return rows.map(r => (r.restock != null && r.qty != null && r.qty < r.restock ? { ...r, qty: r.restock } : r));
}

/** What a hero can see: the open shelves, plus the secret one if it's open for them. Out-of-stock rows stay (greyed). */
export const visibleRows = (rows, secretOpen) => rows.filter(r => !r.hidden || secretOpen);

/** The rows as this visit's random event leaves them: shelves the event ran dry show as sold out (the stock itself is untouched). */
export function eventRows(rows, fx) {
  const out = Array.isArray(fx?.outOf) ? fx.outOf : [];
  return out.length ? rows.map(r => (out.includes(r.category) ? { ...r, qty: 0 } : r)) : rows;
}

/**
 * Check a basket against the stock. basket = [{ rowId, n }].
 * @returns {{ lines: {rowId, name, n, each, sum, bundle}[], total: number, errors: {code, rowId?, name?}[] }}
 */
export function checkBasket(allRows, basket, { secretOpen = false, multiplier = 1, event = null } = {}) {
  const fx = event?.fx ?? null;
  const rows = eventRows(allRows, fx);
  const errors = [];
  const merged = new Map();
  for (const b of Array.isArray(basket) ? basket : []) {
    const n = Math.trunc(Number(b?.n) || 0);
    if (!b?.rowId || n <= 0) continue;
    merged.set(b.rowId, (merged.get(b.rowId) ?? 0) + n);
  }
  if (!merged.size) return { lines: [], total: 0, errors: [{ code: "Empty" }] };
  const lines = [];
  for (const [rowId, n] of merged) {
    const row = rows.find(r => r.id === rowId);
    if (!row) { errors.push({ code: "Missing", rowId }); continue; }
    if (row.hidden && !secretOpen) { errors.push({ code: "Hidden", rowId, name: row.name }); continue; }
    const each = rowPrice(row, multiplier, fx);
    if (each == null) { errors.push({ code: "Priceless", rowId, name: row.name }); continue; }
    if (row.qty != null && row.qty <= 0) { errors.push({ code: "SoldOut", rowId, name: row.name }); continue; }
    if (row.qty != null && row.qty < n) { errors.push({ code: "NotEnough", rowId, name: row.name, left: row.qty }); continue; }
    lines.push({ rowId, uuid: row.uuid, name: row.name, n, each, sum: each * n, bundle: row.bundle });
  }
  return { lines, total: lines.reduce((s, l) => s + l.sum, 0), errors };
}

/** Take (sign −1) or give back (sign +1) the lines' quantities. Unlimited rows don't change. */
export function moveStock(rows, lines, sign = -1) {
  const by = new Map(lines.map(l => [l.rowId, l.n]));
  return rows.map(r => (by.has(r.id) && r.qty != null ? { ...r, qty: Math.max(0, r.qty + sign * by.get(r.id)) } : r));
}

/* ------------------------------------------------------------------ */
/* Who is inside, and the secret shelf                                 */
/* ------------------------------------------------------------------ */

/** Live data: { open: { shopId: { visit, since, users: [userId], secret: { actorId: "open" | "locked" }, event: snapshot|null } } }. */
export function normalizeLive(data) {
  const out = { schema: STATE_SCHEMA, open: {} };
  const open = data?.open && typeof data.open === "object" ? data.open : {};
  for (const [id, o] of Object.entries(open)) {
    if (!o || typeof o !== "object") continue;
    out.open[id] = {
      visit: String(o.visit ?? ""),
      since: String(o.since ?? ""),
      users: [...new Set((Array.isArray(o.users) ? o.users : []).filter(x => typeof x === "string"))],
      secret: o.secret && typeof o.secret === "object" ? Object.fromEntries(Object.entries(o.secret).filter(([, v]) => v === "open" || v === "locked")) : {},
      event: normalizeLiveEvent(o.event)
    };
  }
  return out;
}

/** Open a shop for users (one shop per user: they leave any other). A shop already open keeps its visit. */
export function openFor(live, shopId, userIds, { visit, since }) {
  const l = normalizeLive(live);
  for (const [id, o] of Object.entries(l.open)) if (id !== shopId) o.users = o.users.filter(u => !userIds.includes(u));
  const cur = l.open[shopId] ?? { visit, since, users: [], secret: {}, event: null };
  cur.users = [...new Set([...cur.users, ...userIds])];
  l.open[shopId] = cur;
  for (const [id, o] of Object.entries(l.open)) if (id !== shopId && !o.users.length) delete l.open[id];
  return l;
}

/** A user leaves (or the GM sends them out). The shop closes when nobody is left. */
export function leave(live, shopId, userId) {
  const l = normalizeLive(live);
  const o = l.open[shopId];
  if (!o) return l;
  o.users = o.users.filter(u => u !== userId);
  if (!o.users.length) delete l.open[shopId];
  return l;
}

/** The shop this user is in, or null. */
export const shopOfUser = (live, userId) => Object.entries(normalizeLive(live).open).find(([, o]) => o.users.includes(userId))?.[0] ?? null;

/** The secret-shelf answer: success opens it, failure locks it for this visit. Natural roll rules are dnd5e's. */
export const secretResult = (total, dc) => (Number(total) >= Number(dc) ? "open" : "locked");

/* ------------------------------------------------------------------ */
/* Random events                                                       */
/* ------------------------------------------------------------------ */

/**
 * A random event is something that happens while a shop is open: a headline the players see, a line the owner says,
 * and optionally effects on the visit. The pack lists them per shop type (`types.<type>.events`) and per shop
 * (`shops[].events`); the stock itself is never touched, the effects last until the shop closes.
 *
 *   { id, weight, icon, title, text, bark, gm, fx: { priceFactor, categoryFactors, outOf, secretDcDelta } }
 *
 * title / text / bark / gm are strings or { en, el }; bark can be a list (one line is read out).
 */
export const FX_RANGE = { min: 0.1, max: 5 };
export const DC_DELTA_MAX = 10;

const clampFactor = v => Math.min(FX_RANGE.max, Math.max(FX_RANGE.min, Number(v)));
const isText = v => (typeof v === "string" && v.trim() !== "") || (v && typeof v === "object" && !Array.isArray(v) && Object.values(v).some(x => typeof x === "string" && x.trim()));

/** Clean the effects of an event: only known keys, numbers in range, no-ops dropped. */
export function normalizeFx(fx) {
  const out = {};
  if (!fx || typeof fx !== "object") return out;
  const pf = Number(fx.priceFactor);
  if (Number.isFinite(pf) && pf > 0 && pf !== 1) out.priceFactor = clampFactor(pf);
  if (fx.categoryFactors && typeof fx.categoryFactors === "object") {
    const cf = {};
    for (const [k, v] of Object.entries(fx.categoryFactors)) {
      const n = Number(v);
      if (CATEGORIES.includes(k) && Number.isFinite(n) && n > 0 && n !== 1) cf[k] = clampFactor(n);
    }
    if (Object.keys(cf).length) out.categoryFactors = cf;
  }
  if (Array.isArray(fx.outOf)) {
    const o = [...new Set(fx.outOf.filter(c => CATEGORIES.includes(c)))];
    if (o.length) out.outOf = o;
  }
  const dd = Math.trunc(Number(fx.secretDcDelta));
  if (Number.isFinite(dd) && dd !== 0) out.secretDcDelta = Math.max(-DC_DELTA_MAX, Math.min(DC_DELTA_MAX, dd));
  return out;
}

/** A list of texts (a string, an { en, el } or a list of those) as a clean list. */
const textList = v => (Array.isArray(v) ? v : v == null ? [] : [v]).filter(isText);

/** One event from the pack, cleaned; null when it can't be used (no id, nothing to show). */
export function normalizeEvent(raw) {
  if (!raw || typeof raw !== "object" || !/^[a-z0-9-]+$/.test(String(raw.id ?? ""))) return null;
  if (!isText(raw.title) && !isText(raw.text)) return null;
  const w = Number(raw.weight);
  return {
    id: raw.id,
    weight: Number.isFinite(w) && w > 0 ? Math.min(100, w) : 1,
    icon: /^fa-[a-z0-9-]+$/.test(String(raw.icon ?? "")) ? raw.icon : "",
    title: isText(raw.title) ? raw.title : "",
    text: isText(raw.text) ? raw.text : "",
    bark: textList(raw.bark),
    gm: isText(raw.gm) ? raw.gm : "",
    fx: normalizeFx(raw.fx)
  };
}

/**
 * The events a shop can roll: its type's list, then its own. A shop event with the same id replaces the type's;
 * `mode: "replace"` ignores the type's list altogether.
 */
export function eventPool({ typeEvents = [], shopEvents = [], mode = "add" } = {}) {
  const list = mode === "replace" ? [...shopEvents] : [...typeEvents, ...shopEvents];
  const byId = new Map();
  for (const raw of list) {
    const e = normalizeEvent(raw);
    if (e) byId.set(e.id, e);
  }
  return [...byId.values()];
}

/** A weighted pick (rnd in [0, 1) for tests). `exclude` ids are skipped unless nothing else is left. */
export function pickEvent(pool, { rnd = Math.random(), exclude = [] } = {}) {
  if (!pool.length) return null;
  const rest = pool.filter(e => !exclude.includes(e.id));
  const list = rest.length ? rest : pool;
  const total = list.reduce((s, e) => s + e.weight, 0);
  let r = Math.min(Math.max(rnd, 0), 0.999999999) * total;
  for (const e of list) { r -= e.weight; if (r < 0) return e; }
  return list.at(-1);
}

/** A chance from the pack: a number from 0 to 1 (a percentage above 1 is read as one), or null. */
export function normalizeChance(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n > 1 ? Math.min(1, n / 100) : n;
}

/** What the live data keeps of the event that is running (everything the screens need, nothing for the GM only). */
export function eventSnapshot(e, at) {
  return { id: e.id, at: String(at ?? ""), icon: e.icon, title: e.title, text: e.text, bark: e.bark, fx: e.fx };
}

export function normalizeLiveEvent(e) {
  if (!e || typeof e !== "object" || !e.id) return null;
  return {
    id: String(e.id),
    at: String(e.at ?? ""),
    icon: /^fa-[a-z0-9-]+$/.test(String(e.icon ?? "")) ? e.icon : "",
    title: isText(e.title) ? e.title : "",
    text: isText(e.text) ? e.text : "",
    bark: textList(e.bark),
    fx: normalizeFx(e.fx)
  };
}

/** A price factor as the players read it: 0.8 → "−20%", 1.1 → "+10%". */
export const fxPercent = f => {
  const n = Math.round((Number(f) - 1) * 100);
  return `${n < 0 ? "−" : "+"}${Math.abs(n)}%`;
};

/** The effects in words for the GM (price × and shelves), e.g. "all ×1.2 · weapons ×0.9 · out: potions · DC -2". */
export function describeFx(fx) {
  const f = normalizeFx(fx);
  const num = n => `×${Number(n.toFixed(2))}`;
  const parts = [];
  if (f.priceFactor) parts.push(`all ${num(f.priceFactor)}`);
  for (const [k, v] of Object.entries(f.categoryFactors ?? {})) parts.push(`${k} ${num(v)}`);
  if (f.outOf) parts.push(`out: ${f.outOf.join(", ")}`);
  if (f.secretDcDelta) parts.push(`DC ${f.secretDcDelta > 0 ? "+" : ""}${f.secretDcDelta}`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* The campaign pack                                                   */
/* ------------------------------------------------------------------ */

/** Problems with a pack (an empty list means it can be imported). */
export function validatePack(pack) {
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) return ["The pack must be a JSON object."];
  const errors = [];
  const schema = pack.planarStorePack ?? pack.schema;
  if (schema != null && Number(schema) > PACK_SCHEMA) errors.push(`Unknown pack schema ${schema} (this version reads ${PACK_SCHEMA}).`);
  if (pack.shops != null && !Array.isArray(pack.shops)) errors.push("\"shops\" must be a list.");
  const ids = new Set();
  for (const [i, s] of (Array.isArray(pack.shops) ? pack.shops : []).entries()) {
    const label = s?.id ?? `#${i + 1}`;
    if (!s || typeof s !== "object") { errors.push(`Shop ${label} is not an object.`); continue; }
    if (!s.id || !/^[a-z0-9-]+$/.test(s.id)) errors.push(`Shop ${label}: "id" must be lower case letters, digits and dashes.`);
    else if (ids.has(s.id)) errors.push(`Shop ${s.id} appears twice.`);
    ids.add(s.id);
    if (!s.name) errors.push(`Shop ${label} has no name.`);
    if (!SHOP_TYPES.includes(s.type)) errors.push(`Shop ${label}: type "${s.type}" is not one of ${SHOP_TYPES.join(", ")}.`);
    if (s.secret?.dc != null && !Number.isFinite(Number(s.secret.dc))) errors.push(`Shop ${label}: secret.dc must be a number.`);
    for (const sk of s.secret?.skills ?? []) if (!/^[a-z]{3}$/.test(sk)) errors.push(`Shop ${label}: "${sk}" is not a dnd5e skill id (per, itm, dec…).`);
    if (s.owner?.actor != null && typeof s.owner.actor !== "string") errors.push(`Shop ${label}: owner.actor must be an actor's name or UUID.`);
    errors.push(...validateEvents(`Shop ${label}`, s));
  }
  for (const [k, v] of Object.entries(pack.types ?? {})) {
    if (!SHOP_TYPES.includes(k)) errors.push(`Unknown shop type "${k}".`);
    else errors.push(...validateEvents(`Type ${k}`, v));
  }
  return errors;
}

/** Problems with the `events`, `eventChance` and `eventsMode` of a shop or a type in a pack. */
function validateEvents(label, holder) {
  const errors = [];
  if (!holder || typeof holder !== "object") return errors;
  if (holder.eventChance != null && normalizeChance(holder.eventChance) == null) errors.push(`${label}: eventChance must be a number from 0 to 1 (or a percentage).`);
  if (holder.eventsMode != null && !["add", "replace"].includes(holder.eventsMode)) errors.push(`${label}: eventsMode must be "add" or "replace".`);
  if (holder.events == null) return errors;
  if (!Array.isArray(holder.events)) return [...errors, `${label}: "events" must be a list.`];
  const seen = new Set();
  for (const [i, e] of holder.events.entries()) {
    const id = e?.id ?? `#${i + 1}`;
    const at = `${label}: event ${id}`;
    if (!e || typeof e !== "object") { errors.push(`${at} is not an object.`); continue; }
    if (!/^[a-z0-9-]+$/.test(String(e.id ?? ""))) errors.push(`${at}: "id" must be lower case letters, digits and dashes.`);
    else if (seen.has(e.id)) errors.push(`${at} appears twice.`);
    seen.add(e.id);
    if (!isText(e.title) && !isText(e.text)) errors.push(`${at} needs a title or a text.`);
    if (e.weight != null && !(Number(e.weight) > 0)) errors.push(`${at}: weight must be more than 0.`);
    if (e.icon != null && !/^fa-[a-z0-9-]+$/.test(String(e.icon))) errors.push(`${at}: icon must be a Font Awesome name like fa-fire.`);
    const fx = e.fx;
    if (fx == null) continue;
    if (typeof fx !== "object" || Array.isArray(fx)) { errors.push(`${at}: fx must be an object.`); continue; }
    for (const k of Object.keys(fx)) if (!["priceFactor", "categoryFactors", "outOf", "secretDcDelta"].includes(k)) errors.push(`${at}: unknown effect "${k}".`);
    if (fx.priceFactor != null && !(Number(fx.priceFactor) > 0)) errors.push(`${at}: priceFactor must be more than 0.`);
    for (const [c, v] of Object.entries(fx.categoryFactors ?? {})) {
      if (!CATEGORIES.includes(c)) errors.push(`${at}: "${c}" is not a shelf (${CATEGORIES.join(", ")}).`);
      else if (!(Number(v) > 0)) errors.push(`${at}: the factor for ${c} must be more than 0.`);
    }
    if (fx.outOf != null && !Array.isArray(fx.outOf)) errors.push(`${at}: outOf must be a list of shelves.`);
    for (const c of Array.isArray(fx.outOf) ? fx.outOf : []) if (!CATEGORIES.includes(c)) errors.push(`${at}: "${c}" is not a shelf (${CATEGORIES.join(", ")}).`);
    if (fx.secretDcDelta != null && !Number.isFinite(Number(fx.secretDcDelta))) errors.push(`${at}: secretDcDelta must be a number.`);
  }
  return errors;
}

const DEFAULT_SECRET = { skills: ["per", "itm", "dec"], dc: 15, whisperRoll: true };

/** A shop definition with every field filled: pack shop < hand-made shop < the GM's edits. */
export function shopDef(id, packShop, shopState) {
  const base = { ...(packShop ?? {}), ...(shopState?.custom ?? {}), ...(shopState?.edit ?? {}) };
  const secret = { ...DEFAULT_SECRET, ...(packShop?.secret ?? {}), ...(shopState?.custom?.secret ?? {}), ...(shopState?.edit?.secret ?? {}) };
  secret.skills = (Array.isArray(secret.skills) ? secret.skills : []).filter(s => /^[a-z]{3}$/.test(s));
  if (!secret.skills.length) secret.skills = [...DEFAULT_SECRET.skills];
  secret.dc = Math.max(1, Math.trunc(Number(secret.dc) || DEFAULT_SECRET.dc));
  const m = Number(base.priceMultiplier);
  return {
    id,
    type: SHOP_TYPES.includes(base.type) ? base.type : "general",
    name: base.name ?? id,
    nameEn: base.nameEn ?? "",
    place: base.place ?? "",
    img: base.img ?? "",
    flair: base.flair ?? "",
    description: base.description ?? "",
    source: base.source ?? "",
    owner: applyOwnerSnap({ name: "", nameEn: "", img: "", role: "", about: "", gmNotes: "", actor: "", ...(packShop?.owner ?? {}), ...(shopState?.custom?.owner ?? {}), ...(shopState?.edit?.owner ?? {}) }, shopState?.ownerSnap),
    events: Array.isArray(base.events) ? base.events : [],
    eventsMode: base.eventsMode === "replace" ? "replace" : "add",
    eventChance: normalizeChance(base.eventChance),
    barks: { ...(packShop?.barks ?? {}), ...(shopState?.custom?.barks ?? {}), ...(shopState?.edit?.barks ?? {}) },
    secret,
    priceMultiplier: Number.isFinite(m) && m > 0 ? m : 1,
    faction: base.faction ?? "",
    atlasPlace: base.atlasPlace ?? "",
    soundscape: base.soundscape ?? "",
    sound: base.sound ?? "",
    fromPack: !!packShop,
    custom: !!shopState?.custom
  };
}

/** Find a shop by id or by name (either language, accents ignored, or one word of it). */
export function findShop(defs, query) {
  const q = fold(query);
  if (!q) return null;
  const names = d => [d.id, localText(d.name, "el"), localText(d.name, "en"), d.nameEn].filter(Boolean).map(fold);
  return defs.find(d => d.id === query || names(d).includes(q))
    ?? defs.find(d => names(d).some(n => n.split(" ").includes(q)))
    ?? defs.find(d => names(d).some(n => n.includes(q)))
    ?? null;
}

/** `@Shop[Το Οπλοστάσιο | all]` → { target, verb }. Verbs: open (the console), all (everyone online), close. */
export function parseShopArgs(args) {
  const [target, verb] = String(args ?? "").split("|").map(s => s.trim());
  const v = fold(verb);
  return { target: target ?? "", verb: ["all", "close"].includes(v) ? v : "open" };
}

/* ------------------------------------------------------------------ */
/* The ledger                                                          */
/* ------------------------------------------------------------------ */

export function normalizeLedger(data) {
  const entries = Array.isArray(data?.entries) ? data.entries.filter(e => e && typeof e === "object" && e.id) : [];
  return { schema: STATE_SCHEMA, entries: entries.slice(-MAX_LEDGER) };
}

/** Add a line to the ledger (capped). */
export function addEntry(ledger, entry) {
  const l = normalizeLedger(ledger);
  l.entries.push(entry);
  l.entries = l.entries.slice(-MAX_LEDGER);
  return l;
}

/** The ledger as a Markdown page, newest first. L holds the labels. */
export function pageMarkdown(ledger, L) {
  const cell = s => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const when = d => String(d ?? "").replace("T", " ").slice(0, 16);
  const rows = normalizeLedger(ledger).entries.slice().reverse();
  const out = ["---", "tags: [store]", "---", `# ${L.title}`, "", L.intro, ""];
  if (!rows.length) return [...out, L.none, ""].join("\n");
  out.push(`| ${L.cols.when} | ${L.cols.session} | ${L.cols.hero} | ${L.cols.shop} | ${L.cols.what} | ${L.cols.paid} |`, "|---|---|---|---|---|---|");
  for (const e of rows) {
    let what;
    if (e.kind === "secret") what = `${L.secret} (${e.skill} ${e.total} vs DC ${e.dc}) ${e.result === "open" ? "✓" : "✗"}`;
    else if (e.kind === "gm") what = `${L.gm}: ${e.result === "open" ? "✓" : "✗"}`;
    else if (e.kind === "event") what = `${L.event ?? "event"}: ${e.title || e.eventId}`;
    else what = (e.lines ?? []).map(l => `${l.n > 1 ? `${l.n}× ` : ""}${l.name}`).join(", ");
    const paid = e.kind === "buy" ? `${priceText(e.total)}${e.payer === "party" ? ` ${L.party}` : ""}` : "";
    out.push(`| ${when(e.date)} | ${cell(e.session)} | ${cell(e.actorName)} | ${cell(e.shopName)} | ${e.undone ? "~~" : ""}${cell(what)}${e.undone ? `~~ ${L.undone}` : ""} | ${paid} |`);
  }
  out.push("");
  return out.join("\n");
}
