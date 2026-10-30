import { MODULE_ID } from "./constants.mjs";

const hidden = (key, type, def, onChange) => game.settings.register(MODULE_ID, key, {
  scope: "world", config: false, type, default: def, onChange
});
const world = (key, type, def, extra = {}) => game.settings.register(MODULE_ID, key, {
  name: `PLANAR_STORE.Settings.${key}.Name`, hint: `PLANAR_STORE.Settings.${key}.Hint`,
  scope: "world", config: true, type, default: def, ...extra
});

/**
 * World data lives in hidden world settings, written only by the active GM's client:
 *   state  every shop's stock, the GM's edits, hand-made shops, visit counts
 *   live   which shops are open, for whom, and who opened the secret shelf this visit
 *   ledger purchases and secret-shelf rolls
 *   pack   the imported campaign pack
 * onChange lets every client's windows (and the players' shop screens) redraw.
 */
export function registerSettings({ onChange } = {}) {
  hidden("state", Object, { schema: 1, shops: {} }, () => onChange?.("state"));
  hidden("live", Object, { schema: 1, open: {} }, () => onChange?.("live"));
  hidden("ledger", Object, { schema: 1, entries: [] }, () => onChange?.("ledger"));
  hidden("pack", Object, null, () => onChange?.("pack"));
  hidden("session", String, "", () => onChange?.("session"));
  hidden("pageUuid", String, "");

  world("partyPurse", Boolean, true, { onChange: () => onChange?.("live") });
  world("soundscapes", Boolean, true);
  world("volume", Number, 0.7, { range: { min: 0, max: 1, step: 0.05 } });
  world("textLanguage", String, "auto", { choices: {
    auto: "PLANAR_STORE.Settings.textLanguage.Auto", en: "English", el: "Ελληνικά"
  }, onChange: () => onChange?.("language") });
  // Each user's own choice (the EN/ΕΛ button). "world" follows the world default.
  game.settings.register(MODULE_ID, "language", {
    name: "PLANAR_STORE.Settings.language.Name", hint: "PLANAR_STORE.Settings.language.Hint",
    scope: "client", config: true, type: String, default: "world",
    choices: { world: "PLANAR_STORE.Settings.language.World", en: "English", el: "Ελληνικά" },
    onChange: () => onChange?.("language")
  });
  world("pageName", String, "Purchases");
}

export const setting = key => game.settings.get(MODULE_ID, key);
export const setSetting = (key, value) => game.settings.set(MODULE_ID, key, value);
