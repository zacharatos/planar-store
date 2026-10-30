// Socket traffic. The active GM's client is the only one that writes; players only ask.
//   ask    player -> GM      { kind: "buy" | "secret" | "leave", data }   (one request, one answer)
//   answer GM -> player      { res }
// Opening and closing a shop needs no message: the GM writes the world setting "live", every client hears the
// change, and each player's screen opens or closes itself (also after a reload).
import { EVENT, MODULE_ID, REPLY_TIMEOUT_MS } from "./constants.mjs";

const waiting = new Map(); // player: request id -> resolve(res)
let handlers = {};

const isActiveGM = () => !!game.users.activeGM?.isSelf;
const emit = msg => game.socket.emit(EVENT, { ...msg, from: game.user.id });

/** handlers: { buy(userId, data), secret(userId, data), leave(userId, data) } on the GM's side. */
export function registerSocket(h) {
  handlers = h;
  game.socket.on(EVENT, onMessage);
}

/**
 * Ask the GM to do something. The GM's own client runs it directly.
 * @returns {Promise<{ok: boolean, error?: string, [k: string]: any}>}
 */
export async function ask(kind, data = {}) {
  if (isActiveGM()) return handlers[kind]?.(game.user.id, data) ?? { ok: false, error: "Unknown" };
  if (!game.users.activeGM) return { ok: false, error: "NoGM" };
  const id = foundry.utils.randomID();
  const reply = new Promise(resolve => {
    const timer = setTimeout(() => { waiting.delete(id); resolve({ ok: false, error: "NoReply" }); }, REPLY_TIMEOUT_MS);
    waiting.set(id, res => { clearTimeout(timer); waiting.delete(id); resolve(res); });
  });
  emit({ op: "ask", id, kind, data });
  return reply;
}

export async function onMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  try {
    if (msg.op === "ask" && isActiveGM()) {
      const user = game.users.get(msg.from);
      if (!user) return;
      let res;
      try { res = (await handlers[msg.kind]?.(user.id, msg.data ?? {})) ?? { ok: false, error: "Unknown" }; }
      catch (err) { console.error(`${MODULE_ID} | ${msg.kind}`, err); res = { ok: false, error: "Failed" }; }
      emit({ op: "answer", id: msg.id, to: msg.from, res });
    } else if (msg.op === "answer" && msg.to === game.user.id && game.users.get(msg.from)?.isGM) {
      waiting.get(msg.id)?.(msg.res ?? { ok: false });
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | socket ${msg.op}`, err);
  }
}
