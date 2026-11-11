/**
 * Prevents api-server/services/redis.service.js from opening a real Redis
 * network connection when a module under test imports it.
 */
const path = require("path");

const target = path.resolve(__dirname, "../../api-server/services/redis.service.js");

const noop = async () => null;
const stub = new Proxy(
  {},
  {
    get: (_obj, prop) => (prop === "__esModule" || prop === "then" ? undefined : noop),
  }
);

require.cache[target] = {
  id: target,
  filename: target,
  loaded: true,
  exports: stub,
  children: [],
  paths: [],
};

module.exports = { target };
