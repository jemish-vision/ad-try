'use strict';

/**
 * Small in-memory stand-in for a Mongoose model, for tests that need MongoDB's per-document
 * atomicity without a database. Every operation yields to the event loop first and then runs to
 * completion in one step, so concurrent callers interleave between operations exactly like
 * separate MongoDB commands would. Supports what the AI credit code uses:
 * create, findOne, findById, find (sort/skip/limit/select), countDocuments,
 * findOneAndUpdate / updateOne ($set, $inc, $push, $setOnInsert, upsert, new, pipeline $set/$unset), unique indexes.
 */
const mongoose = require('mongoose');

const tick = () => new Promise((r) => setImmediate(r));
const clone = (v) => {
  if (v instanceof Date) return new Date(v.getTime());
  if (v instanceof mongoose.Types.ObjectId) return v;
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
  return v;
};
const scalar = (v) => (v instanceof Date ? v.getTime() : v instanceof mongoose.Types.ObjectId ? String(v) : v);
const get = (doc, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
const eq = (a, b) => {
  if (Array.isArray(a)) return a.some((x) => eq(x, b));
  return scalar(a) === scalar(b) || (a == null && b == null);
};

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    const value = get(doc, key);
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !(cond instanceof mongoose.Types.ObjectId) && !Array.isArray(cond)) {
      return Object.entries(cond).every(([op, arg]) => {
        const v = scalar(value);
        const a = scalar(arg);
        switch (op) {
          case '$gte': return v != null && v >= a;
          case '$gt': return v != null && v > a;
          case '$lte': return v != null && v <= a;
          case '$lt': return v != null && v < a;
          case '$in': return arg.some((x) => eq(value, x));
          case '$ne': return !eq(value, arg);
          default: throw new Error(`fake: unsupported operator ${op}`);
        }
      });
    }
    return eq(value, cond);
  });
}

// Aggregation-pipeline updates: $set / $unset stages with the arithmetic operators the app uses.
function evalExpr(doc, e) {
  if (typeof e === 'string' && e.startsWith('$')) return doc[e.slice(1)];
  if (!e || typeof e !== 'object' || e instanceof Date) return e;
  const [[op, args]] = Object.entries(e);
  if (op === '$literal') return args;
  const v = Array.isArray(args) ? args.map((a) => evalExpr(doc, a)) : evalExpr(doc, args);
  switch (op) {
    case '$add': return v.reduce((a, b) => (a ?? 0) + (b ?? 0), 0);
    case '$subtract': return (v[0] ?? 0) - (v[1] ?? 0);
    case '$min': return Math.min(...v);
    case '$max': return Math.max(...v);
    case '$ifNull': return v[0] ?? v[1];
    case '$round': return Math.round(v[0] * 10 ** (v[1] || 0)) / 10 ** (v[1] || 0);
    default: throw new Error(`fake: unsupported expression ${op}`);
  }
}

function applyPipeline(doc, stages) {
  for (const stage of stages) {
    if (stage.$set) {
      const input = clone(doc); // expressions in one stage all see the stage's input
      for (const [k, e] of Object.entries(stage.$set)) doc[k] = evalExpr(input, e);
    } else if (stage.$unset) {
      for (const k of [].concat(stage.$unset)) Reflect.deleteProperty(doc, k);
    } else throw new Error(`fake: unsupported pipeline stage ${Object.keys(stage)[0]}`);
  }
  return doc;
}

function applyUpdate(doc, update = {}, isInsert = false) {
  if (Array.isArray(update)) return applyPipeline(doc, update);
  const plain = Object.keys(update).every((k) => !k.startsWith('$'));
  if (plain) return Object.assign(doc, clone(update));
  for (const [k, v] of Object.entries(update.$set || {})) doc[k] = clone(v);
  for (const [k, v] of Object.entries(update.$inc || {})) doc[k] = (Number(doc[k]) || 0) + v;
  for (const [k, v] of Object.entries(update.$push || {})) doc[k] = [...(Array.isArray(doc[k]) ? doc[k] : []), clone(v)];
  if (isInsert) for (const [k, v] of Object.entries(update.$setOnInsert || {})) doc[k] = clone(v);
  return doc;
}

function query(run) {
  const state = { sort: null, skip: 0, limit: null };
  const q = {
    select: () => q,
    populate: () => q,
    sort: (s) => ((state.sort = s), q),
    skip: (n) => ((state.skip = n), q),
    limit: (n) => ((state.limit = n), q),
    lean: () => run(state),
    then: (res, rej) => run(state).then(res, rej),
  };
  return q;
}

function createFakeModel(name, { unique = [], defaults = {} } = {}) {
  const docs = [];
  const checkUnique = (doc, except = null) => {
    for (const keys of unique) {
      if (keys.every((k) => get(doc, k) == null)) continue;
      const clash = docs.find((d) => d !== except && keys.every((k) => eq(get(d, k), get(doc, k))));
      if (clash) {
        const err = new Error(`E11000 duplicate key error collection: ${name} index: ${keys.join('_')}`);
        err.code = 11000;
        throw err;
      }
    }
  };
  const insert = (data) => {
    const now = new Date();
    const doc = { _id: new mongoose.Types.ObjectId(), ...clone(defaults), ...clone(data), createdAt: data.createdAt || now, updatedAt: now };
    checkUnique(doc);
    docs.push(doc);
    return doc;
  };

  const model = {
    modelName: name,
    docs,
    reset: () => docs.splice(0, docs.length),
    async create(data) {
      await tick();
      return clone(insert(data));
    },
    findOne: (filter) => query(async () => {
      await tick();
      const d = docs.find((x) => matches(x, filter));
      return d ? clone(d) : null;
    }),
    findById: (id) => model.findOne({ _id: id }),
    find: (filter = {}) => query(async (state) => {
      await tick();
      let rows = docs.filter((x) => matches(x, filter));
      if (state.sort) {
        const [[k, dir]] = Object.entries(state.sort);
        rows = rows.slice().sort((a, b) => (scalar(get(a, k)) > scalar(get(b, k)) ? dir : scalar(get(a, k)) < scalar(get(b, k)) ? -dir : 0));
      }
      rows = rows.slice(state.skip, state.limit == null ? undefined : state.skip + state.limit);
      return rows.map(clone);
    }),
    async countDocuments(filter = {}) {
      await tick();
      return docs.filter((x) => matches(x, filter)).length;
    },
    findOneAndUpdate: (filter, update, opts = {}) => query(async () => {
      await tick();
      let d = docs.find((x) => matches(x, filter));
      if (!d) {
        if (!opts.upsert) return null;
        const base = Object.fromEntries(Object.entries(filter).filter(([, v]) => v === null || typeof v !== 'object' || v instanceof Date || v instanceof mongoose.Types.ObjectId));
        d = insert(applyUpdate({ ...base }, update, true));
        return clone(d);
      }
      const before = clone(d);
      const after = applyUpdate(clone(d), update);
      checkUnique(after, d);
      Object.assign(d, after, { updatedAt: new Date() });
      return clone(opts.new ? d : before);
    }),
    async updateOne(filter, update) {
      await tick();
      const d = docs.find((x) => matches(x, filter));
      if (!d) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(d, applyUpdate(clone(d), update), { updatedAt: new Date() });
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async createIndexes() {},
    async aggregate() {
      return [];
    },
  };
  return model;
}

module.exports = { createFakeModel, matches };
