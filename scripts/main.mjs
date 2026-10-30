import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import {
  loadDefaultPack, onLedgerWrite, textLang, shops, shop, stockOf, live, ledger, resolveShop, importedPack, eventsOf, syncOwners, syncOwnersSoon, isActiveGM
} from "./state.mjs";
import { loadDictionaries, setLanguageSource, warn } from "./i18n.mjs";
import { registerSocket } from "./rpc.mjs";
import * as trade from "./trade.mjs";
import * as stock from "./stock.mjs";
import { StoreConsole } from "./console.mjs";
import { ShopScreen } from "./shop.mjs";
import { schedulePageSync, syncPage, markdown } from "./page.mjs";
import { registerEnrichers, listenForClicks } from "./enrich.mjs";

let ready = false;
const refresh = which => {
  if (!ready) return;
  if (which === "pack") syncOwnersSoon();   // a new pack may link its owners to other actors
  StoreConsole.instance?.refreshSoon();
  ShopScreen.sync();
};

const byName = q => resolveShop(q)?.id ?? null;

Hooks.once("init", () => {
  registerSettings({ onChange: refresh });
  registerEnrichers();
  game.keybindings.register(MODULE_ID, "open", {
    name: "PLANAR_STORE.Keybinding.Open",
    hint: "PLANAR_STORE.Keybinding.OpenHint",
    editable: [{ key: "KeyS", modifiers: ["Alt"] }],
    restricted: true,
    onDown: () => { StoreConsole.open(); return true; }
  });
});

Hooks.once("ready", async () => {
  setLanguageSource(textLang);
  await Promise.all([loadDefaultPack(), loadDictionaries()]);
  onLedgerWrite(schedulePageSync);
  registerSocket({
    buy: (userId, data) => trade.buy(userId, data),
    secret: (userId, data) => trade.onSecret(userId, data),
    leave: (userId, data) => trade.onLeave(userId, data)
  });
  listenForClicks();
  if (isActiveGM()) syncOwners().catch(err => console.warn(`${MODULE_ID} | owner sync`, err));
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = {
    /** The GM console. */
    console: opts => StoreConsole.open(opts),
    /** Open a shop (id or name) for players: hero names, user ids or "all" (default). */
    open: (shopRef, who = "all") => { const id = byName(shopRef); return id ? trade.openShop(id, who) : warn("Notify.NoShop", { name: shopRef }); },
    /** Close a shop for everyone, or send some players out. */
    close: (shopRef, who = null) => { const id = byName(shopRef); return id ? trade.closeShop(id, who) : warn("Notify.NoShop", { name: shopRef }); },
    /** The GM's preview of a shop as a hero sees it. */
    preview: (shopRef, actorId) => { const id = byName(shopRef); return id ? ShopScreen.preview(id, actorId) : warn("Notify.NoShop", { name: shopRef }); },
    shops: () => shops(),
    shop: shopRef => shop(byName(shopRef)),
    stock: shopRef => stockOf(byName(shopRef)),
    /** Add items (documents) to a shop's stock; hidden = the secret shelf. */
    addItems: (shopRef, items, opts) => stock.addItems(byName(shopRef), [].concat(items), opts),
    restock: shopRef => stock.restock(byName(shopRef)),
    setSecret: (shopRef, actorId, value) => trade.setSecret(byName(shopRef), actorId, value),
    /** Make something happen in an open shop: a random event of its type, or the one with this id. */
    event: (shopRef, eventId = null) => { const id = byName(shopRef); return id ? trade.rollEvent(id, { eventId }) : warn("Notify.NoShop", { name: shopRef }); },
    /** The events a shop can roll (cleaned), and ending the one that is running. */
    events: shopRef => eventsOf(shop(byName(shopRef))),
    clearEvent: shopRef => { const id = byName(shopRef); return id ? trade.clearEvent(id) : warn("Notify.NoShop", { name: shopRef }); },
    undo: entryId => trade.undo(entryId),
    live: () => live(),
    ledger: () => ledger(),
    pack: () => importedPack(),
    syncPage: () => syncPage(),
    markdown: () => markdown()
  };
  ready = true;
  // A player who reloads while a shop is open for them walks straight back in.
  ShopScreen.sync();
});

// Toolbar button for the GM.
Hooks.on("getSceneControlButtons", controls => {
  if (!controls?.tokens?.tools || !game.user?.isGM) return;
  controls.tokens.tools[MODULE_ID] = {
    name: MODULE_ID,
    title: "PLANAR_STORE.ToolTitle",
    icon: "fa-solid fa-store",
    order: 64,
    button: true,
    visible: true,
    onChange: () => StoreConsole.open()
  };
});

// Coins on a sheet changed, heroes renamed, players came and went: the windows redraw.
Hooks.on("updateActor", (actor, change) => {
  if (change?.system?.currency || change?.name || change?.img || change?.ownership) refresh();
  if (change?.name || change?.img) syncOwnersSoon();   // an owner's NPC sheet was renamed or got a new portrait
});
Hooks.on("createActor", () => syncOwnersSoon());     // a shop may have been waiting for this NPC
Hooks.on("deleteActor", () => syncOwnersSoon());
Hooks.on("userConnected", refresh);
