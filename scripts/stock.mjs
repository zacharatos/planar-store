// Stock: items dragged in from the Items sidebar, any compendium (Plutonium's imports included), an actor's sheet,
// or a whole Items folder. Each row keeps a small snapshot (name, picture, price, a short description) so the
// players' screens can show it even though they can't open the GM's world items.
import { warn, info } from "./i18n.mjs";
import { makeRow, normalizeRow, restockRows, trimHTML } from "./util.mjs";
import { mutateShop, stockOf } from "./state.mjs";

/** The snapshot a stock row needs, from a dnd5e Item document. */
export function snapshot(item) {
  const sys = item.system ?? {};
  return {
    uuid: item.uuid,
    name: item.name,
    img: item.img,
    type: item.type,
    subtype: sys.type?.value ?? "",
    rarity: sys.rarity ?? "",
    value: sys.price?.value ?? 0,
    denomination: sys.price?.denomination ?? "gp",
    quantity: sys.quantity ?? 1,
    desc: trimHTML(sys.description?.value ?? "")
  };
}

/** The items behind a drop: one Item, or every Item in a dropped Items folder. */
export async function itemsFromDrop(data) {
  if (!data) return [];
  if (data.type === "Item") {
    const item = data.uuid ? await fromUuid(data.uuid) : null;
    return item ? [item] : [];
  }
  if (data.type === "Folder") {
    const folder = data.uuid ? await fromUuid(data.uuid) : null;
    if (folder?.type !== "Item") return [];
    return [...(folder.contents ?? [])];
  }
  return [];
}

/** Add items to a shop's stock (GM). Items already on the shelf get +1 instead of a second row. */
export async function addItems(shopId, items, { hidden = false } = {}) {
  const list = items.filter(i => i?.documentName === "Item" || i?.uuid);
  if (!list.length) return warn("Stock.NotAnItem");
  const added = await mutateShop(shopId, s => {
    let n = 0;
    for (const item of list) {
      const same = s.stock.find(r => r.uuid === item.uuid && r.hidden === hidden);
      if (same) { if (same.qty != null) same.qty += 1; continue; }
      s.stock.push(makeRow({ ...snapshot(item), hidden }, foundry.utils.randomID()));
      n++;
    }
    return n;
  });
  info("Stock.Added", { n: list.length });
  return added;
}

/** Change one row (GM): qty, restock, override, hidden. */
export function updateRow(shopId, rowId, patch) {
  return mutateShop(shopId, s => {
    const i = s.stock.findIndex(r => r.id === rowId);
    if (i < 0) return false;
    s.stock[i] = normalizeRow({ ...s.stock[i], ...patch });
    return true;
  });
}

export function removeRow(shopId, rowId) {
  return mutateShop(shopId, s => { s.stock = s.stock.filter(r => r.id !== rowId); });
}

/** Re-read a row's item (its price or description changed in the world). */
export async function refreshRow(shopId, rowId) {
  const row = stockOf(shopId).find(r => r.id === rowId);
  const item = row?.uuid ? await fromUuid(row.uuid).catch(() => null) : null;
  if (!item) return warn("Stock.Gone", { name: row?.name ?? "?" });
  const fresh = makeRow({ ...snapshot(item), hidden: row.hidden }, row.id);
  return updateRow(shopId, rowId, { ...fresh, qty: row.qty, restock: row.restock, override: row.override });
}

/** Every row with a restock number goes back up to it. */
export async function restock(shopId) {
  await mutateShop(shopId, s => { s.stock = restockRows(s.stock); });
  info("Stock.Restocked");
}

/** Open the item's own sheet (GM). */
export async function openItem(uuid) {
  const item = uuid ? await fromUuid(uuid).catch(() => null) : null;
  if (!item) return warn("Stock.Gone", { name: uuid });
  item.sheet?.render({ force: true });
}

export const rowLabel = row => `${row.name}${row.bundle > 1 ? ` (${row.bundle})` : ""}`;
