// The GM's side of everything that changes the world: opening and closing shops, buying (stock, coins, items on
// the sheet, all or nothing), undo, the secret shelf, and the shops themselves. Runs on the active GM's client,
// one action at a time (serial), so two players buying the last potion at once can't both get it.
import { MODULE_ID } from "./constants.mjs";
import { t, warn, info } from "./i18n.mjs";
import { setting } from "./settings.mjs";
import {
  serial, live, shop, shops, stockOf, writeShop, writeLive, writeLedger, ledger, ctx, heroOf, resolveUsers, mutateShop, local
} from "./state.mjs";
import {
  checkBasket, moveStock, spendCoins, cleanCoins, coinValue, coinsText, diffCoins, addCoins, toCoins, priceText,
  openFor, leave as leaveLive, secretResult, addEntry, slug, SHOP_TYPES, SECRET_SKILLS
} from "./util.mjs";

const atlas = () => {
  const m = game.modules.get("planar-atlas");
  return m?.active && m.api?.pay && m.api?.purse && m.api?.company?.() ? m.api : null;
};
export const partyPurseAvailable = () => !!(setting("partyPurse") && atlas());
export const partyPurse = () => atlas()?.purse?.() ?? null;

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

/* ---------------- opening and closing ---------------- */

/** Open a shop on these players' screens (hero names, user ids, actors, or "all" for everyone online). */
export async function openShop(shopId, who = "all") {
  if (!game.user.isGM) return warn("Notify.OnlyGM");
  const def = shop(shopId);
  if (!def) return warn("Notify.NoShop", { name: shopId });
  const { userIds, unknown } = resolveUsers(who);
  if (unknown.length) warn("Notify.Unknown", { names: unknown.join(", ") });
  if (!userIds.length) return warn("Notify.NoPlayers");
  const wasOpen = !!live().open[shopId];
  await serial(async () => {
    await writeLive(l => openFor(l, shopId, userIds, { visit: foundry.utils.randomID(), since: new Date().toISOString() }));
    if (!wasOpen) await writeShop(shopId, s => { s.visits += 1; });
  });
  if (!wasOpen && setting("soundscapes") && def.soundscape) {
    try { await globalThis.PlanarSoundboard?.activate?.(def.soundscape); }
    catch (err) { console.warn(`${MODULE_ID} | soundscape`, err); }
  }
  const names = userIds.map(id => heroOf(id)?.name ?? game.users.get(id)?.name).filter(Boolean);
  const offline = userIds.filter(id => !game.users.get(id)?.active).map(id => game.users.get(id)?.name);
  info("Notify.Opened", { shop: local(def.name), names: names.join(", ") });
  if (offline.length) info("Notify.Offline", { names: offline.join(", ") });
  return userIds;
}

/** Close a shop for everyone, or send some players out. */
export async function closeShop(shopId, who = null) {
  if (!game.user.isGM) return warn("Notify.OnlyGM");
  await serial(() => writeLive(l => {
    if (!who) { delete l.open[shopId]; return l; }
    let next = l;
    for (const id of resolveUsers(who).userIds) next = leaveLive(next, shopId, id);
    return next;
  }));
  info("Notify.Closed", { shop: local(shop(shopId)?.name ?? shopId) });
}

/** A player clicked Leave (only the GM opens a shop again). */
export function onLeave(userId, { shopId }) {
  return serial(async () => {
    await writeLive(l => leaveLive(l, shopId, userId));
    return ok();
  });
}

/* ---------------- buying ---------------- */

/** Can this user act in this shop, and as which hero? The GM may act for any hero (preview / by hand). */
function who(userId, shopId, actorId) {
  const user = game.users.get(userId);
  if (!user) return fail("NoUser");
  const o = live().open[shopId];
  if (!user.isGM && !o?.users.includes(userId)) return fail("NotInside");
  const actor = user.isGM && actorId ? game.actors.get(actorId) : heroOf(user);
  if (!actor) return fail("NoHero");
  return { ok: true, user, actor, open: o };
}

/** Same item already on the sheet? Then the purchase stacks onto it (armour and containers never stack). */
function stackTarget(actor, src, uuid) {
  if (["equipment", "container", "backpack"].includes(src.type)) return null;
  return actor.items.find(i => i.type === src.type && (
    i.getFlag?.(MODULE_ID, "source") === uuid || i._stats?.compendiumSource === uuid || i.flags?.core?.sourceId === uuid || i.name === src.name
  )) ?? null;
}

/**
 * Buy a basket (GM side). data = { shopId, basket: [{rowId, n}], party: bool, actorId? (GM only) }.
 * All or nothing: stock, coins and items move together, or nothing does.
 */
export function buy(userId, data = {}) {
  return serial(async () => {
    const { shopId } = data;
    const def = shop(shopId);
    if (!def) return fail("NoShop");
    const w = who(userId, shopId, data.actorId);
    if (!w.ok) return w;
    const { actor } = w;
    const secretOpen = w.open?.secret?.[actor.id] === "open" || (w.user.isGM && !!data.preview);
    const chk = checkBasket(stockOf(shopId), data.basket, { secretOpen, multiplier: def.priceMultiplier });
    if (chk.errors.length) return fail(chk.errors[0].code, { name: chk.errors[0].name ?? "", left: chk.errors[0].left ?? 0 });

    const party = !!data.party && partyPurseAvailable();
    let before = null, after = null;
    if (party) {
      if (coinValue(partyPurse()) < chk.total) return fail("TooPoorParty", { have: coinsText(partyPurse()) });
    } else {
      before = cleanCoins(actor.system?.currency);
      after = spendCoins(before, chk.total);
      if (!after) return fail("TooPoor", { have: coinsText(before) });
    }

    const created = [], stacked = [];
    try {
      for (const line of chk.lines) {
        const src = await fromUuid(line.uuid).catch(() => null);
        if (!src) throw Object.assign(new Error("gone"), { code: "ItemGone", item: line.name });
        const qty = line.bundle * line.n;
        const target = stackTarget(actor, src, line.uuid);
        if (target) {
          const from = Number(target.system?.quantity) || 0;
          await target.update({ "system.quantity": from + qty });
          stacked.push({ id: target.id, add: qty });
        } else {
          const itemData = src.toObject();
          delete itemData._id;
          itemData.system ??= {};
          itemData.system.quantity = qty;
          itemData.flags ??= {};
          itemData.flags[MODULE_ID] = { ...(itemData.flags[MODULE_ID] ?? {}), source: line.uuid };
          const [doc] = await actor.createEmbeddedDocuments("Item", [itemData]);
          if (doc) created.push({ id: doc.id, qty });
        }
      }
      if (party) {
        const res = await atlas().pay(toCoins(chk.total), t("Ledger.PaidAt", { shop: local(def.name), hero: actor.name }), "out");
        if (!res?.ok) throw Object.assign(new Error("purse"), { code: "TooPoorParty" });
      } else {
        await actor.update({ "system.currency": after });
      }
      await writeShop(shopId, s => { s.stock = moveStock(s.stock, chk.lines, -1); });
    } catch (err) {
      await takeBack(actor, created, stacked);
      if (!err.code) console.error(`${MODULE_ID} | buy`, err);
      return fail(err.code ?? "Failed", { name: err.item ?? "" });
    }

    const entry = {
      ...ctx(), kind: "buy", shopId, shopName: local(def.name), userId, actorId: actor.id, actorName: actor.name,
      lines: chk.lines.map(l => ({ rowId: l.rowId, name: l.name, n: l.n, each: l.each, bundle: l.bundle })),
      total: chk.total, payer: party ? "party" : "hero", paid: party ? null : diffCoins(after, before), created, stacked, undone: false
    };
    await writeLedger(l => addEntry(l, entry));
    if (!game.users.get(userId)?.isGM) info("Notify.Bought", { hero: actor.name, what: entry.lines.map(l => `${l.n > 1 ? `${l.n}× ` : ""}${l.name}`).join(", "), price: priceText(chk.total) });
    return ok({ entryId: entry.id, total: chk.total, lines: entry.lines, purse: party ? null : after });
  });
}

/**
 * Take items back off a sheet (rollback and undo). Only what this purchase added is taken: if more of the same
 * item was bought later and stacked onto it, that stays.
 */
async function takeBack(actor, created = [], stacked = []) {
  const all = [...created.map(c => (typeof c === "string" ? { id: c, add: null } : { id: c.id, add: c.qty })), ...stacked];
  for (const s of all) {
    const item = actor.items.get(s.id);
    if (!item) continue;
    const q = s.add == null ? 0 : (Number(item.system?.quantity) || 0) - s.add;
    await (q > 0 ? item.update({ "system.quantity": q }) : item.delete()).catch(err => console.warn(`${MODULE_ID} | take back`, err));
  }
}

/** Undo a purchase (GM): items off the sheet, coins back, stock back. */
export function undo(entryId) {
  if (!game.user.isGM) return warn("Notify.OnlyGM");
  return serial(async () => {
    const entry = ledger().entries.find(e => e.id === entryId);
    if (!entry || entry.kind !== "buy" || entry.undone) return fail("NoEntry");
    const actor = game.actors.get(entry.actorId);
    if (actor) {
      await takeBack(actor, entry.created, entry.stacked);
      if (entry.payer === "party" && atlas()) {
        await atlas().pay(toCoins(entry.total), t("Ledger.UndoAt", { shop: entry.shopName, hero: entry.actorName }), "in");
      } else {
        const cur = cleanCoins(actor.system?.currency);
        let back = entry.paid ? addCoins(cur, entry.paid) : null;
        if (!back || Object.values(back).some(v => v < 0)) back = addCoins(cur, toCoins(entry.total));
        await actor.update({ "system.currency": back });
      }
    }
    if (shop(entry.shopId)) await writeShop(entry.shopId, s => { s.stock = moveStock(s.stock, entry.lines, +1); });
    await writeLedger(l => { const e = l.entries.find(x => x.id === entryId); if (e) e.undone = true; return l; });
    info("Notify.Undone", { hero: entry.actorName, price: priceText(entry.total) });
    return ok();
  });
}

/* ---------------- the secret shelf ---------------- */

/** A player rolled to be shown the secret shelf (data = { shopId, skill, total }). Once per visit per hero. */
export function onSecret(userId, data = {}) {
  return serial(async () => {
    const def = shop(data.shopId);
    if (!def) return fail("NoShop");
    const w = who(userId, data.shopId, data.actorId);
    if (!w.ok) return w;
    if (!w.open) return fail("NotInside");
    const now = w.open.secret?.[w.actor.id];
    if (now) return ok({ result: now, again: true });
    const skill = SECRET_SKILLS.includes(data.skill) || def.secret.skills.includes(data.skill) ? data.skill : null;
    if (!skill) return fail("BadSkill");
    const total = Math.trunc(Number(data.total));
    if (!Number.isFinite(total)) return fail("BadRoll");
    const result = secretResult(total, def.secret.dc);
    await writeLive(l => { if (l.open[data.shopId]) l.open[data.shopId].secret[w.actor.id] = result; return l; });
    await writeLedger(l => addEntry(l, {
      ...ctx(), kind: "secret", shopId: def.id, shopName: local(def.name), userId, actorId: w.actor.id, actorName: w.actor.name,
      skill, total, dc: def.secret.dc, result
    }));
    info(result === "open" ? "Notify.SecretOpen" : "Notify.SecretLocked", { hero: w.actor.name, shop: local(def.name), total, dc: def.secret.dc });
    return ok({ result });
  });
}

/** The GM opens or locks the secret shelf for a hero by hand (a bribe, a password, a faction rank). null = forget. */
export function setSecret(shopId, actorId, value) {
  if (!game.user.isGM) return warn("Notify.OnlyGM");
  return serial(async () => {
    const actor = game.actors.get(actorId);
    await writeLive(l => {
      const o = l.open[shopId];
      if (!o) return l;
      if (value === "open" || value === "locked") o.secret[actorId] = value;
      else delete o.secret[actorId];
      return l;
    });
    if (value === "open" || value === "locked") {
      await writeLedger(l => addEntry(l, {
        ...ctx(), kind: "gm", shopId, shopName: local(shop(shopId)?.name ?? shopId), actorId, actorName: actor?.name ?? "?", result: value
      }));
    }
  });
}

/* ---------------- the shops themselves ---------------- */

/** A new hand-made shop (GM). Returns its id. */
export async function createShop({ name, type = "general" } = {}) {
  if (!game.user.isGM) return warn("Notify.OnlyGM");
  const clean = String(name ?? "").trim();
  if (!clean) return warn("Notify.NoName");
  const taken = new Set(shops().map(s => s.id));
  let id = slug(clean), i = 2;
  while (taken.has(id)) id = `${slug(clean)}-${i++}`;
  await mutateShop(id, s => { s.custom = { name: clean, type: SHOP_TYPES.includes(type) ? type : "general" }; });
  return id;
}

/** Change a shop's fields (GM). Nested owner / secret / barks are merged. Stored as edits over the pack. */
export function editShop(id, patch = {}) {
  return mutateShop(id, s => {
    const e = s.edit ?? {};
    for (const [k, v] of Object.entries(patch)) {
      if (["owner", "secret", "barks"].includes(k) && v && typeof v === "object") e[k] = { ...(e[k] ?? {}), ...v };
      else e[k] = v;
    }
    s.edit = e;
  });
}

/** Forget the GM's edits (back to the pack's text). Stock stays. */
export const resetEdits = id => mutateShop(id, s => { s.edit = {}; });

/** Delete a hand-made shop, or empty a pack shop's stock and edits (GM). */
export async function deleteShop(id) {
  if (!game.user.isGM) return warn("Notify.OnlyGM");
  await serial(async () => {
    await writeLive(l => { delete l.open[id]; return l; });
    const st = foundry.utils.deepClone(game.settings.get(MODULE_ID, "state"));
    if (st?.shops) delete st.shops[id];
    await game.settings.set(MODULE_ID, "state", st);
  });
}
