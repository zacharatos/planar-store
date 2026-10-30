export const MODULE_ID = "planar-store";
export const EVENT = `module.${MODULE_ID}`;

/** The generic pack shipped with the module (type names in English and Greek, one sample shop, no campaign content). */
export const DEFAULT_PACK_PATH = `modules/${MODULE_ID}/data/default-pack.json`;

/** Journal folder for the ledger page when Planar Codex is not installed. */
export const PAGE_FOLDER = "Planar Store";

/** How long a player waits for the GM to answer a purchase or a secret-shelf roll. */
export const REPLY_TIMEOUT_MS = 10000;

/** Icons per shop type and per shelf (Font Awesome). */
export const TYPE_ICON = { general: "fa-scale-balanced", blacksmith: "fa-hammer", alchemist: "fa-flask" };
export const CATEGORY_ICON = {
  weapons: "fa-khanda", armor: "fa-shirt", shields: "fa-shield-halved", ammunition: "fa-bullseye", potions: "fa-flask",
  poisons: "fa-skull-crossbones", scrolls: "fa-scroll", consumables: "fa-vial", tools: "fa-screwdriver-wrench",
  gear: "fa-suitcase", food: "fa-drumstick-bite", other: "fa-box"
};

/** Foundry's own sound, used when neither the pack nor the shop names one. */
export const DEFAULT_SOUND = "sounds/notify.wav";
