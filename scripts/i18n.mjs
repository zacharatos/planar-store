// Interface text. The module keeps its own English and Greek dictionaries, so each user can switch the
// module's language without switching all of Foundry (setting "language", the EN/ΕΛ button in its windows).
// Until the dictionaries are loaded, and for anything missing, Foundry's own i18n answers.
import { MODULE_ID } from "./constants.mjs";
import { lookup, fill, LANGUAGES } from "./util.mjs";

const PREFIX = "PLANAR_STORE.";
const dict = {};
let current = () => (game.i18n?.lang === "el" ? "el" : "en");

/** Load lang/en.json and lang/el.json (once, on ready). */
export async function loadDictionaries() {
  await Promise.all(LANGUAGES.map(async lang => {
    try { dict[lang] = (await (await fetch(`modules/${MODULE_ID}/lang/${lang}.json`)).json())?.PLANAR_STORE ?? null; }
    catch (err) { console.warn(`${MODULE_ID} | lang/${lang}.json`, err); }
  }));
}

/** Who decides the language (state.mjs hands in its textLang). */
export const setLanguageSource = fn => { current = fn; };
export const language = () => current();

/** Localize a key under PLANAR_STORE.*, optionally with {placeholders}. */
export function t(key, data) {
  const text = lookup(dict[current()], key) ?? lookup(dict.en, key);
  if (text !== undefined) return fill(text, data);
  return data ? game.i18n.format(PREFIX + key, data) : game.i18n.localize(PREFIX + key);
}

export const warn = (key, data) => ui.notifications.warn(t(key, data));
export const info = (key, data) => ui.notifications.info(t(key, data));
