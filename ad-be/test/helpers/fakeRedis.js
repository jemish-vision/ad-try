/**
 * In-memory fake of the ioredis methods this project uses.
 * Supports: get, set (with "EX"/"PX" and "NX"), del, exists, keys (glob "*"),
 * expire, ttl, incr, and eval (for release/renew Lua scripts).
 * Expiry follows an injectable clock (ms function).
 */
function createFakeRedis({ nowMs = () => Date.now() } = {}) {
  const store = new Map(); // key -> { value, expiresAt|null }

  const alive = (key) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= nowMs()) {
      store.delete(key);
      return null;
    }
    return entry;
  };

  return {
    async get(key) {
      const e = alive(key);
      return e ? e.value : null;
    },

    async set(key, value, ...args) {
      let ttlMs = null;
      let nx = false;
      for (let i = 0; i < args.length; i++) {
        const a = String(args[i]).toUpperCase();
        if (a === "EX") ttlMs = Number(args[++i]) * 1000;
        else if (a === "PX") ttlMs = Number(args[++i]);
        else if (a === "NX") nx = true;
      }
      if (nx && alive(key)) return null;
      store.set(key, { value: String(value), expiresAt: ttlMs === null ? null : nowMs() + ttlMs });
      return "OK";
    },

    async del(...keys) {
      let n = 0;
      for (const k of keys.flat()) if (alive(k) && store.delete(k)) n++;
      return n;
    },

    async exists(key) {
      return alive(key) ? 1 : 0;
    },

    async keys(pattern = "*") {
      const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
      return [...store.keys()].filter((k) => alive(k) && re.test(k));
    },

    async expire(key, seconds) {
      const e = alive(key);
      if (!e) return 0;
      e.expiresAt = nowMs() + seconds * 1000;
      return 1;
    },

    async ttl(key) {
      const e = alive(key);
      if (!e) return -2;
      if (e.expiresAt === null) return -1;
      return Math.ceil((e.expiresAt - nowMs()) / 1000);
    },

    async incr(key) {
      const e = alive(key);
      const next = (e ? Number(e.value) : 0) + 1;
      store.set(key, { value: String(next), expiresAt: e ? e.expiresAt : null });
      return next;
    },

    // Evaluates Lua scripts used in distributed profile locking (release & renew)
    async eval(script, numKeys, key, ...args) {
      const e = alive(key);
      const currentValue = e ? e.value : null;
      const expectedToken = String(args[0]);

      if (script.includes("del")) {
        // RELEASE_LUA: if get == token then del else 0
        if (currentValue === expectedToken) {
          store.delete(key);
          return 1;
        }
        return 0;
      }

      if (script.includes("pexpire")) {
        // RENEW_LUA: if get == token then pexpire else 0
        const ttlMs = Number(args[1]);
        if (currentValue === expectedToken) {
          e.expiresAt = nowMs() + ttlMs;
          return 1;
        }
        return 0;
      }

      throw new Error(`Unsupported Lua script in fakeRedis: ${script}`);
    },

    _store: store,
  };
}

module.exports = { createFakeRedis };
