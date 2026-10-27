'use strict';

const { createHash } = require('node:crypto');
const mongoose = require('mongoose');
const Model = require('../models/unansweredQuestion.model');
const VariantModel = require('../models/unansweredQuestionVariant.model');
const { canonicalizeQuestion: defaultCanonicalize, validateCanonicalQuestion } = require('./unansweredQuestion.canonicalize');

function normalizeQuestion(question) {
  return question.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim().replace(/[?!.]+$/u, '').trim();
}

function objectId(value) {
  const text = typeof value === 'string' ? value : value?.toHexString?.();
  return /^[a-f\d]{24}$/i.test(text || '') ? new mongoose.Types.ObjectId(text) : null;
}

// Never trust profile names, organizations, or grants sent in chat input. This
// runs only for unanswered turns and uses a bounded, projected authorization read.
async function resolveCaptureProfiles(input, context, { db = mongoose.connection.readyState === 1 ? mongoose.connection.db : null } = {}) {
  if (!db) return [];
  const userId = objectId(context.userId);
  const configId = objectId(context.configId);
  if (!userId || !configId) return [];
  const supplied = input.profileIds || context.profileIds || [];
  const ids = [...new Set((Array.isArray(supplied) ? supplied : []).map(String))];
  if (!ids.length || ids.length > 20 || ids.some(id => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) return [];
  const config = await db.collection('configs').findOne({ _id: configId, isActive: true }, { projection: { organizationId: 1 }, maxTimeMS: 2000 });
  const organizationId = objectId(config?.organizationId);
  if (!organizationId || (context.organizationId && String(context.organizationId) !== String(organizationId))) return [];
  const grants = await db.collection('profilebasedpermissions').find({ userId, configId, organizationId, profileId: { $in: ids.map(Number) }, hasAccess: true }, { projection: { profileId: 1 }, maxTimeMS: 2000 }).toArray();
  const allowed = new Set(grants.map(grant => String(grant.profileId)));
  if (ids.some(id => !allowed.has(id))) return [];
  const profiles = await db.collection('profiles').find({ configId, profileId: { $in: ids.map(Number) }, isActive: true }, { projection: { profileId: 1, name: 1, profileName: 1 }, maxTimeMS: 2000 }).toArray();
  if (profiles.length !== ids.length) return [];
  return profiles.map(profile => ({ profileId: String(profile.profileId), profileName: profile.name || profile.profileName || '', userId, configId, organizationId }));
}

function createUnansweredQuestionRecorder({ model = Model, variantModel = VariantModel, canonicalizeQuestion = defaultCanonicalize, resolveProfiles = resolveCaptureProfiles, now = () => new Date(), logger = console } = {}) {
  const pending = new Map();
  const hash = text => createHash('sha256').update(text).digest('hex');

  async function prepareQuestion(question, profile, originalHash) {
    const scope = { configId: profile.configId, profileId: profile.profileId };
    const key = `${scope.configId}:${scope.profileId}:${originalHash}`;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      const variant = await variantModel.findOne({ ...scope, originalHash }).select('questionHash').maxTimeMS(2000).lean();
      if (variant) {
        const existing = await model.findOne({ ...scope, questionHash: variant.questionHash }).select('question questionHash normalizedQuestion').maxTimeMS(2000).lean();
        if (existing) return existing;
      }
      const terms = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,40}/gu) || [])].slice(0, 20).join(' ');
      const [similar, recent] = await Promise.all([
        terms ? model.find({ ...scope, $text: { $search: terms } }).select({ question: 1, questionHash: 1, score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } }).limit(10).maxTimeMS(2000).lean() : [],
        model.find(scope).sort({ lastAskedAt: -1, _id: -1 }).select('question questionHash').limit(10).maxTimeMS(2000).lean(),
      ]);
      const candidates = [];
      let chars = 0;
      for (const row of [...similar, ...recent]) {
        if (typeof row.question !== 'string' || candidates.some(candidate => candidate.questionHash === row.questionHash)) continue;
        if (chars + row.question.length + 100 > 16000) continue;
        candidates.push({ question: row.question, questionHash: row.questionHash });
        chars += row.question.length + 100;
      }
      const revised = validateCanonicalQuestion(await canonicalizeQuestion({ question, candidates }), question, candidates);
      const normalizedQuestion = normalizeQuestion(revised.question);
      return { question: revised.question, normalizedQuestion, questionHash: revised.existingQuestionHash || hash(normalizedQuestion) };
    })();
    // Coalesce bursts without retaining arbitrary user text after the call.
    if (pending.size < 100) pending.set(key, task);
    try { return await task; } finally { if (pending.get(key) === task) pending.delete(key); }
  }
  return async function record(input = {}, context = {}, reason = 'unanswered') {
    const question = typeof input.message === 'string' ? input.message.trim() : '';
    if (!question || !['unsupported', 'unanswered', 'error'].includes(reason)) return false;
    if (question.length > 12000) {
      logger.warn?.('[unanswered-question] Question exceeds canonicalization input limit');
      return false;
    }
    try {
      const profiles = await resolveProfiles(input, context);
      const normalizedQuestion = normalizeQuestion(question);
      if (!normalizedQuestion) return false;
      if (!profiles.length) return false;
      // The app disables global autoIndex. These two models explicitly opt in;
      // init() is cached by Mongoose and waits for their unique/text indexes.
      await Promise.all([model.init?.(), variantModel.init?.()]);
      const originalHash = hash(normalizedQuestion);
      const timestamp = now();
      await Promise.all(profiles.map(async profile => {
        const canonical = await prepareQuestion(question, profile, originalHash);
        const questionHash = canonical.questionHash;
        const filter = { configId: profile.configId, profileId: profile.profileId, questionHash };
        const update = {
          $setOnInsert: { question: canonical.question, questionTruncated: false, normalizedQuestion: canonical.normalizedQuestion || normalizeQuestion(canonical.question) },
          $set: { organizationId: profile.organizationId, profileName: profile.profileName, userId: profile.userId, reason },
          $min: { firstAskedAt: timestamp },
          $max: { lastAskedAt: timestamp },
          $inc: { count: 1 },
        };
        try {
          await model.updateOne(filter, update, { upsert: true, maxTimeMS: 2000 });
        } catch (error) {
          // Two first occurrences can race on the unique grouping index.
          if (error.code !== 11000) throw error;
          await model.updateOne(filter, { $set: update.$set, $inc: update.$inc, $min: update.$min, $max: update.$max }, { maxTimeMS: 2000 });
        }
        try {
          await variantModel.updateOne({ configId: profile.configId, profileId: profile.profileId, originalHash }, { $set: { questionHash } }, { upsert: true, maxTimeMS: 2000 });
        } catch (_) {
          // A missing optimization mapping never cancels a recorded occurrence.
          logger.warn?.('[unanswered-question] Variant mapping failed');
        }
      }));
      return profiles.length > 0;
    } catch (_) {
      // Recording must not break the user's chat. Do not log question contents.
      logger.warn?.('[unanswered-question] Recording failed');
      return false;
    }
  };
}

module.exports = { normalizeQuestion, resolveCaptureProfiles, createUnansweredQuestionRecorder, recordUnansweredQuestion: createUnansweredQuestionRecorder() };
