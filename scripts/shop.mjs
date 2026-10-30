// The shop screen: a shop takes over the player's screen (plain DOM + CSS, like the Planar Whispers reveal, so
// it sits above the interface). Windows Foundry opens while it is up (the roll dialog, a sheet) are lifted above it
// (watchWindows). Place, owner, shelves, the secret shelf, the random event of the visit and a basket. Players only ever ask the
// GM's client (rpc.ask); stock and "who is inside" come back through the world settings, so every open screen
// updates by itself. Only the GM opens a shop; the player closes it with Leave.
import { MODULE_ID, TYPE_ICON, CATEGORY_ICON, DEFAULT_SOUND } from "./constants.mjs";
import { t, language } from "./i18n.mjs";
import { setting } from "./settings.mjs";
import { shop, stockOf, live, heroOf, typeInfo, local, state } from "./state.mjs";
import {
  escapeHTML as esc, textToHTML, rowPrice, priceText, coinsText, coinValue, cleanCoins, visibleRows, checkBasket, pickLine,
  shopOfUser, CATEGORIES, eventRows, fxPercent
} from "./util.mjs";
import { ask } from "./rpc.mjs";
import { partyPurseAvailable, partyPurse } from "./trade.mjs";

const SKILL_LABEL = id => globalThis.CONFIG?.DND5E?.skills?.[id]?.label ?? id;
const left = new Set(); // visits this browser has walked out of (so a reload doesn't pull the player back in)
try { for (const v of JSON.parse(sessionStorage.getItem(`${MODULE_ID}.left`) ?? "[]")) left.add(v); } catch { /* private mode */ }
const rememberLeft = visit => {
  left.add(visit);
  try { sessionStorage.setItem(`${MODULE_ID}.left`, JSON.stringify([...left].slice(-50))); } catch { /* private mode */ }
};

export class ShopScreen {
  static current = null;

  /**
   * Open (or follow) the shop this user should see. Called on ready and whenever "live", "state" or "pack" change.
   * Players follow the world setting; the GM only sees a screen he opened as a preview.
   */
  static sync() {
    const cur = ShopScreen.current;
    if (game.user.isGM) { cur?.refresh(); return; }
    const l = live();
    const sid = shopOfUser(l, game.user.id);
    const visit = sid ? l.open[sid]?.visit : null;
    if (cur && cur.shopId !== sid) cur.close({ silent: true });
    if (sid && left.has(visit)) return;
    if (sid && !ShopScreen.current) new ShopScreen(sid).show();
    else ShopScreen.current?.refresh();
  }

  /** The GM's preview: the screen as a hero would see it (secret shelf included, nothing is bought). */
  static preview(shopId, actorId) {
    ShopScreen.current?.close({ silent: true });
    const actor = (actorId && game.actors.get(actorId)) || game.actors.find(a => a.type === "character" && a.hasPlayerOwner) || null;
    return new ShopScreen(shopId, { preview: true, actor }).show();
  }

  constructor(shopId, { preview = false, actor = null } = {}) {
    this.shopId = shopId;
    this.preview = preview;
    this.actor = actor ?? heroOf(game.user);
    this.basket = new Map();   // rowId -> n
    this.tab = "all";
    this.selected = null;
    this.bark = "";
    this.message = null;       // { kind: "ok" | "error", text }
    this.busy = false;
    this.party = false;
    this.picking = false;      // choosing a skill for the secret shelf
    this.rolling = false;      // the roll dialog for the secret shelf is up
    this.eventKey = null;      // which random event this screen has already shown (null = none looked at yet)
    this.freshEvent = false;   // the event arrived while the screen was up: it gets a moment of attention
    this.above = new Set();    // Foundry windows opened over the screen
    this.hooks = [];
    this.el = null;
  }

  get def() { return shop(this.shopId); }
  get open() { return live().open[this.shopId] ?? null; }
  /** The effects of this visit's random event, if one is running. */
  get fx() { return this.open?.event?.fx ?? null; }
  get secretState() {
    if (this.preview) return "open";
    return this.actor ? (this.open?.secret?.[this.actor.id] ?? null) : null;
  }

  /** Put the screen on this client (named show, not open: `open` is the getter for this shop's live data). */
  show() {
    const def = this.def;
    if (!def) return null;
    ShopScreen.current = this;
    const visits = state().shops[this.shopId]?.visits ?? 0;
    this.bark = this.line(visits > 1 ? ["again", "enter"] : ["enter"]);
    this.el = document.createElement("div");
    this.el.tabIndex = -1;
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-modal", "true");
    this.el.addEventListener("click", ev => this.onClick(ev));
    this.el.addEventListener("change", ev => this.onChange(ev));
    this.el.addEventListener("contextmenu", ev => this.onContext(ev));
    document.body.append(this.el);
    this.watchWindows();
    this.syncEvent();
    this.render();
    this.el.focus({ preventScroll: true });
    this.playSound();
    requestAnimationFrame(() => this.el?.classList.add("ps-in"));
    return this;
  }

  close({ silent = false } = {}) {
    if (!this.el) return;
    const el = this.el;
    this.el = null;
    this.unwatchWindows();
    if (ShopScreen.current === this) ShopScreen.current = null;
    el.classList.add("ps-out");
    setTimeout(() => el.remove(), silent ? 250 : 500);
  }

  /** Walk out. The GM is told; only he can open the shop again. */
  async leave() {
    const visit = this.open?.visit;
    this.close();
    if (this.preview) return;
    if (visit) rememberLeft(visit);
    const res = await ask("leave", { shopId: this.shopId });
    if (!res?.ok && res?.error === "NoGM") ui.notifications.warn(t("Error.NoGM"));
  }

  /** Something changed in the world: redraw, and drop from the basket what can no longer be bought. */
  refresh() {
    if (!this.el) return;
    if (!this.def) return this.close({ silent: true });
    if (!this.preview && !this.open) return this.close({ silent: true });
    this.syncEvent();
    const rows = this.rows();
    const dropped = [];
    for (const [rowId, n] of this.basket) {
      const r = rows.find(x => x.id === rowId);
      if (!r || (r.qty != null && r.qty <= 0)) { this.basket.delete(rowId); dropped.push(r?.name ?? "?"); }
      else if (r.qty != null && r.qty < n) this.basket.set(rowId, r.qty);
    }
    if (dropped.length) {
      this.message = { kind: "error", text: t("Screen.Gone", { names: dropped.join(", ") }) };
      this.bark = this.line(["soldOut"]);
    }
    this.render();
  }

  line(kinds) {
    const def = this.def;
    const barks = { ...typeInfo(def?.type).barks, ...(def?.barks ?? {}) };
    for (const k of kinds) {
      const text = pickLine((barks[k] ?? []).map(b => local(b)));
      if (text) return text;
    }
    return "";
  }

  playSound() {
    const def = this.def;
    const src = def?.sound || typeInfo(def?.type).sound || DEFAULT_SOUND;
    if (!src) return;
    const AH = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
    let base = 1;
    try { base = game.settings.get("core", "globalInterfaceVolume") ?? 1; } catch { /* older cores */ }
    const volume = Math.max(0, Math.min(1, Number(setting("volume") ?? 0.7) * base));
    try { AH?.play?.({ src, volume, loop: false, autoplay: true, channel: "interface" }, false); }
    catch (err) { console.warn(`${MODULE_ID} | sound`, err); }
  }

  /* ---------------- markup ---------------- */

  rows() {
    return eventRows(visibleRows(stockOf(this.shopId), this.secretState === "open"), this.fx);
  }

  /** A new random event arrived: show it and let the owner react. A screen that opens on a running event shows it quietly. */
  syncEvent() {
    const ev = this.open?.event;
    const key = ev ? `${ev.id}@${ev.at}` : "";
    if (key === this.eventKey) return;
    const looked = this.eventKey !== null;
    this.eventKey = key;
    if (!ev || !looked) return;
    this.freshEvent = true;
    const line = pickLine((ev.bark ?? []).map(b => local(b)));
    if (line) this.bark = line;
    setTimeout(() => { this.freshEvent = false; this.el?.querySelector(".ps-event")?.classList.remove("ps-event-new"); }, 3000);
  }

  /* ---------------- windows above the screen ---------------- */

  /**
   * The screen sits at z-index 9000, above Foundry's own windows, so the roll dialog for the secret shelf (and any
   * sheet or prompt that opens meanwhile) used to open behind it. While such a window is open the screen drops to
   * just under it; when the last one closes the screen goes back up. Only framed windows count: the sidebar and the
   * hotbar re-render all the time and must not move the screen.
   */
  watchWindows() {
    if (this.hooks.length || !globalThis.Hooks?.on) return;
    this.hooks = [
      ["renderApplicationV2", Hooks.on("renderApplicationV2", app => this.liftFor(app))],
      ["closeApplicationV2", Hooks.on("closeApplicationV2", app => this.dropWindow(app))]
    ];
  }

  unwatchWindows() {
    for (const [name, id] of this.hooks) Hooks.off?.(name, id);
    this.hooks = [];
    this.above.clear();
  }

  liftFor(app) {
    const el = app?.element;
    if (!this.el || !app?.hasFrame || !(el instanceof HTMLElement) || this.el.contains(el)) return;
    this.above.add(app);
    this.settleZ();
    requestAnimationFrame(() => this.settleZ());   // Foundry raises a window to the front just after it renders
  }

  dropWindow(app) {
    if (this.above.delete(app)) this.settleZ();
  }

  /** The screen goes just under the lowest window that has to show above it, or back to the top when there is none. */
  settleZ() {
    if (!this.el) return;
    const zs = [...this.above].map(a => Number.parseInt(getComputedStyle(a.element ?? document.body).zIndex, 10)).filter(Number.isFinite);
    if (!this.above.size) return this.el.style.removeProperty("z-index");
    this.el.style.zIndex = String(Math.max(1, zs.length ? Math.min(...zs) - 1 : 50));
  }

  render() {
    const def = this.def;
    if (!this.el || !def) return;
    const grid = this.el.querySelector(".ps-grid");
    const scroll = grid?.scrollTop ?? 0;
    const ownerScroll = this.el.querySelector(".ps-owner-scroll")?.scrollTop ?? 0;
    this.el.className = `planar-store-screen ps-type-${def.type}${this.preview ? " ps-preview" : ""}${this.el.classList.contains("ps-in") ? " ps-in" : ""}`;
    this.el.lang = language();
    this.el.innerHTML = `<div class="ps-fx" aria-hidden="true"></div>
      ${this.headHTML(def)}
      <main class="ps-main">${this.ownerHTML(def)}${this.shelvesHTML(def)}${this.basketHTML(def)}</main>`;
    const g = this.el.querySelector(".ps-grid");
    if (g) g.scrollTop = scroll;
    const os = this.el.querySelector(".ps-owner-scroll");
    if (os) os.scrollTop = ownerScroll;
    this.enrichDetail();
  }

  headHTML(def) {
    const type = typeInfo(def.type);
    const where = [type.name, local(def.place)].filter(Boolean).join(" · ");
    return `<header class="ps-head">
      ${def.img ? `<div class="ps-place" style="background-image:url('${esc(def.img)}')"></div>` : `<div class="ps-place ps-noimg"><i class="fa-solid ${TYPE_ICON[def.type]}"></i></div>`}
      <div class="ps-heading">
        <div class="ps-kind"><i class="fa-solid ${TYPE_ICON[def.type]}"></i> ${esc(where)}</div>
        <h1 class="ps-name">${esc(local(def.name))}</h1>
        ${def.flair ? `<p class="ps-flair">${esc(local(def.flair))}</p>` : ""}
        ${def.description ? `<div class="ps-desc">${textToHTML(local(def.description))}</div>` : ""}
      </div>
      <button type="button" class="ps-leave" data-act="leave"><i class="fa-solid fa-door-open"></i> ${esc(t("Screen.Leave"))}</button>
      ${this.preview ? `<div class="ps-preview-tag">${esc(t("Screen.Preview", { hero: this.actor?.name ?? "?" }))}</div>` : ""}
    </header>`;
  }

  ownerHTML(def) {
    const o = def.owner;
    const name = local(o.name);
    const has = name || o.about || o.img;
    const hidden = stockOf(this.shopId).some(r => r.hidden);
    const st = this.secretState;
    let secret = "";
    if (hidden && this.actor) {
      if (st === "open") secret = `<p class="ps-secret-ok"><i class="fa-solid fa-key"></i> ${esc(t("Screen.SecretOpen"))}</p>`;
      else if (st === "locked") secret = `<p class="ps-secret-no"><i class="fa-solid fa-lock"></i> ${esc(t("Screen.SecretLocked"))}</p>`;
      else if (this.picking) {
        secret = `<div class="ps-skills"><span>${esc(t("Screen.HowAsk"))}</span>${def.secret.skills.map(s =>
          `<button type="button" data-act="roll" data-skill="${esc(s)}"><i class="fa-solid fa-dice-d20"></i> ${esc(game.i18n?.localize?.(SKILL_LABEL(s)) ?? s)}</button>`).join("")}
          <button type="button" class="ps-link" data-act="cancel-ask">${esc(t("Screen.Never"))}</button></div>`;
      } else {
        const label = local(def.secret.label) || t("Screen.Ask");
        secret = `<button type="button" class="ps-ask" data-act="ask" ${this.busy ? "disabled" : ""}><i class="fa-solid fa-eye-low-vision"></i> <span>${esc(label)}</span></button>`;
      }
    }
    // The GM can right-click the portrait of a linked owner to open the NPC's own sheet.
    const sheet = game.user.isGM && o.actorUuid ? ` data-actor="${esc(o.actorUuid)}"` : "";
    const en = o.nameEn && o.nameEn !== name ? `<div class="ps-owner-en">${esc(o.nameEn)}</div>` : "";
    return `<aside class="ps-owner">
      <div class="ps-owner-scroll">
        ${o.img ? `<div class="ps-portrait"${sheet}><img src="${esc(o.img)}" alt=""></div>` : `<div class="ps-portrait ps-noimg"${sheet}><i class="fa-solid fa-user"></i></div>`}
        ${has ? `<h2 class="ps-owner-name">${esc(name)}</h2>${en}` : ""}
        ${o.role ? `<div class="ps-role">${esc(local(o.role))}</div>` : ""}
        ${o.about ? `<div class="ps-about">${textToHTML(local(o.about))}</div>` : ""}
        ${this.bark ? `<blockquote class="ps-bark">${esc(this.bark)}</blockquote>` : ""}
      </div>
      ${secret ? `<div class="ps-secret">${secret}</div>` : ""}
    </aside>`;
  }

  /** The random event of this visit: a headline, what happened, and what it does to the shelves in a few chips. */
  eventHTML() {
    const ev = this.open?.event;
    if (!ev) return "";
    const fx = ev.fx ?? {};
    const chip = (kind, text) => `<span class="ps-chip ps-chip-${kind}">${esc(text)}</span>`;
    const chips = [];
    if (fx.priceFactor) chips.push(chip(fx.priceFactor < 1 ? "down" : "up", `${t("Screen.All")} ${fxPercent(fx.priceFactor)}`));
    for (const [c, f] of Object.entries(fx.categoryFactors ?? {})) chips.push(chip(f < 1 ? "down" : "up", `${t(`Category.${c}`)} ${fxPercent(f)}`));
    for (const c of fx.outOf ?? []) chips.push(chip("out", `${t(`Category.${c}`)} · ${t("Screen.SoldOut")}`));
    const title = local(ev.title);
    const text = local(ev.text);
    return `<section class="ps-event${this.freshEvent ? " ps-event-new" : ""}" role="status">
      <i class="fa-solid ${esc(ev.icon || "fa-bell")} ps-event-icon" aria-hidden="true"></i>
      <div class="ps-event-body">
        ${title ? `<h3 class="ps-event-title">${esc(title)}</h3>` : ""}
        ${text ? `<div class="ps-event-text">${textToHTML(text)}</div>` : ""}
        ${chips.length ? `<div class="ps-chips">${chips.join("")}</div>` : ""}
      </div>
    </section>`;
  }

  /** A price as it stands in this visit; when the event moved it, the usual price is struck through beside it. */
  priceHTML(r, def) {
    const now = rowPrice(r, def.priceMultiplier, this.fx);
    if (now == null) return `<span class="ps-price">${esc(t("Screen.Priceless"))}</span>`;
    const base = rowPrice(r, def.priceMultiplier);
    if (base != null && base !== now) {
      return `<span class="ps-price ${now < base ? "ps-sale" : "ps-surge"}">${esc(priceText(now))}</span><s class="ps-was">${esc(priceText(base))}</s>`;
    }
    return `<span class="ps-price">${esc(priceText(now))}</span>`;
  }

  shelvesHTML(def) {
    const all = this.rows();
    const open = all.filter(r => !r.hidden);
    const secret = all.filter(r => r.hidden);
    const cats = CATEGORIES.filter(c => open.some(r => r.category === c));
    const hasSecret = stockOf(this.shopId).some(r => r.hidden);
    if (this.tab === "secret" && !secret.length) this.tab = "all";
    if (!["all", "secret", ...cats].includes(this.tab)) this.tab = "all";
    const tab = (id, icon, label, extra = "") => `<button type="button" class="ps-tab ${this.tab === id ? "on" : ""} ${extra}" data-act="tab" data-tab="${id}"><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`;
    const tabs = [tab("all", "fa-store", t("Screen.All")), ...cats.map(c => tab(c, CATEGORY_ICON[c], t(`Category.${c}`)))];
    if (hasSecret) {
      tabs.push(secret.length ? tab("secret", "fa-key", t("Screen.SecretTab"), "ps-tab-secret")
        : `<span class="ps-tab ps-tab-locked" title="${esc(t("Screen.SecretHint"))}"><i class="fa-solid fa-lock"></i></span>`);
    }
    const shown = this.tab === "secret" ? secret : open.filter(r => this.tab === "all" || r.category === this.tab);
    const cards = shown.length ? shown.map(r => this.cardHTML(r, def)).join("") : `<p class="ps-empty">${esc(t("Screen.Empty"))}</p>`;
    return `<section class="ps-shelves">
      ${this.eventHTML()}
      <nav class="ps-tabs">${tabs.join("")}</nav>
      <div class="ps-grid ${this.tab === "secret" ? "ps-grid-secret" : ""}">${cards}</div>
      ${this.detailHTML(def)}
    </section>`;
  }

  cardHTML(r, def) {
    const price = rowPrice(r, def.priceMultiplier, this.fx);
    const out = r.qty != null && r.qty <= 0;
    const inBasket = this.basket.get(r.id) ?? 0;
    const stock = r.qty == null ? "∞" : `×${r.qty}`;
    const rarity = r.rarity && r.rarity !== "common" ? ` ps-r-${esc(r.rarity)}` : "";
    return `<article class="ps-card${out ? " ps-out" : ""}${r.hidden ? " ps-hidden" : ""}${this.selected === r.id ? " ps-sel" : ""}${rarity}" data-act="select" data-row="${esc(r.id)}">
      <div class="ps-card-img"><img src="${esc(r.img)}" alt="" loading="lazy">${inBasket ? `<span class="ps-badge">${inBasket}</span>` : ""}</div>
      <div class="ps-card-name" title="${esc(r.name)}">${esc(r.name)}${r.bundle > 1 ? ` <small>(${r.bundle})</small>` : ""}</div>
      <div class="ps-card-foot">
        <span class="ps-prices">${this.priceHTML(r, def)}</span>
        <span class="ps-stock">${out ? esc(t("Screen.SoldOut")) : stock}</span>
      </div>
      ${out || price == null ? "" : `<button type="button" class="ps-add" data-act="add" data-row="${esc(r.id)}" title="${esc(t("Screen.Add"))}" aria-label="${esc(t("Screen.Add"))}"><i class="fa-solid fa-plus"></i></button>`}
    </article>`;
  }

  detailHTML(def) {
    const r = this.rows().find(x => x.id === this.selected);
    if (!r) return "";
    const price = rowPrice(r, def.priceMultiplier, this.fx);
    const out = r.qty != null && r.qty <= 0;
    return `<div class="ps-detail">
      <button type="button" class="ps-x" data-act="deselect" aria-label="${esc(t("Screen.CloseDetail"))}"><i class="fa-solid fa-xmark"></i></button>
      <img src="${esc(r.img)}" alt="">
      <div class="ps-detail-body">
        <h3>${esc(r.name)}${r.bundle > 1 ? ` <small>(${r.bundle})</small>` : ""}</h3>
        <div class="ps-detail-meta">${esc(t(`Category.${r.category}`))}${r.rarity ? ` · ${esc(r.rarity)}` : ""} · ${price == null ? esc(t("Screen.Priceless")) : esc(priceText(price))} · ${r.qty == null ? "∞" : esc(t("Screen.Left", { n: r.qty }))}</div>
        <div class="ps-detail-desc" data-desc="${esc(r.id)}"></div>
        ${out || price == null ? "" : `<button type="button" class="ps-btn" data-act="add" data-row="${esc(r.id)}"><i class="fa-solid fa-basket-shopping"></i> ${esc(t("Screen.Add"))}</button>`}
      </div>
    </div>`;
  }

  async enrichDetail() {
    const box = this.el?.querySelector(".ps-detail-desc");
    if (!box) return;
    const r = this.rows().find(x => x.id === box.dataset.desc);
    const raw = r?.desc || `<p><em>${esc(t("Screen.NoDesc"))}</em></p>`;
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    let html = raw;
    try { html = (await TE?.enrichHTML?.(raw, { secrets: false })) ?? raw; } catch { /* keep the raw text */ }
    if (box.isConnected) box.innerHTML = html;
  }

  basketHTML(def) {
    const rows = eventRows(stockOf(this.shopId), this.fx);
    const lines = [...this.basket].map(([rowId, n]) => ({ r: rows.find(x => x.id === rowId), n })).filter(x => x.r);
    const total = lines.reduce((s, { r, n }) => s + (rowPrice(r, def.priceMultiplier, this.fx) ?? 0) * n, 0);
    const party = partyPurseAvailable();
    if (!party) this.party = false;
    const purse = this.party ? cleanCoins(partyPurse()) : cleanCoins(this.actor?.system?.currency);
    const enough = coinValue(purse) >= total;
    const list = lines.length ? lines.map(({ r, n }) => {
      const each = rowPrice(r, def.priceMultiplier, this.fx) ?? 0;
      const max = r.qty == null ? 99 : r.qty;
      return `<li>
        <span class="ps-line-name">${esc(r.name)}${r.bundle > 1 ? ` <small>(${r.bundle})</small>` : ""}</span>
        <span class="ps-qty">
          <button type="button" data-act="minus" data-row="${esc(r.id)}" aria-label="−"><i class="fa-solid fa-minus"></i></button>
          <span>${n}</span>
          <button type="button" data-act="plus" data-row="${esc(r.id)}" ${n >= max ? "disabled" : ""} aria-label="+"><i class="fa-solid fa-plus"></i></button>
        </span>
        <span class="ps-line-price">${esc(priceText(each * n))}</span>
      </li>`;
    }).join("") : `<li class="ps-empty">${esc(t("Screen.BasketEmpty"))}</li>`;
    const msg = this.message ? `<p class="ps-msg ps-msg-${this.message.kind}">${esc(this.message.text)}</p>` : "";
    return `<aside class="ps-basket">
      <h2><i class="fa-solid fa-basket-shopping"></i> ${esc(t("Screen.Basket"))}</h2>
      <ul class="ps-lines">${list}</ul>
      <div class="ps-foot">
        <div class="ps-total"><span>${esc(t("Screen.Total"))}</span><strong>${esc(priceText(total))}</strong></div>
        <div class="ps-purse ${enough ? "" : "ps-short"}"><span>${esc(this.party ? t("Screen.PartyHas") : t("Screen.YouHave", { hero: this.actor?.name?.split(" ")[0] ?? "" }))}</span><strong>${esc(coinsText(purse))}</strong></div>
        ${party ? `<label class="ps-party"><input type="checkbox" name="party" ${this.party ? "checked" : ""}> ${esc(t("Screen.PayParty"))}</label>` : ""}
        <button type="button" class="ps-buy" data-act="buy" ${!lines.length || this.busy || !this.actor ? "disabled" : ""}>
          ${this.busy ? `<i class="fa-solid fa-spinner fa-spin"></i>` : `<i class="fa-solid fa-coins"></i>`} ${esc(t("Screen.Buy"))}</button>
        ${msg}
      </div>
    </aside>`;
  }

  /* ---------------- actions ---------------- */

  onChange(ev) {
    if (ev.target.name === "party") { this.party = ev.target.checked; this.render(); }
  }

  onContext(ev) {
    if (!game.user.isGM) return;
    // ...or the owner's portrait to open the NPC's sheet (when the owner is a linked actor).
    const portrait = ev.target.closest?.(".ps-portrait[data-actor]");
    if (portrait) {
      ev.preventDefault();
      fromUuid(portrait.dataset.actor).then(a => a?.sheet?.render({ force: true })).catch(() => null);
      return;
    }
    // The GM can right-click a card to open the item's sheet.
    const card = ev.target.closest?.(".ps-card");
    if (!card || !game.user.isGM) return;
    ev.preventDefault();
    const r = stockOf(this.shopId).find(x => x.id === card.dataset.row);
    if (r?.uuid) fromUuid(r.uuid).then(i => i?.sheet?.render({ force: true })).catch(() => null);
  }

  async onClick(ev) {
    const btn = ev.target.closest?.("[data-act]");
    if (!btn || !this.el?.contains(btn)) return;
    if (btn.disabled) return;
    const act = btn.dataset.act;
    const rowId = btn.dataset.row;
    ev.stopPropagation();
    const row = rowId ? this.rows().find(r => r.id === rowId) : null;
    switch (act) {
      case "leave": return this.leave();
      case "tab": this.tab = btn.dataset.tab; this.selected = null; return this.render();
      case "select": this.selected = this.selected === rowId ? null : rowId; return this.render();
      case "deselect": this.selected = null; return this.render();
      case "add": case "plus": {
        if (!row) return;
        const n = (this.basket.get(rowId) ?? 0) + 1;
        if (row.qty != null && n > row.qty) { this.message = { kind: "error", text: t("Error.NotEnough", { name: row.name, left: row.qty }) }; return this.render(); }
        this.basket.set(rowId, n);
        this.message = null;
        return this.render();
      }
      case "minus": {
        const n = (this.basket.get(rowId) ?? 0) - 1;
        if (n > 0) this.basket.set(rowId, n); else this.basket.delete(rowId);
        return this.render();
      }
      case "buy": return this.buy();
      case "ask": this.picking = true; return this.render();
      case "cancel-ask": this.picking = false; return this.render();
      case "roll": return this.rollSecret(btn.dataset.skill);
    }
  }

  async buy() {
    if (this.busy) return;
    const basket = [...this.basket].map(([rowId, n]) => ({ rowId, n }));
    const def = this.def;
    if (this.preview) {
      const chk = checkBasket(stockOf(this.shopId), basket, { secretOpen: true, multiplier: def.priceMultiplier, event: this.open?.event });
      this.message = { kind: "ok", text: t("Screen.PreviewBuy", { price: priceText(chk.total) }) };
      return this.render();
    }
    this.busy = true;
    this.message = null;
    this.render();
    const res = await ask("buy", { shopId: this.shopId, basket, party: this.party });
    this.busy = false;
    if (!this.el) return;
    if (res?.ok) {
      this.basket.clear();
      this.bark = this.line(["buy"]);
      this.message = { kind: "ok", text: t("Screen.Bought", { price: priceText(res.total) }) };
      this.playCoins();
    } else {
      const code = res?.error ?? "Failed";
      this.message = { kind: "error", text: t(`Error.${code}`, { name: res?.name ?? "", have: res?.have ?? "", left: res?.left ?? 0 }) };
      if (code === "TooPoor" || code === "TooPoorParty") this.bark = this.line(["poor"]);
      if (code === "SoldOut" || code === "NotEnough") this.bark = this.line(["soldOut"]);
    }
    this.render();
  }

  playCoins() {
    const AH = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
    try { AH?.play?.({ src: "sounds/dice.wav", volume: Math.min(1, Number(setting("volume") ?? 0.7) * 0.6), loop: false, autoplay: true, channel: "interface" }, false); }
    catch { /* no sound is fine */ }
  }

  async rollSecret(skill) {
    if (!this.actor || this.busy) return;
    const def = this.def;
    if (this.preview) { this.picking = false; this.bark = this.line(["secretYes"]); return this.render(); }
    this.busy = true;
    this.picking = false;
    this.rolling = true;
    this.render();
    // The roll dialog opens as a Foundry window; watchWindows() lifts it above this screen. If for some reason it is
    // not noticed, drop the screen under all windows after a moment so the player can still roll.
    const fallback = setTimeout(() => { if (this.rolling && !this.above.size && this.el) this.el.style.zIndex = "50"; }, 800);
    let total = null;
    try {
      const rollMode = def.secret.whisperRoll ? (CONST.DICE_ROLL_MODES?.PRIVATE ?? "gmroll") : undefined;
      const out = await this.actor.rollSkill({ skill }, {}, rollMode ? { rollMode } : {});
      const roll = Array.isArray(out) ? out[0] : out;
      total = roll?.total ?? null;
    } catch (err) {
      console.warn(`${MODULE_ID} | secret roll`, err);
    } finally {
      clearTimeout(fallback);
      this.rolling = false;
      this.settleZ();
    }
    if (total == null) { this.busy = false; return this.render(); }  // the roll dialog was closed
    const res = await ask("secret", { shopId: this.shopId, skill, total });
    this.busy = false;
    if (!this.el) return;
    if (res?.ok) this.bark = this.line([res.result === "open" ? "secretYes" : "secretNo"]);
    else this.message = { kind: "error", text: t(`Error.${res?.error ?? "Failed"}`, { name: "", have: "", left: 0 }) };
    if (res?.result === "open") this.tab = "secret";
    this.render();
  }
}
