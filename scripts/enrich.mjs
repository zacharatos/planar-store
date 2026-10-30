// Journal buttons for prep notes and run sheets, GM only (players see the label as plain text):
//   @Shop[Το Οπλοστάσιο]                 the console, on that shop (pick who goes in)
//   @Shop[Το Οπλοστάσιο | all]{Μπαίνετε}  open it for every player online
//   @Shop[Το Οπλοστάσιο | close]          close it for everyone
import { MODULE_ID, TYPE_ICON } from "./constants.mjs";
import { t, warn } from "./i18n.mjs";
import { resolveShop, local } from "./state.mjs";
import { escapeHTML as esc, parseShopArgs } from "./util.mjs";
import { openShop, closeShop } from "./trade.mjs";

const PATTERN = /@Shop\[([^\]]+)\](?:\{([^}]+)\})?/g;
const VERB_ICON = { all: "fa-door-open", close: "fa-door-closed" };

function enrich(match) {
  const [, args, label] = match;
  const { target, verb } = parseShopArgs(args);
  if (!game.user.isGM) {
    const span = document.createElement("span");
    span.textContent = label || target;
    return span;
  }
  const s = resolveShop(target);
  const a = document.createElement("a");
  a.className = "pst-button";
  a.dataset.args = args;
  a.title = t(`Enricher.${verb}`);
  a.innerHTML = `<i class="fa-solid ${VERB_ICON[verb] ?? TYPE_ICON[s?.type] ?? "fa-store"}"></i> ${esc(label || (s ? local(s.name) : target))}`;
  return a;
}

async function onClick(ev) {
  const a = ev.target.closest?.("a.pst-button");
  if (!a || !game.user.isGM) return;
  ev.preventDefault();
  ev.stopPropagation();
  const { target, verb } = parseShopArgs(a.dataset.args);
  const s = resolveShop(target);
  if (!s) return warn("Notify.NoShop", { name: target });
  try {
    if (verb === "all") await openShop(s.id, "all");
    else if (verb === "close") await closeShop(s.id);
    else game.modules.get(MODULE_ID)?.api?.console({ tab: "shops", shopId: s.id });
  } catch (err) {
    console.error(`${MODULE_ID} | @Shop`, err);
    warn("Notify.Failed");
  }
}

/** init: register the enricher. */
export function registerEnrichers() {
  CONFIG.TextEditor?.enrichers?.push({ pattern: PATTERN, enricher: enrich });
}

/** ready (GM): one delegated click listener for every button in every journal. */
export function listenForClicks() {
  if (game.user.isGM) document.body.addEventListener("click", onClick, true);
}
