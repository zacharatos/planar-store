// World data: the shops (shipped pack + imported pack + hand-made shops + the GM's edits), their stock, who is
// inside which shop, and the ledger. Every client reads; only the active GM's client writes, one write at a time.
import { MODULE_ID, DEFAULT_PACK_PATH } from "./constants.mjs";
import { setting, setSetting } from "./settings.mjs";
import {
  normalizeState, normalizeLive, normalizeLedger, shopDef, emptyShopState, pickLanguage, localText, findShop, SHOP_TYPES
} from "./util.mjs";

const clone = v => foundry.utils.deepClone(v);
let defaultPack = null;
let afterLedger = null;

/** One write at a time: a promise queue. Never call serial() from inside a serial() block. */
let queue = Promise.resolve();
export function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

export const isActiveGM = () => !!game.users.activeGM?.isSelf;

/** Called after every saved change to the ledger (the page sync hooks in here). */
export const onLedgerWrite = fn => { afterLedger = fn; };

/** Load the generic pack shipped with the module (once). */
export async function loadDefaultPack() {
  if (defaultPack) return defaultPack;
  try { defaultPack = await (await fetch(DEFAULT_PACK_PATH)).json(); }
  catch (err) { console.error(`${MODULE_ID} | default pack failed to load`, err); defaultPack = { planarStorePack: 1, types: {}, shops: [] }; }
  return defaultPack;
}

/** The imported campaign pack, or the shipped one when nothing is imported. */
export const importedPack = () => setting("pack");
export const activePack = () => importedPack() ?? defaultPack ?? { types: {}, shops: [] };

/* ---------------- language ---------------- */

/** This user's language for the module: their choice, the world default, or Foundry's. */
export const textLang = () => pickLanguage(setting("language"), setting("textLanguage"), game.i18n.lang);
export const toggleLanguage = () => setSetting("language", textLang() === "el" ? "en" : "el");
export const local = value => localText(value, textLang());

/** A shop type's name and sound (pack first, then the shipped names). */
export function typeInfo(type) {
  const t = SHOP_TYPES.includes(type) ? type : "general";
  const p = activePack().types?.[t] ?? {};
  const d = defaultPack?.types?.[t] ?? {};
  return { id: t, name: local(p.name ?? d.name) || t, sound: p.sound || d.sound || "", barks: { ...(d.barks ?? {}), ...(p.barks ?? {}) } };
}

/* ---------------- shops ---------------- */

export const state = () => normalizeState(setting("state"));
export const live = () => normalizeLive(setting("live"));
export const ledger = () => normalizeLedger(setting("ledger"));
export const session = () => setting("session") ?? "";

/** Every shop, fully filled in: pack shops first, then hand-made ones. */
export function shops() {
  const st = state();
  const pack = Array.isArray(activePack().shops) ? activePack().shops : [];
  const out = pack.filter(s => s?.id).map(s => shopDef(s.id, s, st.shops[s.id]));
  for (const [id, s] of Object.entries(st.shops)) if (s.custom && !out.some(d => d.id === id)) out.push(shopDef(id, null, s));
  return out;
}
export const shop = id => shops().find(s => s.id === id) ?? null;
export const resolveShop = query => (typeof query === "object" && query?.id ? shop(query.id) : shop(query) ?? findShop(shops(), query));
export const stockOf = id => state().shops[id]?.stock ?? [];

/** Change the shop data on the GM's client (inside serial()). fn(shopState, wholeState) changes a copy. */
export function mutateShop(id, fn) {
  if (!game.user.isGM) throw new Error("Only the GM changes the shops.");
  return serial(() => writeShop(id, fn));
}
/** The same, for code that is already inside serial(). */
export async function writeShop(id, fn) {
  const st = clone(state());
  st.shops[id] ??= emptyShopState();
  const result = await fn(st.shops[id], st);
  await setSetting("state", st);
  return result;
}

/** Change who is inside which shop (GM, inside serial() or on its own). */
export async function writeLive(fn) {
  const next = fn(clone(live()));
  await setSetting("live", normalizeLive(next));
  return next;
}

/** Add to / change the ledger (GM, inside serial()). */
export async function writeLedger(fn) {
  const next = fn(clone(ledger()));
  await setSetting("ledger", normalizeLedger(next));
  afterLedger?.();
  return next;
}

/** Ids, dates and session, from Foundry. */
export const ctx = (extra = {}) => ({ id: foundry.utils.randomID(), date: new Date().toISOString(), session: session(), by: game.user.name, ...extra });

/* ---------------- heroes ---------------- */

const OWNER = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

/** Player characters with the non-GM users who own them. */
export function heroes() {
  return game.actors.filter(a => a.type === "character" && a.hasPlayerOwner).map(a => ({
    id: a.id, name: a.name, img: a.img,
    users: game.users.filter(u => !u.isGM && (u.character?.id === a.id || a.testUserPermission(u, OWNER()))).map(u => ({ id: u.id, name: u.name, active: !!u.active }))
  })).filter(h => h.users.length);
}

/** The hero a user shops as: their assigned character, else the first character they own. */
export function heroOf(userOrId) {
  const user = typeof userOrId === "string" ? game.users.get(userOrId) : userOrId;
  if (!user) return null;
  if (user.character?.type === "character") return user.character;
  return game.actors.find(a => a.type === "character" && a.testUserPermission(user, OWNER())) ?? null;
}

/** The users behind a list of hero names / actor ids / user ids / names. Unknown names are returned too. */
export function resolveUsers(list) {
  const items = (Array.isArray(list) ? list : [list]).filter(x => x != null && x !== "");
  const hs = heroes();
  const ids = new Set();
  const unknown = [];
  const fold = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  for (const item of items) {
    if (item === "all") { for (const h of hs) for (const u of h.users) if (u.active) ids.add(u.id); continue; }
    const id = typeof item === "string" ? item : item?.id;
    const user = game.users.get(id);
    if (user && !user.isGM) { ids.add(user.id); continue; }
    const q = fold(typeof item === "string" ? item : item?.name);
    const hero = hs.find(h => h.id === id) ?? hs.find(h => fold(h.name) === q) ?? hs.find(h => fold(h.name).split(" ").includes(q));
    if (hero) { for (const u of hero.users) ids.add(u.id); continue; }
    const byName = game.users.find(u => !u.isGM && fold(u.name) === q);
    if (byName) { ids.add(byName.id); continue; }
    unknown.push(typeof item === "string" ? item : item?.name ?? String(id));
  }
  return { userIds: [...ids], unknown };
}

/* ---------------- pack ---------------- */

/** Import a pack (object). Returns the problems found; saves only if there are none. Stock is never touched. */
export async function importPack(data, validate) {
  const errors = validate(data);
  if (errors.length) return errors;
  await setSetting("pack", data);
  return [];
}
export const resetPack = () => setSetting("pack", null);
