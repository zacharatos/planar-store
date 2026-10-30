// The shop screen: a shop takes over the player's screen (plain DOM + CSS, like the Planar Whispers reveal, so
// it sits above every window). Place, owner, shelves, the secret shelf and a basket. Players only ever ask the
// GM's client (rpc.ask); stock and "who is inside" come back through the world settings, so every open screen
// updates by itself. Only the GM opens a shop; the player closes it with Leave.
import { MODULE_ID, TYPE_ICON, CATEGORY_ICON, DEFAULT_SOUND } from "./constants.mjs";
import { t, language } from "./i18n.mjs";
import { setting } from "./settings.mjs";
import { shop, stockOf, live, heroOf, typeInfo, local, state } from "./state.mjs";
import {
  escapeHTML as esc, textToHTML, rowPrice, priceText, coinsText, coinValue, cleanCoins, visibleRows, checkBasket, pickLine,
  shopOfUser, CATEGORIES
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
    if (sid && !ShopScreen.current) new ShopScreen(sid).open();
    else ShopScreen.current?.refresh();
  }

  /** The GM's preview: the screen as a hero would see it (secret shelf included, nothing is bought). */
  static preview(shopId, actorId) {
    ShopScreen.current?.close({ silent: true });
    const actor = (actorId && game.actors.get(actorId)) || game.actors.find(a => a.type === "character" && a.hasPlayerOwner) || null;
    return new ShopScreen(shopId, { preview: true, actor }).open();
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
    this.el = null;
  }

  get def() { return shop(this.shopId); }
  get open() { return live().open[this.shopId] ?? null; }
  get secretState() {
    if (this.preview) return "open";
    return this.actor ? (this.open?.secret?.[this.actor.id] ?? null) : null;
  }

  open() {
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
    const rows = visibleRows(stockOf(this.shopId), this.secretState === "open");
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
    return visibleRows(stockOf(this.shopId), this.secretState === "open");
  }

  render() {
    const def = this.def;
    if (!this.el || !def) return;
    const grid = this.el.querySelector(".ps-grid");
    const scroll = grid?.scrollTop ?? 0;
    this.el.className = `planar-store-screen ps-type-${def.type}${this.preview ? " ps-preview" : ""}${this.el.classList.contains("ps-in") ? " ps-in" : ""}`;
    this.el.lang = language();
    this.el.innerHTML = `<div class="ps-fx" aria-hidden="true"></div>
      ${this.headHTML(def)}
      <main class="ps-main">${this.ownerHTML(def)}${this.shelvesHTML(def)}${this.basketHTML(def)}</main>`;
    const g = this.el.querySelector(".ps-grid");
    if (g) g.scrollTop = scroll;
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
    const has = o.name || o.about || o.img;
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
        secret = `<button type="button" class="ps-ask" data-act="ask" ${this.busy ? "disabled" : ""}><i class="fa-solid fa-eye-low-vision"></i> ${esc(label)}</button>`;
      }
    }
    return `<aside class="ps-owner">
      ${o.img ? `<div class="ps-portrait"><img src="${esc(o.img)}" alt=""></div>` : `<div class="ps-portrait ps-noimg"><i class="fa-solid fa-user"></i></div>`}
      ${has ? `<h2 class="ps-owner-name">${esc(local(o.name))}${o.nameEn ? ` <small>(${esc(o.nameEn)})</small>` : ""}</h2>` : ""}
      ${o.role ? `<div class="ps-role">${esc(local(o.role))}</div>` : ""}
      ${o.about ? `<div class="ps-about">${textToHTML(local(o.about))}</div>` : ""}
      ${this.bark ? `<blockquote class="ps-bark">${esc(this.bark)}</blockquote>` : ""}
      ${secret}
    </aside>`;
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
      <nav class="ps-tabs">${tabs.join("")}</nav>
      <div class="ps-grid ${this.tab === "secret" ? "ps-grid-secret" : ""}">${cards}</div>
      ${this.detailHTML(def)}
    </section>`;
  }

  cardHTML(r, def) {
    const price = rowPrice(r, def.priceMultiplier);
    const out = r.qty != null && r.qty <= 0;
    const inBasket = this.basket.get(r.id) ?? 0;
    const stock = r.qty == null ? "∞" : `×${r.qty}`;
    const rarity = r.rarity && r.rarity !== "common" ? ` ps-r-${esc(r.rarity)}` : "";
    return `<article class="ps-card${out ? " ps-out" : ""}${r.hidden ? " ps-hidden" : ""}${this.selected === r.id ? " ps-sel" : ""}${rarity}" data-act="select" data-row="${esc(r.id)}">
      <div class="ps-card-img"><img src="${esc(r.img)}" alt="" loading="lazy">${inBasket ? `<span class="ps-badge">${inBasket}</span>` : ""}</div>
      <div class="ps-card-name">${esc(r.name)}${r.bundle > 1 ? ` <small>(${r.bundle})</small>` : ""}</div>
      <div class="ps-card-foot">
        <span class="ps-price">${price == null ? esc(t("Screen.Priceless")) : esc(priceText(price))}</span>
        <span class="ps-stock">${out ? esc(t("Screen.SoldOut")) : stock}</span>
      </div>
      ${out || price == null ? "" : `<button type="button" class="ps-add" data-act="add" data-row="${esc(r.id)}" title="${esc(t("Screen.Add"))}"><i class="fa-solid fa-plus"></i></button>`}
    </article>`;
  }

  detailHTML(def) {
    const r = this.rows().find(x => x.id === this.selected);
    if (!r) return "";
    const price = rowPrice(r, def.priceMultiplier);
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
    const rows = stockOf(this.shopId);
    const lines = [...this.basket].map(([rowId, n]) => ({ r: rows.find(x => x.id === rowId), n })).filter(x => x.r);
    const total = lines.reduce((s, { r, n }) => s + (rowPrice(r, def.priceMultiplier) ?? 0) * n, 0);
    const party = partyPurseAvailable();
    if (!party) this.party = false;
    const purse = this.party ? cleanCoins(partyPurse()) : cleanCoins(this.actor?.system?.currency);
    const enough = coinValue(purse) >= total;
    const list = lines.length ? lines.map(({ r, n }) => {
      const each = rowPrice(r, def.priceMultiplier) ?? 0;
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
      <div class="ps-total"><span>${esc(t("Screen.Total"))}</span><strong>${esc(priceText(total))}</strong></div>
      <div class="ps-purse ${enough ? "" : "ps-short"}"><span>${esc(this.party ? t("Screen.PartyHas") : t("Screen.YouHave", { hero: this.actor?.name?.split(" ")[0] ?? "" }))}</span><strong>${esc(coinsText(purse))}</strong></div>
      ${party ? `<label class="ps-party"><input type="checkbox" name="party" ${this.party ? "checked" : ""}> ${esc(t("Screen.PayParty"))}</label>` : ""}
      <button type="button" class="ps-buy" data-act="buy" ${!lines.length || this.busy || !this.actor ? "disabled" : ""}>
        ${this.busy ? `<i class="fa-solid fa-spinner fa-spin"></i>` : `<i class="fa-solid fa-coins"></i>`} ${esc(t("Screen.Buy"))}</button>
      ${msg}
    </aside>`;
  }

  /* ---------------- actions ---------------- */

  onChange(ev) {
    if (ev.target.name === "party") { this.party = ev.target.checked; this.render(); }
  }

  onContext(ev) {
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
      const chk = checkBasket(stockOf(this.shopId), basket, { secretOpen: true, multiplier: def.priceMultiplier });
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
    this.render();
    let total = null;
    try {
      const rollMode = def.secret.whisperRoll ? (CONST.DICE_ROLL_MODES?.PRIVATE ?? "gmroll") : undefined;
      const out = await this.actor.rollSkill({ skill }, {}, rollMode ? { rollMode } : {});
      const roll = Array.isArray(out) ? out[0] : out;
      total = roll?.total ?? null;
    } catch (err) {
      console.warn(`${MODULE_ID} | secret roll`, err);
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
