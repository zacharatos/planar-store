// The "Purchases" journal page: every purchase and secret-shelf roll, rebuilt from the ledger.
// A Planar Codex note when the Codex is installed (so it exports to the vault), otherwise a GM-only Markdown page.
import { MODULE_ID, PAGE_FOLDER } from "./constants.mjs";
import { t } from "./i18n.mjs";
import { setting, setSetting } from "./settings.mjs";
import { pageMarkdown } from "./util.mjs";
import { serial, ledger } from "./state.mjs";

export function markdown() {
  return pageMarkdown(ledger(), {
    title: setting("pageName") || t("Page.Title"),
    intro: t("Page.Intro"),
    none: t("Page.None"),
    secret: t("Page.Secret"),
    gm: t("Page.GM"),
    party: t("Ledger.Party"),
    undone: t("Ledger.Undone"),
    cols: Object.fromEntries(["when", "session", "hero", "shop", "what", "paid"].map(c => [c, t(`Page.Col.${c}`)]))
  });
}

function toHTML(md) {
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, "");
  const conv = globalThis.showdown ? new globalThis.showdown.Converter({ tables: true, strikethrough: true }) : null;
  return conv ? conv.makeHtml(body) : `<pre>${foundry.utils.escapeHTML?.(body) ?? body}</pre>`;
}

/** The page, if it still exists. */
export async function page() {
  const uuid = setting("pageUuid");
  return uuid ? fromUuid(uuid).catch(() => null) : null;
}

/** Create or update the page (GM only, inside serial()). */
export async function syncPage() {
  if (!game.user.isGM) return null;
  const md = markdown();
  const codex = game.modules.get("planar-codex");
  const api = codex?.active ? codex.api : null;
  const html = api?.convert ? api.convert(md, { gm: true }).html : toHTML(md);
  let p = await page();
  if (p) {
    await p.update({ "text.markdown": md, "text.content": html });
    return p;
  }
  const name = setting("pageName") || t("Page.Title");
  if (api?.createCodexNote) {
    p = await api.createCodexNote({ name, markdown: md });
  } else {
    let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === PAGE_FOLDER);
    folder ??= await Folder.create({ name: PAGE_FOLDER, type: "JournalEntry" });
    const entry = await JournalEntry.create({
      name, folder: folder.id,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
      pages: [{ name, type: "text", text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN, markdown: md, content: html } }]
    });
    p = entry.pages.contents[0];
  }
  if (p?.uuid) await setSetting("pageUuid", p.uuid);
  return p;
}

let timer = null;
/** Rebuild the page 2 s after the last change. */
export function schedulePageSync() {
  if (!game.user.isGM || !game.users.activeGM?.isSelf) return;
  clearTimeout(timer);
  timer = setTimeout(() => serial(syncPage).catch(err => console.warn(`${MODULE_ID} | page`, err)), 2000);
}
