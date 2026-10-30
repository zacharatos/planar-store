// The GM console: Shops (open for whom, edit, new shop, pack), Stock (drag items in, quantities, prices, the
// secret shelf), Live (who is inside, the secret shelf per hero, undo) and Ledger (every purchase and roll).
import { MODULE_ID, TYPE_ICON, CATEGORY_ICON } from "./constants.mjs";
import { t, warn, info } from "./i18n.mjs";
import { setting, setSetting } from "./settings.mjs";
import {
  escapeHTML as esc, rowPrice, priceText, parsePrice, coinsText, cleanCoins, fitsType, validatePack, SHOP_TYPES, SECRET_SKILLS
} from "./util.mjs";
import { shops, shop, stockOf, live, ledger, heroes, heroOf, textLang, toggleLanguage, local, typeInfo, importedPack, importPack, resetPack } from "./state.mjs";
import * as trade from "./trade.mjs";
import * as stock from "./stock.mjs";
import { ShopScreen } from "./shop.mjs";
import { page, syncPage } from "./page.mjs";

const { ApplicationV2 } = foundry.applications.api;
const TABS = ["shops", "stock", "live", "ledger"];
const TAB_ICONS = { shops: "fa-store", stock: "fa-boxes-stacked", live: "fa-bell-concierge", ledger: "fa-book" };
const btn = (act, icon, label, data = "", cls = "", extra = "") =>
  `<button type="button" class="${cls}" data-act="${act}" ${data} ${extra}><i class="fa-solid ${icon}"></i>${label ? ` ${esc(label)}` : ""}</button>`;
const tip = s => `data-tooltip="${esc(s)}"`;
const skillLabel = s => game.i18n.localize(CONFIG.DND5E?.skills?.[s]?.label ?? s);

function filePicker(type, current, callback) {
  const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  new FP({ type, current, callback }).render(true);
}

function dragData(ev) {
  const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  try { return TE?.getDragEventData?.(ev) ?? JSON.parse(ev.dataTransfer.getData("text/plain")); }
  catch { return null; }
}

export class StoreConsole extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "planar-store-console",
    classes: ["planar-store"],
    window: { title: "PLANAR_STORE.Console.Title", icon: "fa-solid fa-store", resizable: true },
    position: { width: 820, height: 760 }
  };

  static #instance = null;
  static get instance() { return this.#instance; }

  /** Open the console, optionally on a tab and a shop. */
  static open({ tab = null, shopId = null } = {}) {
    if (!game.user.isGM) return warn("Notify.OnlyGM");
    this.#instance ??= new StoreConsole();
    const c = this.#instance;
    if (tab) c.#tab = tab;
    if (shopId) c.#shopId = shopId;
    if (c.rendered) c.bringToFront?.();
    c.render({ force: true });
    return c;
  }

  #tab = "shops";
  #shopId = null;
  #pick = new Set();
  #editing = null;
  #boundTo = null;
  #timer = null;

  get title() { return t("Console.Title"); }

  refreshSoon() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (!this.rendered) return;
      const active = document.activeElement;
      if (active && this.element.contains(active) && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) && active.type !== "checkbox") return this.refreshSoon();
      this.render();
    }, 150);
  }

  async _prepareContext() { return {}; }
  async _renderHTML() { return this.#html(); }
  _replaceHTML(result, content) {
    const scroll = content.querySelector(".pst-body")?.scrollTop ?? 0;
    content.innerHTML = result;
    const body = content.querySelector(".pst-body");
    if (body) body.scrollTop = scroll;
  }

  _onRender() {
    if (this.window?.title) this.window.title.textContent = this.title;
    if (this.#boundTo === this.element) return;
    this.#boundTo = this.element;
    this.element.addEventListener("click", ev => this.#onClick(ev));
    this.element.addEventListener("change", ev => this.#onChange(ev));
    this.element.addEventListener("dragover", ev => { const z = ev.target.closest(".pst-drop"); if (z) { ev.preventDefault(); z.classList.add("over"); } });
    this.element.addEventListener("dragleave", ev => ev.target.closest?.(".pst-drop")?.classList.remove("over"));
    this.element.addEventListener("drop", ev => this.#onDrop(ev));
  }

  get #current() {
    const all = shops();
    if (!all.some(s => s.id === this.#shopId)) this.#shopId = all[0]?.id ?? null;
    return this.#shopId ? shop(this.#shopId) : null;
  }

  /* ---------------- markup ---------------- */

  #html() {
    const l = live();
    const counts = { live: Object.keys(l.open).length };
    const tabs = TABS.map(k => `<a class="pst-tab ${k === this.#tab ? "active" : ""}" data-act="tab" data-tab="${k}"><i class="fa-solid ${TAB_ICONS[k]}"></i> ${esc(t(`Console.Tab.${k}`))}${counts[k] ? ` <span class="pst-count">${counts[k]}</span>` : ""}</a>`).join("");
    const bar = `<div class="pst-bar">
      <label class="pst-field" ${tip(t("Console.SessionHint"))}><i class="fa-solid fa-calendar-day"></i> <input type="text" name="session" value="${esc(setting("session"))}" placeholder="${esc(t("Console.SessionPlaceholder"))}"></label>
      <span class="pst-grow"></span>
      ${btn("lang", "fa-language", textLang() === "el" ? "ΕΛ" : "EN", "", "pst-lang", tip(t("Console.Language")))}
      ${btn("open-page", "fa-book-open", "", "", "icon", tip(t("Console.OpenPage")))}</div>`;
    const body = { shops: () => this.#shops(l), stock: () => this.#stock(), live: () => this.#live(l), ledger: () => this.#ledger() }[this.#tab]();
    return `<nav class="pst-tabs">${tabs}</nav>${bar}<section class="pst-body">${body}</section>`;
  }

  #heroChips() {
    const hs = heroes();
    if (!hs.length) return `<p class="pst-hint">${esc(t("Console.NoHeroes"))}</p>`;
    return `<div class="pst-heroes">${hs.map(h => {
      const online = h.users.some(u => u.active);
      return `<button type="button" class="pst-hero ${this.#pick.has(h.id) ? "on" : ""}" data-act="hero" data-id="${esc(h.id)}" ${tip(`${h.users.map(u => u.name).join(", ")} · ${t(online ? "Console.Online" : "Console.Offline")}`)}>
        <img src="${esc(h.img)}" alt=""><span>${esc(h.name.split(" ")[0])}</span><i class="pst-dot ${online ? "on" : ""}"></i></button>`;
    }).join("")}</div>`;
  }

  #shops(l) {
    const all = shops();
    const pack = importedPack();
    const head = `<div class="pst-section">
      <h3><i class="fa-solid fa-users"></i> ${esc(t("Console.OpenFor"))}</h3>
      ${this.#heroChips()}
      <p class="pst-hint">${esc(t("Console.OpenHint"))}</p></div>`;
    const cards = all.length ? all.map(s => {
      const o = l.open[s.id];
      const inside = (o?.users ?? []).map(id => heroOf(id)?.name ?? game.users.get(id)?.name).filter(Boolean);
      const rows = stockOf(s.id);
      const editing = this.#editing === s.id;
      return `<article class="pst-shop ${o ? "is-open" : ""} pst-type-${s.type}">
        <header>
          <i class="fa-solid ${TYPE_ICON[s.type]} pst-type-icon"></i>
          <div class="pst-shop-title"><strong>${esc(local(s.name))}</strong>
            <small>${esc([typeInfo(s.type).name, local(s.place)].filter(Boolean).join(" · "))} · ${esc(t("Console.Rows", { n: rows.length, secret: rows.filter(r => r.hidden).length }))}${s.fromPack ? "" : ` · ${esc(t("Console.HandMade"))}`}</small>
            ${o ? `<span class="pst-inside"><i class="fa-solid fa-door-open"></i> ${esc(inside.join(", ") || "—")}</span>` : ""}</div>
        </header>
        <div class="pst-actions">
          ${btn("open", "fa-door-open", t("Console.Open"), `data-id="${s.id}"`, "pst-primary", this.#pick.size ? "" : "disabled")}
          ${btn("open-all", "fa-users", t("Console.OpenAll"), `data-id="${s.id}"`)}
          ${o ? btn("close", "fa-door-closed", t("Console.Close"), `data-id="${s.id}"`) : ""}
          ${btn("preview", "fa-eye", "", `data-id="${s.id}"`, "icon", tip(t("Console.Preview")))}
          ${btn("goto-stock", "fa-boxes-stacked", "", `data-id="${s.id}"`, "icon", tip(t("Console.Stock")))}
          ${btn("edit", "fa-pen", "", `data-id="${s.id}"`, `icon ${editing ? "on" : ""}`, tip(t("Console.Edit")))}
          ${btn("restock", "fa-rotate", "", `data-id="${s.id}"`, "icon", tip(t("Console.Restock")))}
          ${btn("delete", "fa-trash", "", `data-id="${s.id}"`, "icon", tip(s.fromPack ? t("Console.ClearShop") : t("Console.DeleteShop")))}
        </div>
        ${editing ? this.#editForm(s) : ""}
      </article>`;
    }).join("") : `<p class="pst-hint">${esc(t("Console.NoShops"))}</p>`;
    const create = `<div class="pst-section pst-new">
      <h3><i class="fa-solid fa-plus"></i> ${esc(t("Console.NewShop"))}</h3>
      <input type="text" name="new-name" placeholder="${esc(t("Console.NewName"))}">
      <select name="new-type">${SHOP_TYPES.map(k => `<option value="${k}">${esc(typeInfo(k).name)}</option>`).join("")}</select>
      ${btn("create", "fa-hammer", t("Console.Create"))}</div>`;
    const packBox = `<div class="pst-section pst-pack">
      <h3><i class="fa-solid fa-box-archive"></i> ${esc(t("Console.Pack"))}</h3>
      <p>${pack ? esc(t("Console.PackLoaded", { name: local(pack.name) || pack.id || "?" })) : esc(t("Console.PackDefault"))}</p>
      <label class="pst-file"><span class="pst-btn"><i class="fa-solid fa-file-import"></i> ${esc(t("Console.Import"))}</span><input type="file" name="pack-file" accept=".json,application/json"></label>
      ${pack ? btn("reset-pack", "fa-rotate-left", t("Console.ResetPack")) : ""}
      <p class="pst-hint">${esc(t("Console.PackHint"))}</p></div>`;
    return `${head}<div class="pst-shops">${cards}</div>${create}${packBox}`;
  }

  #editForm(s) {
    const f = (name, label, value, { area = false, picker = false } = {}) => `<label class="pst-form-row"><span>${esc(label)}</span>
      ${area ? `<textarea name="${name}" rows="3">${esc(value)}</textarea>` : `<input type="text" name="${name}" value="${esc(value)}">`}
      ${picker ? btn("pick-img", "fa-file-image", "", `data-field="${name}"`, "icon") : ""}</label>`;
    const o = s.owner;
    return `<form class="pst-edit" data-id="${s.id}" onsubmit="return false">
      <div class="pst-cols">
        <fieldset><legend>${esc(t("Edit.Place"))}</legend>
          ${f("name", t("Edit.Name"), local(s.name))}
          ${f("nameEn", t("Edit.NameEn"), s.nameEn)}
          <label class="pst-form-row"><span>${esc(t("Edit.Type"))}</span><select name="type">${SHOP_TYPES.map(k => `<option value="${k}" ${k === s.type ? "selected" : ""}>${esc(typeInfo(k).name)}</option>`).join("")}</select></label>
          ${f("place", t("Edit.Where"), local(s.place))}
          ${f("img", t("Edit.Image"), s.img, { picker: true })}
          ${f("flair", t("Edit.Flair"), local(s.flair))}
          ${f("description", t("Edit.Description"), local(s.description), { area: true })}
        </fieldset>
        <fieldset><legend>${esc(t("Edit.Owner"))}</legend>
          ${f("owner.name", t("Edit.Name"), local(o.name))}
          ${f("owner.nameEn", t("Edit.NameEn"), o.nameEn)}
          ${f("owner.role", t("Edit.Role"), local(o.role))}
          ${f("owner.img", t("Edit.Portrait"), o.img, { picker: true })}
          ${f("owner.about", t("Edit.About"), local(o.about), { area: true })}
          ${f("owner.gmNotes", t("Edit.GMNotes"), local(o.gmNotes), { area: true })}
        </fieldset>
      </div>
      <fieldset><legend>${esc(t("Edit.Secret"))}</legend>
        <label class="pst-form-row"><span>DC</span><input type="number" name="secret.dc" min="1" max="40" value="${esc(s.secret.dc)}"></label>
        <div class="pst-form-row"><span>${esc(t("Edit.Skills"))}</span>${[...new Set([...SECRET_SKILLS, ...s.secret.skills])].map(k =>
          `<label class="pst-check"><input type="checkbox" name="secret.skill" value="${k}" ${s.secret.skills.includes(k) ? "checked" : ""}> ${esc(skillLabel(k))}</label>`).join("")}</div>
        ${f("secret.label", t("Edit.AskLabel"), local(s.secret.label))}
        <label class="pst-check"><input type="checkbox" name="secret.whisperRoll" ${s.secret.whisperRoll ? "checked" : ""}> ${esc(t("Edit.WhisperRoll"))}</label>
      </fieldset>
      <fieldset><legend>${esc(t("Edit.More"))}</legend>
        <label class="pst-form-row"><span>${esc(t("Edit.Multiplier"))}</span><input type="number" name="priceMultiplier" step="0.05" min="0.05" value="${esc(s.priceMultiplier)}"></label>
        ${f("soundscape", t("Edit.Soundscape"), s.soundscape)}
        ${f("sound", t("Edit.Sound"), s.sound)}
      </fieldset>
      <p class="pst-hint">${esc(t("Edit.Hint"))}</p>
      <div class="pst-actions">${btn("save-edit", "fa-floppy-disk", t("Edit.Save"), `data-id="${s.id}"`, "pst-primary")}
        ${btn("reset-edit", "fa-rotate-left", t("Edit.Reset"), `data-id="${s.id}"`)}
        ${btn("cancel-edit", "fa-xmark", t("Edit.Cancel"))}</div>
    </form>`;
  }

  #stock() {
    const s = this.#current;
    if (!s) return `<p class="pst-hint">${esc(t("Console.NoShops"))}</p>`;
    const rows = stockOf(s.id);
    const picker = `<div class="pst-bar"><label class="pst-field"><i class="fa-solid ${TYPE_ICON[s.type]}"></i>
      <select name="shop">${shops().map(x => `<option value="${x.id}" ${x.id === s.id ? "selected" : ""}>${esc(local(x.name))}</option>`).join("")}</select></label>
      <span class="pst-grow"></span>${btn("restock", "fa-rotate", t("Console.Restock"), `data-id="${s.id}"`)}</div>`;
    const table = (hidden) => {
      const list = rows.filter(r => r.hidden === hidden);
      const body = list.length ? list.map(r => {
        const each = rowPrice(r, s.priceMultiplier);
        const fits = fitsType(s.type, r.category);
        const fromNote = r.override != null ? t("Stock.FromOverride") : t(`Stock.From.${r.priceFrom ?? "item"}`);
        return `<tr data-row="${r.id}">
          <td><img src="${esc(r.img)}" alt=""></td>
          <td class="pst-name"><a data-act="item" data-uuid="${esc(r.uuid)}">${esc(stock.rowLabel(r))}</a>
            <small><i class="fa-solid ${CATEGORY_ICON[r.category]}"></i> ${esc(t(`Category.${r.category}`))}${r.rarity ? ` · ${esc(r.rarity)}` : ""}${fits ? "" : ` <span class="pst-warn" ${tip(t("Stock.Unusual", { type: typeInfo(s.type).name }))}><i class="fa-solid fa-triangle-exclamation"></i></span>`}</small></td>
          <td class="pst-price" ${tip(fromNote)}>${each == null ? "—" : esc(priceText(each))}${r.priceFrom === "rarity" && r.override == null ? " <sup>R</sup>" : ""}</td>
          <td><input type="text" name="override" value="${r.override == null ? "" : esc(priceText(r.override))}" placeholder="${esc(t("Stock.OwnPrice"))}"></td>
          <td><input type="number" name="qty" min="0" value="${r.qty ?? ""}" placeholder="∞"></td>
          <td><input type="number" name="restock" min="0" value="${r.restock ?? ""}" placeholder="—"></td>
          <td class="pst-row-acts">
            ${btn("toggle-hidden", hidden ? "fa-eye" : "fa-key", "", `data-row="${r.id}"`, "icon", tip(hidden ? t("Stock.ToShelves") : t("Stock.ToSecret")))}
            ${btn("refresh-row", "fa-arrows-rotate", "", `data-row="${r.id}"`, "icon", tip(t("Stock.Refresh")))}
            ${btn("remove-row", "fa-trash", "", `data-row="${r.id}"`, "icon", tip(t("Stock.Remove")))}</td>
        </tr>`;
      }).join("") : `<tr><td colspan="7" class="pst-hint">${esc(t("Stock.EmptyShelf"))}</td></tr>`;
      return `<div class="pst-section ${hidden ? "pst-secret" : ""}">
        <h3><i class="fa-solid ${hidden ? "fa-key" : "fa-boxes-stacked"}"></i> ${esc(hidden ? t("Stock.Secret") : t("Stock.Shelves"))}
          ${hidden ? `<small>${esc(t("Stock.SecretInfo", { dc: s.secret.dc, skills: s.secret.skills.map(skillLabel).join(" / ") }))}</small>` : ""}</h3>
        <div class="pst-drop" data-hidden="${hidden}"><i class="fa-solid fa-hand-holding-hand"></i> ${esc(t("Stock.Drop"))}</div>
        <table class="pst-table"><thead><tr><th></th><th>${esc(t("Stock.Col.item"))}</th><th>${esc(t("Stock.Col.price"))}</th><th>${esc(t("Stock.Col.override"))}</th><th>${esc(t("Stock.Col.qty"))}</th><th>${esc(t("Stock.Col.restock"))}</th><th></th></tr></thead>
        <tbody>${body}</tbody></table></div>`;
    };
    return `${picker}${table(false)}${table(true)}<p class="pst-hint">${esc(t("Stock.Hint"))}</p>`;
  }

  #live(l) {
    const open = Object.entries(l.open);
    if (!open.length) return `<p class="pst-hint">${esc(t("Live.Nothing"))}</p>`;
    const entries = ledger().entries;
    return open.map(([id, o]) => {
      const s = shop(id);
      if (!s) return "";
      const hasSecret = stockOf(id).some(r => r.hidden);
      const people = o.users.map(uid => {
        const u = game.users.get(uid);
        const a = heroOf(uid);
        const st = a ? o.secret[a.id] : null;
        const secret = hasSecret && a ? `<span class="pst-secret-state ${st ?? ""}">${st === "open" ? `<i class="fa-solid fa-key"></i> ${esc(t("Live.SecretOpen"))}` : st === "locked" ? `<i class="fa-solid fa-lock"></i> ${esc(t("Live.SecretLocked"))}` : esc(t("Live.SecretNone"))}</span>
          ${st !== "open" ? btn("secret-open", "fa-key", "", `data-id="${id}" data-actor="${a.id}"`, "icon", tip(t("Live.OpenSecret"))) : ""}
          ${st !== "locked" ? btn("secret-lock", "fa-lock", "", `data-id="${id}" data-actor="${a.id}"`, "icon", tip(t("Live.LockSecret"))) : ""}
          ${st ? btn("secret-forget", "fa-eraser", "", `data-id="${id}" data-actor="${a.id}"`, "icon", tip(t("Live.ForgetSecret"))) : ""}` : "";
        return `<li><i class="pst-dot ${u?.active ? "on" : ""}"></i> <strong>${esc(a?.name ?? u?.name ?? "?")}</strong>
          <span class="pst-coins">${esc(coinsText(cleanCoins(a?.system?.currency)))}</span>${secret}
          ${btn("send-out", "fa-person-walking-arrow-right", "", `data-id="${id}" data-user="${uid}"`, "icon", tip(t("Live.SendOut")))}</li>`;
      }).join("");
      const visitEntries = entries.filter(e => e.shopId === id && e.date >= o.since).slice().reverse();
      const recent = visitEntries.length ? visitEntries.map(e => this.#entryLine(e)).join("") : `<li class="pst-hint">${esc(t("Live.NoPurchases"))}</li>`;
      return `<article class="pst-shop is-open pst-type-${s.type}">
        <header><i class="fa-solid ${TYPE_ICON[s.type]} pst-type-icon"></i><div class="pst-shop-title"><strong>${esc(local(s.name))}</strong><small>${esc(t("Live.Since", { time: o.since.slice(11, 16) }))}</small></div>
          <span class="pst-grow"></span>${btn("close", "fa-door-closed", t("Console.Close"), `data-id="${id}"`)}</header>
        <ul class="pst-people">${people}</ul>
        <h4>${esc(t("Live.ThisVisit"))}</h4><ul class="pst-entries">${recent}</ul>
      </article>`;
    }).join("");
  }

  #entryLine(e) {
    const time = String(e.date ?? "").slice(11, 16);
    if (e.kind === "secret") return `<li class="pst-entry"><span class="pst-time">${time}</span> <strong>${esc(e.actorName)}</strong> · ${esc(skillLabel(e.skill))} ${e.total} vs DC ${e.dc} ${e.result === "open" ? "✓" : "✗"} <small>${esc(e.shopName)}</small></li>`;
    if (e.kind === "gm") return `<li class="pst-entry"><span class="pst-time">${time}</span> <strong>${esc(e.actorName)}</strong> · ${esc(t(e.result === "open" ? "Live.GMOpened" : "Live.GMLocked"))} <small>${esc(e.shopName)}</small></li>`;
    const what = (e.lines ?? []).map(x => `${x.n > 1 ? `${x.n}× ` : ""}${x.name}`).join(", ");
    return `<li class="pst-entry ${e.undone ? "undone" : ""}"><span class="pst-time">${time}</span> <strong>${esc(e.actorName)}</strong> · ${esc(what)}
      · <span class="pst-paid">${esc(priceText(e.total))}${e.payer === "party" ? ` ${esc(t("Ledger.Party"))}` : ""}</span> <small>${esc(e.shopName)}${e.session ? ` · ${esc(e.session)}` : ""}</small>
      ${e.undone ? `<em>${esc(t("Ledger.Undone"))}</em>` : btn("undo", "fa-rotate-left", "", `data-id="${e.id}"`, "icon", tip(t("Ledger.Undo")))}</li>`;
  }

  #ledger() {
    const entries = ledger().entries.slice().reverse().slice(0, 150);
    return entries.length ? `<ul class="pst-entries pst-ledger">${entries.map(e => this.#entryLine(e)).join("")}</ul>` : `<p class="pst-hint">${esc(t("Ledger.None"))}</p>`;
  }

  /* ---------------- events ---------------- */

  async #onClick(ev) {
    const el = ev.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const { act, id } = el.dataset;
    switch (act) {
      case "tab": this.#tab = el.dataset.tab; return this.render();
      case "lang": await toggleLanguage(); return this.render();
      case "open-page": return this.#openPage();
      case "hero": this.#pick.has(id) ? this.#pick.delete(id) : this.#pick.add(id); return this.render();
      case "open": await trade.openShop(id, [...this.#pick]); return this.render();
      case "open-all": await trade.openShop(id, "all"); return this.render();
      case "close": await trade.closeShop(id); return this.render();
      case "preview": return ShopScreen.preview(id, [...this.#pick][0]);
      case "goto-stock": this.#shopId = id; this.#tab = "stock"; return this.render();
      case "edit": this.#editing = this.#editing === id ? null : id; return this.render();
      case "cancel-edit": this.#editing = null; return this.render();
      case "save-edit": return this.#saveEdit(el.closest("form"));
      case "reset-edit": await trade.resetEdits(id); this.#editing = null; return this.render();
      case "pick-img": {
        const input = el.closest(".pst-form-row")?.querySelector("input");
        return filePicker("image", input?.value ?? "", path => { if (input) input.value = path; });
      }
      case "restock": await stock.restock(id ?? this.#shopId); return this.render();
      case "delete": return this.#delete(id);
      case "create": return this.#create();
      case "reset-pack": await resetPack(); info("Notify.PackReset"); return this.render();
      case "item": return stock.openItem(el.dataset.uuid);
      case "toggle-hidden": {
        const r = stockOf(this.#shopId).find(x => x.id === el.dataset.row);
        if (r) await stock.updateRow(this.#shopId, r.id, { hidden: !r.hidden });
        return;
      }
      case "refresh-row": return stock.refreshRow(this.#shopId, el.dataset.row);
      case "remove-row": return stock.removeRow(this.#shopId, el.dataset.row);
      case "secret-open": return trade.setSecret(id, el.dataset.actor, "open");
      case "secret-lock": return trade.setSecret(id, el.dataset.actor, "locked");
      case "secret-forget": return trade.setSecret(id, el.dataset.actor, null);
      case "send-out": return trade.closeShop(id, [el.dataset.user]);
      case "undo": return trade.undo(id);
    }
  }

  async #onChange(ev) {
    const el = ev.target;
    if (el.name === "session") return setSetting("session", el.value.trim());
    if (el.name === "shop") { this.#shopId = el.value; return this.render(); }
    if (el.name === "pack-file") return this.#import(el);
    const tr = el.closest("tr[data-row]");
    if (tr && ["override", "qty", "restock"].includes(el.name)) {
      const v = el.value.trim();
      if (el.name === "override") {
        if (!v) return stock.updateRow(this.#shopId, tr.dataset.row, { override: null });
        const cp = parsePrice(v);
        if (cp == null) return warn("Stock.BadPrice", { text: v });
        return stock.updateRow(this.#shopId, tr.dataset.row, { override: cp });
      }
      return stock.updateRow(this.#shopId, tr.dataset.row, { [el.name]: v === "" ? null : Number(v) });
    }
  }

  async #onDrop(ev) {
    const zone = ev.target.closest(".pst-drop");
    if (!zone || !this.#shopId) return;
    ev.preventDefault();
    zone.classList.remove("over");
    const items = await stock.itemsFromDrop(dragData(ev));
    if (!items.length) return warn("Stock.NotAnItem");
    await stock.addItems(this.#shopId, items, { hidden: zone.dataset.hidden === "true" });
  }

  async #saveEdit(form) {
    if (!form) return;
    const id = form.dataset.id;
    const v = name => form.querySelector(`[name="${name}"]`)?.value?.trim() ?? "";
    const patch = {
      name: v("name"), nameEn: v("nameEn"), type: v("type"), place: v("place"), img: v("img"), flair: v("flair"), description: v("description"),
      owner: { name: v("owner.name"), nameEn: v("owner.nameEn"), role: v("owner.role"), img: v("owner.img"), about: v("owner.about"), gmNotes: v("owner.gmNotes") },
      secret: {
        dc: Number(v("secret.dc")) || 15,
        skills: [...form.querySelectorAll('[name="secret.skill"]:checked')].map(x => x.value),
        label: v("secret.label"),
        whisperRoll: !!form.querySelector('[name="secret.whisperRoll"]')?.checked
      },
      priceMultiplier: Number(v("priceMultiplier")) || 1, soundscape: v("soundscape"), sound: v("sound")
    };
    // Only keep what differs from the shop as it is now, so the pack's two-language texts survive untouched fields.
    const s = shop(id);
    const same = (a, b) => String(a ?? "") === String(b ?? "");
    for (const k of ["name", "place", "flair", "description"]) if (same(patch[k], local(s[k]))) delete patch[k];
    for (const k of ["nameEn", "type", "img", "soundscape", "sound"]) if (same(patch[k], s[k])) delete patch[k];
    if (patch.priceMultiplier === s.priceMultiplier) delete patch.priceMultiplier;
    for (const k of Object.keys(patch.owner)) if (same(patch.owner[k], local(s.owner[k]))) delete patch.owner[k];
    if (same(patch.secret.label, local(s.secret.label))) delete patch.secret.label;
    await trade.editShop(id, patch);
    this.#editing = null;
    info("Notify.Saved");
    this.render();
  }

  async #create() {
    const name = this.element.querySelector('[name="new-name"]')?.value ?? "";
    const type = this.element.querySelector('[name="new-type"]')?.value ?? "general";
    const id = await trade.createShop({ name, type });
    if (!id) return;
    this.#shopId = id;
    this.#editing = id;
    this.render();
  }

  async #delete(id) {
    const s = shop(id);
    if (!s) return;
    const DialogV2 = foundry.applications.api.DialogV2;
    const yes = await DialogV2.confirm({
      window: { title: t(s.fromPack ? "Console.ClearShop" : "Console.DeleteShop") },
      content: `<p>${esc(t(s.fromPack ? "Console.ClearConfirm" : "Console.DeleteConfirm", { name: local(s.name) }))}</p>`
    });
    if (!yes) return;
    await trade.deleteShop(id);
    this.render();
  }

  async #import(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { return warn("Notify.PackNotJSON"); }
    const errors = await importPack(data, validatePack);
    if (errors.length) {
      const DialogV2 = foundry.applications.api.DialogV2;
      return DialogV2.prompt({ window: { title: t("Notify.PackErrors") }, content: `<ul>${errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` });
    }
    info("Notify.PackImported", { n: (data.shops ?? []).length });
    this.render();
  }

  async #openPage() {
    const p = (await page()) ?? (await syncPage());
    if (!p) return warn("Notify.NoPage");
    p.parent?.sheet?.render({ force: true, pageId: p.id });
  }
}
