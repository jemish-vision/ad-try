'use strict';

/**
 * Buying extra AI credits with Stripe Checkout (one-off payment).
 *
 * Flow: startCheckout() creates a PENDING payment + Checkout session → the buyer pays on Stripe →
 * credits are added when Stripe confirms the payment, by whichever arrives first: the webhook
 * (checkout.session.completed / async_payment_succeeded) or the success page calling verifyCheckout().
 * Both paths call fulfill(), which adds the credits at most once (ledger dedupeKey per payment) and
 * only after checking the session belongs to the payment and the amount and currency match.
 *
 * Other outcomes: async_payment_failed → FAILED; expired or cancelled by the buyer → CANCELLED;
 * a declined card keeps the payment PENDING (the buyer can retry on the same checkout page).
 */
const mongoose = require('mongoose');
const packageModel = require('../../models/aiCreditPackage.model');
const paymentModel = require('../../models/aiCreditPayment.model');
const regionModel = require('../../models/pricingRegion.model');
const userModel = require('../../models/user.model');
const pricing = require('../../helper/regionalPricing');
const credits = require('./aiCredit.service');
const { write_logs } = require('../../../winston/utility/logger');

const { AiCreditsError } = credits;
const KIND = 'ai_credits';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
const isId = (id) => id && mongoose.Types.ObjectId.isValid(String(id));

// ── Stripe client (lazy; tests replace it) ───────────────────────────────────
let stripeClient = null;
function stripe() {
  if (!stripeClient) {
    const Stripe = require('stripe');
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}
function setStripeClient(client) {
  stripeClient = client;
}

// autoIndex is off for the app connection: create the payment/package indexes once, lazily
let indexesReady = null;
function ensureIndexes() {
  if (!indexesReady) {
    indexesReady = Promise.all([paymentModel, packageModel].map((m) => (typeof m.createIndexes === 'function' ? m.createIndexes() : null))).catch(() => {
      indexesReady = null;
    });
  }
  return indexesReady;
}

// ── Packages ─────────────────────────────────────────────────────────────────
function validatePackageInput(input = {}, { partial = false } = {}) {
  const errors = [];
  const has = (k) => input[k] !== undefined;
  if (!partial || has('name')) if (!String(input.name || '').trim()) errors.push('Package name is required');
  if (!partial || has('credits')) {
    const c = Number(input.credits);
    if (!Number.isFinite(c) || c < 1) errors.push('Credits must be 1 or more');
  }
  if (!partial || has('price')) {
    const p = Number(input.price);
    if (!Number.isFinite(p) || p <= 0) errors.push('Price must be greater than 0');
  }
  if (has('currency') && !/^[A-Za-z]{3}$/.test(String(input.currency || ''))) errors.push('Currency must be a 3-letter code');
  if (has('regionalPrices')) {
    if (!Array.isArray(input.regionalPrices)) errors.push('regionalPrices must be a list');
    else {
      const seen = new Set();
      input.regionalPrices.forEach((r, i) => {
        if (!isId(r?.regionId)) errors.push(`regionalPrices[${i}].regionId is invalid`);
        else if (seen.has(String(r.regionId))) errors.push(`regionalPrices has a region twice`);
        seen.add(String(r?.regionId));
        const p = Number(r?.price);
        if (!Number.isFinite(p) || p <= 0) errors.push(`regionalPrices[${i}].price must be greater than 0`);
      });
    }
  }
  return errors;
}

function packageFields(input) {
  const out = {};
  if (input.name !== undefined) out.name = String(input.name).trim().slice(0, 80);
  if (input.description !== undefined) out.description = String(input.description || '').trim().slice(0, 300);
  if (input.credits !== undefined) out.credits = Math.round(Number(input.credits));
  if (input.price !== undefined) out.price = round2(input.price);
  if (input.currency !== undefined) out.currency = String(input.currency).toUpperCase();
  if (input.regionalPrices !== undefined) out.regionalPrices = input.regionalPrices.map((r) => ({ regionId: toObjectId(r.regionId), price: round2(r.price) }));
  if (input.isActive !== undefined) out.isActive = Boolean(input.isActive);
  if (input.isPopular !== undefined) out.isPopular = Boolean(input.isPopular);
  if (input.sortOrder !== undefined) out.sortOrder = Number(input.sortOrder) || 0;
  return out;
}

async function createPackage(input, actorId) {
  await ensureIndexes();
  const errors = validatePackageInput(input);
  if (errors.length) throw new AiCreditsError('INVALID_PACKAGE', errors.join('; '));
  const doc = await packageModel.create({ ...packageFields(input), updatedBy: actorId ? toObjectId(actorId) : null });
  return typeof doc.toObject === 'function' ? doc.toObject() : doc;
}

async function updatePackage(packageId, input, actorId) {
  if (!isId(packageId)) throw new AiCreditsError('INVALID_PACKAGE', 'packageId is required');
  const errors = validatePackageInput(input, { partial: true });
  if (errors.length) throw new AiCreditsError('INVALID_PACKAGE', errors.join('; '));
  const before = await packageModel.findOne({ _id: packageId, isDeleted: { $ne: true } }).lean();
  if (!before) throw new AiCreditsError('PACKAGE_NOT_FOUND', 'Package not found');
  const after = await packageModel.findOneAndUpdate({ _id: packageId }, { $set: { ...packageFields(input), updatedBy: actorId ? toObjectId(actorId) : null } }, { new: true }).lean();
  return { before, after };
}

/** Packages that were bought stay in the database (hidden) so payment history keeps its link. */
async function deletePackage(packageId, actorId) {
  if (!isId(packageId)) throw new AiCreditsError('INVALID_PACKAGE', 'packageId is required');
  const before = await packageModel.findOne({ _id: packageId, isDeleted: { $ne: true } }).lean();
  if (!before) throw new AiCreditsError('PACKAGE_NOT_FOUND', 'Package not found');
  await packageModel.findOneAndUpdate({ _id: packageId }, { $set: { isDeleted: true, isActive: false, updatedBy: actorId ? toObjectId(actorId) : null } }).lean();
  return before;
}

async function listPackagesForAdmin() {
  const [packages, regions] = await Promise.all([
    packageModel.find({ isDeleted: { $ne: true } }).sort({ sortOrder: 1, credits: 1 }).lean(),
    regionModel.find({}).select('name currency countries isActive').sort({ name: 1 }).lean(),
  ]);
  return { packages, regions };
}

/** The price a visitor pays for a package: their region's price when set, else the default. */
function priceForPackage(pkg, { region, country } = {}) {
  const entry = region ? (pkg.regionalPrices || []).find((r) => String(r.regionId) === String(region._id)) : null;
  if (entry && entry.price > 0) {
    return { price: round2(entry.price), currency: String(region.currency).toUpperCase(), regionId: String(region._id), regionName: region.name, country: country || null, isRegional: true };
  }
  return { price: round2(pkg.price), currency: String(pkg.currency || 'USD').toUpperCase(), regionId: null, regionName: null, country: country || null, isRegional: false };
}

function packageView(pkg, priced) {
  return {
    _id: pkg._id,
    name: pkg.name,
    description: pkg.description || '',
    credits: pkg.credits,
    isPopular: Boolean(pkg.isPopular),
    price: priced.price,
    currency: priced.currency,
    pricePerCredit: pkg.credits > 0 ? Math.round((priced.price / pkg.credits) * 10000) / 10000 : null,
  };
}

/** Active packages priced for the visitor's country. */
async function listPackagesForBuyer(req) {
  const ctx = await pricing.getPricingContext(null, req);
  const packages = await packageModel.find({ isActive: true, isDeleted: { $ne: true } }).sort({ sortOrder: 1, credits: 1 }).lean();
  return packages.map((p) => packageView(p, priceForPackage(p, ctx)));
}

// ── Checkout ─────────────────────────────────────────────────────────────────
const event = (type, source, detail) => ({ type, at: new Date(), source, ...(detail ? { detail: String(detail).slice(0, 300) } : {}) });

async function findOrCreateCustomer(email) {
  const result = await stripe().customers.search({ query: `email:'${String(email).replace(/'/g, "\\'")}'` });
  if (result?.data?.length) return result.data[0];
  return stripe().customers.create({ email });
}

/**
 * Start buying a package: PENDING payment + Stripe Checkout session. The price is worked out here
 * from the package and the visitor's region — never taken from the browser.
 */
async function startCheckout({ organizationId, userId, packageId, req, frontendUrl = process.env.FRONTEND_REDIRECT_URL }) {
  const appUrl = String(frontendUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(appUrl)) {
    write_logs({ message: '[aiCredits] FRONTEND_REDIRECT_URL is missing or not an http(s) URL; cannot start a checkout', log_type: 'error' });
    throw new AiCreditsError('PAYMENT_UNAVAILABLE', 'Payment could not be started. Please try again later.');
  }
  if (!isId(packageId)) throw new AiCreditsError('PACKAGE_NOT_FOUND', 'Package not found');
  const pkg = await packageModel.findOne({ _id: packageId, isActive: true, isDeleted: { $ne: true } }).lean();
  if (!pkg) throw new AiCreditsError('PACKAGE_NOT_FOUND', 'This credit package is no longer available.');
  const ctx = await pricing.getPricingContext(null, req);
  const priced = priceForPackage(pkg, ctx);
  if (!(priced.price > 0)) throw new AiCreditsError('PACKAGE_NOT_FOUND', 'This credit package has no price for your region.');
  const user = await userModel.findById(userId).select('email').lean();
  if (!user?.email) throw new AiCreditsError('INVALID_PURCHASE', 'Your account has no email address.');

  // Make sure the wallet exists so the credits have somewhere to go
  await Promise.all([ensureIndexes(), credits.getWallet(organizationId)]);

  const payment = await paymentModel.create({
    organizationId: toObjectId(organizationId),
    userId: toObjectId(userId),
    packageId: pkg._id,
    packageName: pkg.name,
    credits: pkg.credits,
    amount: priced.price,
    currency: priced.currency,
    country: priced.country,
    regionId: priced.regionId ? toObjectId(priced.regionId) : null,
    status: 'PENDING',
    events: [event('CHECKOUT_CREATED', 'api')],
  });
  const paymentId = String(payment._id);
  const metadata = { kind: KIND, paymentId, organizationId: String(organizationId), packageId: String(pkg._id), userId: String(userId), credits: String(pkg.credits) };

  try {
    const customer = await findOrCreateCustomer(user.email);
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer: customer.id,
      client_reference_id: paymentId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: priced.currency.toLowerCase(),
            unit_amount: pricing.toMinorUnits(priced.price, priced.currency),
            product_data: { name: `${pkg.name} — ${pkg.credits.toLocaleString('en-US')} AI credits`, metadata: { packageId: String(pkg._id) } },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${appUrl}/ai-credits?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/ai-credits?purchase=cancelled&payment_id=${paymentId}`,
    });
    await paymentModel.findOneAndUpdate({ _id: payment._id }, { $set: { stripeSessionId: session.id } }).lean();
    return { url: session.url, paymentId, sessionId: session.id };
  } catch (err) {
    await paymentModel.findOneAndUpdate({ _id: payment._id }, { $set: { status: 'FAILED', failureReason: 'Could not start the payment' }, $push: { events: event('CHECKOUT_FAILED', 'api', err.message) } }).lean();
    write_logs({ message: `[aiCredits] checkout failed for payment ${paymentId}: ${err.message}`, log_type: 'error' });
    throw new AiCreditsError('PAYMENT_UNAVAILABLE', 'Payment could not be started. Please try again.');
  }
}

/** Does this Checkout session really pay for this payment (same session, amount and currency)? */
function sessionMatches(payment, session) {
  if (!payment || !session) return false;
  if (payment.stripeSessionId && payment.stripeSessionId !== session.id) return false;
  if (session.metadata?.paymentId && session.metadata.paymentId !== String(payment._id)) return false;
  const expected = pricing.toMinorUnits(payment.amount, payment.currency);
  return Number(session.amount_total) === expected && String(session.currency || '').toUpperCase() === String(payment.currency).toUpperCase();
}

async function paymentForSession(session) {
  const id = session?.metadata?.paymentId || session?.client_reference_id;
  if (isId(id)) return paymentModel.findById(id).lean();
  return session?.id ? paymentModel.findOne({ stripeSessionId: session.id }).lean() : null;
}

/**
 * Add the credits for a paid session. Safe to call any number of times, from the webhook and the
 * success page at once: the wallet ledger accepts one "purchase:<paymentId>" entry only.
 */
async function fulfill(session, source) {
  const payment = await paymentForSession(session);
  if (!payment) return { status: 'UNKNOWN' };
  if (!sessionMatches(payment, session)) {
    await paymentModel.findOneAndUpdate({ _id: payment._id }, { $push: { events: event('MISMATCH', source, `session ${session.id} amount ${session.amount_total} ${session.currency}`) } }).lean();
    write_logs({ message: `[aiCredits] session ${session.id} does not match payment ${payment._id}`, log_type: 'error' });
    return { status: payment.status, paymentId: String(payment._id), error: 'MISMATCH' };
  }
  if (session.payment_status !== 'paid') {
    // Delayed payment methods: wait for checkout.session.async_payment_succeeded
    if (session.status === 'complete' && payment.status === 'PENDING') {
      await paymentModel.findOneAndUpdate({ _id: payment._id }, { $push: { events: event('AWAITING_PAYMENT', source) } }).lean();
    }
    return { status: payment.status, paymentId: String(payment._id) };
  }
  const wallet = await credits.addPurchasedCredits({ organizationId: payment.organizationId, credits: payment.credits, paymentId: payment._id, packageName: payment.packageName, userId: payment.userId });
  const now = new Date();
  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null;
  const updated = await paymentModel
    .findOneAndUpdate(
      { _id: payment._id, status: { $ne: 'PAID' } },
      { $set: { status: 'PAID', paidAt: payment.paidAt || now, creditedAt: payment.creditedAt || now, failureReason: null, stripePaymentIntentId: paymentIntent }, $push: { events: event('PAID', source) } },
      { new: true }
    )
    .lean();
  return { status: 'PAID', paymentId: String(payment._id), credited: Boolean(wallet), alreadyPaid: !updated, credits: payment.credits, wallet };
}

/** Move a still-PENDING payment to FAILED or CANCELLED (a PAID payment is never changed). */
async function closeUnpaid(payment, status, reason, source) {
  if (!payment) return null;
  return paymentModel
    .findOneAndUpdate({ _id: payment._id, status: 'PENDING' }, { $set: { status, failureReason: reason }, $push: { events: event(status, source, reason) } }, { new: true })
    .lean();
}

/**
 * Stripe webhook events for AI credit purchases. Returns { handled: false } for events that belong
 * to something else (e.g. plan subscriptions), so the caller processes them as before.
 */
async function handleStripeEvent(evt) {
  const obj = evt?.data?.object || {};
  if (obj.metadata?.kind !== KIND) return { handled: false };
  switch (evt.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return { handled: true, ...(await fulfill(obj, 'webhook')) };
    case 'checkout.session.async_payment_failed':
      await closeUnpaid(await paymentForSession(obj), 'FAILED', 'The payment failed', 'webhook');
      return { handled: true, status: 'FAILED' };
    case 'checkout.session.expired':
      await closeUnpaid(await paymentForSession(obj), 'CANCELLED', 'Checkout expired without payment', 'webhook');
      return { handled: true, status: 'CANCELLED' };
    case 'payment_intent.payment_failed': {
      // A declined card: the buyer can try again on the same checkout page, so it stays PENDING
      const id = obj.metadata?.paymentId;
      const reason = obj.last_payment_error?.message || 'Payment declined';
      if (isId(id)) await paymentModel.findOneAndUpdate({ _id: id, status: 'PENDING' }, { $set: { failureReason: reason }, $push: { events: event('ATTEMPT_FAILED', 'webhook', reason) } }).lean();
      return { handled: true, status: 'PENDING' };
    }
    default:
      return { handled: true, status: 'IGNORED' };
  }
}

async function paymentOfOrg(paymentId, organizationId) {
  if (!isId(paymentId)) return null;
  return paymentModel.findOne({ _id: paymentId, organizationId: toObjectId(organizationId) }).lean();
}

/** Success page: check the session with Stripe and add the credits if it is paid. */
async function verifyCheckout({ sessionId, organizationId }) {
  if (!sessionId || typeof sessionId !== 'string') throw new AiCreditsError('INVALID_PURCHASE', 'sessionId is required');
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session?.metadata?.kind !== KIND || String(session.metadata.organizationId) !== String(organizationId)) {
    throw new AiCreditsError('PAYMENT_NOT_FOUND', 'Payment not found');
  }
  const result = await fulfill(session, 'verify');
  const payment = await paymentForSession(session);
  return { ...result, payment: paymentView(payment) };
}

/** Cancel page: close the checkout so it can't be paid later (unless it was paid in the meantime). */
async function cancelCheckout({ paymentId, organizationId }) {
  const payment = await paymentOfOrg(paymentId, organizationId);
  if (!payment) throw new AiCreditsError('PAYMENT_NOT_FOUND', 'Payment not found');
  if (payment.status !== 'PENDING') return paymentView(payment);
  if (payment.stripeSessionId) {
    try {
      await stripe().checkout.sessions.expire(payment.stripeSessionId);
    } catch (_) {
      // Already completed or expired: check what happened
    }
    const session = await stripe().checkout.sessions.retrieve(payment.stripeSessionId);
    if (session?.payment_status === 'paid') {
      await fulfill(session, 'cancel-page');
      return paymentView(await paymentModel.findById(payment._id).lean());
    }
  }
  await closeUnpaid(payment, 'CANCELLED', 'Cancelled by the buyer', 'cancel-page');
  return paymentView(await paymentModel.findById(payment._id).lean());
}

// ── History ──────────────────────────────────────────────────────────────────
function paymentView(p) {
  if (!p) return null;
  return {
    _id: p._id,
    createdAt: p.createdAt,
    packageName: p.packageName,
    credits: p.credits,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    failureReason: p.failureReason || null,
    paidAt: p.paidAt || null,
    creditedAt: p.creditedAt || null,
    user: p.userId && p.userId.email !== undefined ? { _id: p.userId._id, name: p.userId.fullName || p.userId.email } : undefined,
    organization: p.organizationId && p.organizationId.organizationName ? { _id: p.organizationId._id, name: p.organizationId.organizationName } : undefined,
  };
}

const STATUSES = ['PENDING', 'PAID', 'FAILED', 'CANCELLED'];

async function listPayments(body = {}, { organizationId = null } = {}) {
  const pageNo = Math.max(1, parseInt(body.pageNo, 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(body.perPage, 10) || 10));
  const filter = {};
  if (organizationId) filter.organizationId = toObjectId(organizationId);
  else if (isId(body.organizationId)) filter.organizationId = toObjectId(body.organizationId);
  if (STATUSES.includes(body.status)) filter.status = body.status;
  const [rows, total] = await Promise.all([
    paymentModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNo - 1) * perPage)
      .limit(perPage)
      .populate([{ path: 'userId', select: 'fullName email' }, ...(organizationId ? [] : [{ path: 'organizationId', select: 'organizationName' }])])
      .lean(),
    paymentModel.countDocuments(filter),
  ]);
  return { data: rows.map(paymentView), totalRecords: total, pageNo, perPage };
}

module.exports = {
  KIND,
  setStripeClient,
  validatePackageInput,
  createPackage,
  updatePackage,
  deletePackage,
  listPackagesForAdmin,
  listPackagesForBuyer,
  priceForPackage,
  startCheckout,
  fulfill,
  sessionMatches,
  handleStripeEvent,
  verifyCheckout,
  cancelCheckout,
  listPayments,
  paymentView,
};
