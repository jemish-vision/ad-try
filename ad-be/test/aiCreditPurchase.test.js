const assert = require('node:assert/strict');
const path = require('node:path');
const { test, describe, beforeEach } = require('node:test');
const mongoose = require('mongoose');
const { createFakeModel } = require('./helpers/fakeMongoModel');

const root = path.join(__dirname, '..');
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};

process.env.FRONTEND_REDIRECT_URL = 'https://app.test/';

// ── In-memory collections ──
const wallets = createFakeModel('aicreditwallets', { unique: [['organizationId']], defaults: { monthlyLimitOverride: null, reserved: 0, used: 0, lifetimeUsed: 0 } });
const transactions = createFakeModel('aicredittransactions', { unique: [['dedupeKey']] });
const usageLogs = createFakeModel('aiusagelogs', { unique: [['requestId']] });
const settings = createFakeModel('aicreditsettings', { unique: [['key']] });
const organizations = createFakeModel('organizations');
const plans = createFakeModel('packages');
const creditPackages = createFakeModel('aicreditpackages', { defaults: { isDeleted: false, isActive: true, regionalPrices: [], currency: 'USD', sortOrder: 0 } });
const payments = createFakeModel('aicreditpayments', { unique: [['stripeSessionId']], defaults: { events: [], stripeSessionId: null, paidAt: null, creditedAt: null } });
const regions = createFakeModel('pricingregions');
const users = createFakeModel('users');
stub('api-server/models/aiCreditWallet.model.js', wallets);
stub('api-server/models/aiCreditTransaction.model.js', transactions);
stub('api-server/models/aiUsageLog.model.js', usageLogs);
stub('api-server/models/aiCreditSetting.model.js', settings);
stub('api-server/models/organization.model.js', organizations);
stub('api-server/models/packages.model.js', plans);
stub('api-server/models/aiCreditPackage.model.js', creditPackages);
stub('api-server/models/aiCreditPayment.model.js', payments);
stub('api-server/models/pricingRegion.model.js', regions);
stub('api-server/models/user.model.js', users);
stub('winston/utility/logger.js', { write_logs: () => {} });

const service = require('../api-server/services/aiCredits/aiCredit.service');
const purchase = require('../api-server/services/aiCredits/aiCreditPurchase.service');
const pricing = require('../api-server/helper/regionalPricing');

// ── Fake Stripe ──
function createFakeStripe() {
  const sessions = new Map();
  let n = 0;
  const fake = {
    sessions,
    failCreate: false,
    created: [],
    customers: { search: async () => ({ data: [] }), create: async ({ email }) => ({ id: 'cus_1', email }) },
    checkout: {
      sessions: {
        create: async (params) => {
          if (fake.failCreate) throw new Error('Stripe is down');
          n += 1;
          const item = params.line_items[0].price_data;
          const s = { id: `cs_test_${n}`, url: `https://checkout.stripe.test/cs_test_${n}`, status: 'open', payment_status: 'unpaid', amount_total: item.unit_amount, currency: item.currency, metadata: params.metadata, client_reference_id: params.client_reference_id, payment_intent: null };
          sessions.set(s.id, s);
          fake.created.push(params);
          return { ...s };
        },
        retrieve: async (id) => ({ ...sessions.get(id) }),
        expire: async (id) => {
          const s = sessions.get(id);
          if (s.status !== 'open') throw new Error('Session is not open');
          s.status = 'expired';
          return { ...s };
        },
      },
    },
  };
  // Buyer completes the checkout
  fake.pay = (id, { delayed = false } = {}) => {
    const s = sessions.get(id);
    s.status = 'complete';
    s.payment_status = delayed ? 'unpaid' : 'paid';
    s.payment_intent = `pi_${id}`;
    return { ...s };
  };
  fake.settleDelayed = (id) => {
    const s = sessions.get(id);
    s.payment_status = 'paid';
    return { ...s };
  };
  return fake;
}
const evt = (type, object) => ({ id: `evt_${Math.random().toString(36).slice(2)}`, type, data: { object } });

let stripe;
let orgId;
let userId;
let pkg;
const walletOf = () => wallets.docs.find((w) => String(w.organizationId) === String(orgId));
const paymentDoc = (id) => payments.docs.find((p) => String(p._id) === String(id));
const req = (country = 'US') => ({ headers: { 'cf-ipcountry': country } });

beforeEach(async () => {
  for (const m of [wallets, transactions, usageLogs, settings, organizations, plans, creditPackages, payments, regions, users]) m.reset();
  service._resetSettingsCache();
  pricing.clearRegionCache();
  stripe = createFakeStripe();
  purchase.setStripeClient(stripe);
  const plan = await plans.create({ name: 'Pro', aiMonthlyCredits: 1000 });
  orgId = (await organizations.create({ organizationName: 'Acme', planId: plan._id }))._id;
  userId = (await users.create({ email: 'owner@acme.test', fullName: 'Owner' }))._id;
  pkg = await purchase.createPackage({ name: 'Growth', credits: 2000, price: 29, currency: 'usd' });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('wallet: monthly and purchased credits', () => {
  test('purchased credits add to the balance and are recorded once per payment', async () => {
    const paymentId = new mongoose.Types.ObjectId();
    const w = await service.addPurchasedCredits({ organizationId: orgId, credits: 500, paymentId, packageName: 'Starter' });
    assert.deepEqual([w.available, w.purchasedBalance, w.monthlyAvailable], [1500, 500, 1000]);
    assert.equal(await service.addPurchasedCredits({ organizationId: orgId, credits: 500, paymentId }), null); // repeat
    assert.equal(walletOf().purchasedBalance, 500);
    const tx = transactions.docs.filter((t) => t.type === 'PURCHASE');
    assert.equal(tx.length, 1);
    assert.deepEqual([tx[0].credits, tx[0].balanceAfter, tx[0].note], [500, 1500, 'Bought "Starter"']);
  });

  test('monthly credits are spent first, then purchased', async () => {
    await service.addPurchasedCredits({ organizationId: orgId, credits: 500, paymentId: new mongoose.Types.ObjectId() });
    const hold = await service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'big', amount: 1200 });
    await service.settle(hold, [{ provider: 'x', model: 'm', inputTokens: 1200000, outputTokens: 0 }]); // 1200 credits
    const w = walletOf();
    assert.deepEqual([w.used, w.purchasedBalance, w.purchasedUsed, w.balance], [1000, 300, 200, 300]);
    assert.deepEqual([service.walletView(w).used, service.walletView(w).monthlyAvailable], [1200, 0]);
  });

  test('when the monthly credits are gone, purchased credits keep AI working', async () => {
    await service.getWallet(orgId);
    await service.adjustCredits({ organizationId: orgId, credits: -1000, note: 'use up monthly' });
    await assert.rejects(service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'r0', amount: 20 }), { code: 'AI_CREDITS_EXHAUSTED' });
    await service.addPurchasedCredits({ organizationId: orgId, credits: 50, paymentId: new mongoose.Types.ObjectId() });
    const hold = await service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'r1', amount: 20 });
    await service.settle(hold, [{ model: 'm', inputTokens: 15000, outputTokens: 0 }]);
    assert.deepEqual([walletOf().purchasedBalance, walletOf().balance], [35, 35]);
  });

  test('the monthly reset keeps purchased credits and only expires unused monthly credits', async () => {
    const NOV = new Date('2026-11-20T00:00:00Z');
    const DEC = new Date('2026-12-01T00:05:00Z');
    await service.getWallet(orgId, { now: NOV });
    await service.addPurchasedCredits({ organizationId: orgId, credits: 300, paymentId: new mongoose.Types.ObjectId(), now: NOV });
    const hold = await service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'n1', amount: 400, now: NOV });
    await service.settle(hold, [{ model: 'm', inputTokens: 400000, outputTokens: 0 }], { now: NOV });
    const w = service.walletView(await service.getWallet(orgId, { now: DEC }));
    assert.deepEqual([w.allocated, w.monthlyUsed, w.purchasedBalance, w.available, w.purchasedUsed], [1000, 0, 300, 1300, 0]);
    const reset = transactions.docs.find((t) => t.type === 'RESET');
    assert.equal(reset.credits, -600); // 600 unused monthly credits expired
    assert.match(reset.note, /300 purchased credits carried over/);
  });

  test('wallets created before purchased credits existed still reset', async () => {
    await service.getWallet(orgId, { now: new Date('2026-11-10T00:00:00Z') });
    delete walletOf().purchasedBalance; // as stored by the previous release
    const w = await service.getWallet(orgId, { now: new Date('2026-12-02T00:00:00Z') });
    assert.equal(new Date(w.periodStart).toISOString(), '2026-12-01T00:00:00.000Z');
    assert.equal(w.balance, 1000);
  });

  test('under heavy contention the fallback still spends monthly first, so the reset cannot hand purchased credits back', async () => {
    const NOV = new Date('2026-11-20T00:00:00Z');
    await service.getWallet(orgId, { now: NOV });
    await service.adjustCredits({ organizationId: orgId, credits: -1000, note: 'use up monthly', now: NOV });
    await service.addPurchasedCredits({ organizationId: orgId, credits: 1000, paymentId: new mongoose.Types.ObjectId(), now: NOV });
    const before = walletOf();
    // maxAttempts 0 = every optimistic attempt lost, straight to the atomic fallback
    const w = await service.chargeWallet(before._id, { held: 0, credits: 10, now: NOV, maxAttempts: 0 });
    assert.deepEqual([w.used, w.purchasedBalance, w.purchasedUsed, w.balance, w.lifetimeUsed], [before.used, 990, 10, 990, 10]);
    assert.equal('_chargeFromPurchased' in w, false);
    const dec = service.walletView(await service.getWallet(orgId, { now: new Date('2026-12-01T00:05:00Z') }));
    assert.deepEqual([dec.purchasedBalance, dec.available], [990, 1990]); // not 2000
  });

  test('the fallback splits a charge across both buckets like the normal path', async () => {
    await service.addPurchasedCredits({ organizationId: orgId, credits: 500, paymentId: new mongoose.Types.ObjectId() });
    const hold = await service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'fb', amount: 1200 });
    const w = await service.chargeWallet(hold.walletId, { held: 1200, credits: 1200, now: new Date(), maxAttempts: 0 });
    assert.deepEqual([w.used, w.purchasedBalance, w.purchasedUsed, w.balance, w.reserved], [1000, 300, 200, 300, 0]);
  });

  test('charges running at the same time split exactly', async () => {
    await service.addPurchasedCredits({ organizationId: orgId, credits: 500, paymentId: new mongoose.Types.ObjectId() });
    const holds = await Promise.all([1, 2, 3].map((i) => service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: `p${i}`, amount: 400 })));
    await Promise.all(holds.map((h) => service.settle(h, [{ model: 'm', inputTokens: 400000, outputTokens: 0 }])));
    const w = walletOf();
    assert.deepEqual([w.used, w.purchasedUsed, w.purchasedBalance, w.balance, w.reserved], [1000, 200, 300, 300, 0]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('credit packages', () => {
  test('validation', () => {
    assert.deepEqual(purchase.validatePackageInput({ name: ' ', credits: 0, price: 0, currency: 'dollars', regionalPrices: [{ regionId: 'x', price: 1 }] }), [
      'Package name is required', 'Credits must be 1 or more', 'Price must be greater than 0', 'Currency must be a 3-letter code', 'regionalPrices[0].regionId is invalid',
    ]);
  });

  test('buyers see active packages priced for their region; others pay the default price', async () => {
    const india = await regions.create({ name: 'India', currency: 'INR', countries: ['IN'], isActive: true });
    await purchase.updatePackage(pkg._id, { regionalPrices: [{ regionId: india._id, price: 1999 }] });
    await purchase.createPackage({ name: 'Hidden', credits: 10, price: 1, isActive: false });
    const inIndia = await purchase.listPackagesForBuyer(req('IN'));
    assert.deepEqual(inIndia.map((p) => [p.name, p.price, p.currency]), [['Growth', 1999, 'INR']]);
    const inUs = await purchase.listPackagesForBuyer(req('US'));
    assert.deepEqual(inUs.map((p) => [p.name, p.price, p.currency, p.pricePerCredit]), [['Growth', 29, 'USD', 0.0145]]);
  });

  test('deleting a package hides it but keeps it for payment history', async () => {
    await purchase.deletePackage(pkg._id);
    assert.equal((await purchase.listPackagesForBuyer(req())).length, 0);
    assert.equal(creditPackages.docs.length, 1);
    await assert.rejects(purchase.startCheckout({ organizationId: orgId, userId, packageId: pkg._id, req: req() }), { code: 'PACKAGE_NOT_FOUND' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('buying credits with Stripe', () => {
  const buy = async (country = 'US') => purchase.startCheckout({ organizationId: orgId, userId, packageId: pkg._id, req: req(country), frontendUrl: 'https://app.test' });

  test('checkout: pending payment, server-side price, payment-mode session with the payment id', async () => {
    const { url, paymentId, sessionId } = await buy();
    assert.equal(url, `https://checkout.stripe.test/${sessionId}`);
    const p = paymentDoc(paymentId);
    assert.deepEqual([p.status, p.credits, p.amount, p.currency, p.stripeSessionId], ['PENDING', 2000, 29, 'USD', sessionId]);
    const params = stripe.created[0];
    assert.equal(params.mode, 'payment');
    assert.deepEqual([params.line_items[0].price_data.unit_amount, params.line_items[0].price_data.currency], [2900, 'usd']);
    assert.deepEqual([params.metadata.kind, params.metadata.paymentId, params.payment_intent_data.metadata.paymentId], ['ai_credits', paymentId, paymentId]);
    assert.equal(params.success_url, 'https://app.test/ai-credits?purchase=success&session_id={CHECKOUT_SESSION_ID}');
    assert.equal(params.cancel_url, `https://app.test/ai-credits?purchase=cancelled&payment_id=${paymentId}`);
  });

  test('return links are built from the app URL with or without a trailing slash', async () => {
    const { paymentId } = await purchase.startCheckout({ organizationId: orgId, userId, packageId: pkg._id, req: req(), frontendUrl: ' https://app.test// ' });
    assert.equal(stripe.created[0].success_url, 'https://app.test/ai-credits?purchase=success&session_id={CHECKOUT_SESSION_ID}');
    assert.equal(stripe.created[0].cancel_url, `https://app.test/ai-credits?purchase=cancelled&payment_id=${paymentId}`);
  });

  test('a missing app URL stops the checkout before any payment or Stripe session is created', async () => {
    for (const frontendUrl of ['', '   ', 'undefined']) {
      await assert.rejects(purchase.startCheckout({ organizationId: orgId, userId, packageId: pkg._id, req: req(), frontendUrl }), { code: 'PAYMENT_UNAVAILABLE' });
    }
    assert.deepEqual([payments.docs.length, stripe.created.length], [0, 0]);
  });

  test('successful payment (webhook): credits added once, even if Stripe sends the event twice', async () => {
    const { sessionId, paymentId } = await buy();
    const paid = stripe.pay(sessionId);
    const r1 = await purchase.handleStripeEvent(evt('checkout.session.completed', paid));
    const r2 = await purchase.handleStripeEvent(evt('checkout.session.completed', paid));
    assert.deepEqual([r1.handled, r1.status, r1.credited, r2.credited], [true, 'PAID', true, false]);
    assert.deepEqual([walletOf().purchasedBalance, walletOf().balance], [2000, 3000]);
    const p = paymentDoc(paymentId);
    assert.deepEqual([p.status, Boolean(p.paidAt), Boolean(p.creditedAt), p.stripePaymentIntentId], ['PAID', true, true, `pi_${sessionId}`]);
  });

  test('webhook and success page at the same moment: credited exactly once', async () => {
    const { sessionId } = await buy();
    const paid = stripe.pay(sessionId);
    await Promise.all([
      purchase.handleStripeEvent(evt('checkout.session.completed', paid)),
      purchase.verifyCheckout({ sessionId, organizationId: orgId }),
      purchase.verifyCheckout({ sessionId, organizationId: orgId }),
    ]);
    assert.equal(walletOf().purchasedBalance, 2000);
    assert.equal(transactions.docs.filter((t) => t.type === 'PURCHASE').length, 1);
  });

  test('success page before the webhook: verification adds the credits', async () => {
    const { sessionId } = await buy();
    stripe.pay(sessionId);
    const r = await purchase.verifyCheckout({ sessionId, organizationId: orgId });
    assert.deepEqual([r.status, r.credited, r.payment.status], ['PAID', true, 'PAID']);
    assert.equal(walletOf().purchasedBalance, 2000);
  });

  test('verifying an unpaid checkout adds nothing', async () => {
    const { sessionId } = await buy();
    const r = await purchase.verifyCheckout({ sessionId, organizationId: orgId });
    assert.equal(r.status, 'PENDING');
    assert.equal(walletOf().purchasedBalance, 0);
  });

  test('another organization cannot claim the payment', async () => {
    const { sessionId } = await buy();
    stripe.pay(sessionId);
    await assert.rejects(purchase.verifyCheckout({ sessionId, organizationId: new mongoose.Types.ObjectId() }), { code: 'PAYMENT_NOT_FOUND' });
    assert.equal(walletOf().purchasedBalance, 0);
  });

  test('a session whose amount does not match the payment is not credited', async () => {
    const { sessionId, paymentId } = await buy();
    stripe.pay(sessionId);
    stripe.sessions.get(sessionId).amount_total = 100;
    const r = await purchase.verifyCheckout({ sessionId, organizationId: orgId });
    assert.equal(r.error, 'MISMATCH');
    assert.equal(walletOf().purchasedBalance, 0);
    assert.ok(paymentDoc(paymentId).events.some((e) => e.type === 'MISMATCH'));
  });

  test('delayed payment (bank debit): pending until it clears, then credited', async () => {
    const { sessionId, paymentId } = await buy();
    const done = stripe.pay(sessionId, { delayed: true });
    await purchase.handleStripeEvent(evt('checkout.session.completed', done));
    assert.equal(paymentDoc(paymentId).status, 'PENDING');
    assert.equal(walletOf().purchasedBalance, 0);
    await purchase.handleStripeEvent(evt('checkout.session.async_payment_succeeded', stripe.settleDelayed(sessionId)));
    assert.equal(paymentDoc(paymentId).status, 'PAID');
    assert.equal(walletOf().purchasedBalance, 2000);
  });

  test('delayed payment that fails: FAILED, nothing added', async () => {
    const { sessionId, paymentId } = await buy();
    const done = stripe.pay(sessionId, { delayed: true });
    await purchase.handleStripeEvent(evt('checkout.session.async_payment_failed', done));
    assert.deepEqual([paymentDoc(paymentId).status, paymentDoc(paymentId).failureReason], ['FAILED', 'The payment failed']);
    assert.equal(walletOf().purchasedBalance, 0);
  });

  test('declined card: stays pending with the reason (the buyer can retry on the same page)', async () => {
    const { paymentId } = await buy();
    await purchase.handleStripeEvent(evt('payment_intent.payment_failed', { id: 'pi_x', metadata: { kind: 'ai_credits', paymentId }, last_payment_error: { message: 'Your card was declined.' } }));
    assert.deepEqual([paymentDoc(paymentId).status, paymentDoc(paymentId).failureReason], ['PENDING', 'Your card was declined.']);
  });

  test('checkout expired unpaid: CANCELLED; a paid payment is never cancelled', async () => {
    const a = await buy();
    await purchase.handleStripeEvent(evt('checkout.session.expired', { ...stripe.sessions.get(a.sessionId), status: 'expired' }));
    assert.equal(paymentDoc(a.paymentId).status, 'CANCELLED');
    const b = await buy();
    const paid = stripe.pay(b.sessionId);
    await purchase.handleStripeEvent(evt('checkout.session.completed', paid));
    await purchase.handleStripeEvent(evt('checkout.session.expired', paid));
    assert.equal(paymentDoc(b.paymentId).status, 'PAID');
  });

  test('buyer cancels: the checkout is closed so it cannot be paid later', async () => {
    const { sessionId, paymentId } = await buy();
    const p = await purchase.cancelCheckout({ paymentId, organizationId: orgId });
    assert.equal(p.status, 'CANCELLED');
    assert.equal(stripe.sessions.get(sessionId).status, 'expired');
  });

  test('cancel page after the payment went through: credited, not cancelled', async () => {
    const { sessionId, paymentId } = await buy();
    stripe.pay(sessionId);
    const p = await purchase.cancelCheckout({ paymentId, organizationId: orgId });
    assert.equal(p.status, 'PAID');
    assert.equal(walletOf().purchasedBalance, 2000);
  });

  test('Stripe unavailable: payment marked FAILED and a clear error', async () => {
    stripe.failCreate = true;
    await assert.rejects(buy(), { code: 'PAYMENT_UNAVAILABLE' });
    assert.equal(payments.docs[0].status, 'FAILED');
  });

  test('regional price is charged in the region currency', async () => {
    const india = await regions.create({ name: 'India', currency: 'INR', countries: ['IN'], isActive: true });
    await purchase.updatePackage(pkg._id, { regionalPrices: [{ regionId: india._id, price: 1999 }] });
    pricing.clearRegionCache();
    const { sessionId, paymentId } = await buy('IN');
    assert.deepEqual([paymentDoc(paymentId).amount, paymentDoc(paymentId).currency], [1999, 'INR']);
    const paid = stripe.pay(sessionId);
    assert.deepEqual([paid.amount_total, paid.currency], [199900, 'inr']);
    await purchase.handleStripeEvent(evt('checkout.session.completed', paid));
    assert.equal(walletOf().purchasedBalance, 2000);
  });

  test('subscription events are left to the plan billing code', async () => {
    assert.deepEqual(await purchase.handleStripeEvent(evt('checkout.session.completed', { id: 'cs_sub', mode: 'subscription', metadata: { packageId: 'x' } })), { handled: false });
    assert.deepEqual(await purchase.handleStripeEvent(evt('invoice.payment_succeeded', { subscription: 'sub_1' })), { handled: false });
  });

  test('payment history for the organization, newest first, with status filter', async () => {
    const a = await buy();
    stripe.pay(a.sessionId);
    await purchase.verifyCheckout({ sessionId: a.sessionId, organizationId: orgId });
    await buy();
    const all = await purchase.listPayments({}, { organizationId: orgId });
    assert.equal(all.totalRecords, 2);
    const paidOnly = await purchase.listPayments({ status: 'PAID' }, { organizationId: orgId });
    assert.deepEqual(paidOnly.data.map((p) => [p.status, p.credits, p.amount]), [['PAID', 2000, 29]]);
  });

  test('wallet ledger shows the purchase next to monthly allowances and usage', async () => {
    const { sessionId } = await buy();
    await purchase.handleStripeEvent(evt('checkout.session.completed', stripe.pay(sessionId)));
    const types = transactions.docs.map((t) => t.type);
    assert.deepEqual(types, ['ALLOCATION', 'PURCHASE']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('custom amount of credits', () => {
  const CUSTOM = { enabled: true, ratePer1K: 19, currency: 'USD', minCredits: 100, maxCredits: 50000, step: 50, regionalRates: [] };
  const setCustom = (over = {}) => purchase.updateCustomPricing({ ...CUSTOM, ...over }, userId);
  const buyCustom = (credits, country = 'US') => purchase.startCheckout({ organizationId: orgId, userId, customCredits: credits, req: req(country), frontendUrl: 'https://app.test' });

  test('price = credits / 1,000 x rate, rounded to the currency (zero-decimal currencies too)', () => {
    assert.equal(purchase.customAmount(1250, 19, 'USD'), 23.75);
    assert.equal(purchase.customAmount(150, 2833.3, 'JPY'), 425);
    assert.equal(purchase.customAmount(333, 1.005, 'EUR'), 0.33);
  });

  test('settings validation: rate, limits as multiples of the step, Stripe minimum charge', async () => {
    const bad = (over) => purchase.validateCustomInput({ ...CUSTOM, ...over });
    assert.deepEqual(bad({}), []);
    assert.match(bad({ ratePer1K: 0 }).join(), /Set a price per 1,000 credits/);
    assert.deepEqual(bad({ ratePer1K: 0, enabled: false }), []); // can be saved switched off
    assert.match(bad({ minCredits: 120 }).join(), /multiples of the step/);
    assert.match(bad({ maxCredits: 50 }).join(), /not below the minimum/);
    assert.match(bad({ step: 0 }).join(), /Step must be/);
    assert.match(bad({ minCredits: 12.5 }).join(), /Minimum must be a whole number/);
    assert.match(bad({ maxCredits: 2000000 }).join(), /can't be more than 1,000,000/);
    assert.match(bad({ ratePer1K: 1 }).join(), /100 credits would cost 0.1 USD, below Stripe's minimum charge of 0.5 USD/);
    const india = await regions.create({ name: 'India', currency: 'INR', countries: ['IN'], isActive: true });
    const byId = new Map([[String(india._id), india]]);
    assert.match(purchase.validateCustomInput({ ...CUSTOM, regionalRates: [{ regionId: india._id, ratePer1K: 2 }] }, byId).join(), /India: 100 credits would cost 0.2 INR/);
    assert.match(purchase.validateCustomInput({ ...CUSTOM, regionalRates: [{ regionId: india._id, ratePer1K: 0 }] }, byId).join(), /ratePer1K must be greater than 0/);
    await assert.rejects(setCustom({ ratePer1K: 0 }), { code: 'INVALID_CUSTOM_PRICING' });
  });

  test('switched off (the default): no offer, and a custom checkout is refused', async () => {
    assert.equal((await purchase.offerForBuyer(req())).custom, null);
    await assert.rejects(buyCustom(1000), { code: 'CUSTOM_UNAVAILABLE' });
    assert.deepEqual([payments.docs.length, stripe.created.length], [0, 0]);
  });

  test('buyers get the offer in their region currency; others get the default rate', async () => {
    const india = await regions.create({ name: 'India', currency: 'INR', countries: ['IN'], isActive: true });
    await setCustom({ regionalRates: [{ regionId: india._id, ratePer1K: 1600 }] });
    pricing.clearRegionCache();
    assert.deepEqual((await purchase.offerForBuyer(req('US'))).custom, { ratePer1K: 19, currency: 'USD', minCredits: 100, maxCredits: 50000, step: 50 });
    assert.deepEqual((await purchase.offerForBuyer(req('IN'))).custom, { ratePer1K: 1600, currency: 'INR', minCredits: 100, maxCredits: 50000, step: 50 });
    assert.equal((await purchase.offerForBuyer(req('US'))).packages.length, 1);
  });

  test('checkout: the server prices the amount, records a CUSTOM payment and credits it once', async () => {
    await setCustom();
    const { sessionId, paymentId } = await buyCustom(1250);
    const p = paymentDoc(paymentId);
    assert.deepEqual([p.kind, p.packageId, p.packageName, p.credits, p.ratePer1K, p.amount, p.currency, p.status], ['CUSTOM', null, 'Custom amount', 1250, 19, 23.75, 'USD', 'PENDING']);
    const params = stripe.created[0];
    assert.deepEqual([params.line_items[0].price_data.unit_amount, params.line_items[0].price_data.currency], [2375, 'usd']);
    assert.equal(params.line_items[0].price_data.product_data.name, 'Custom amount — 1,250 AI credits');
    assert.deepEqual([params.metadata.purchase, params.metadata.credits, params.metadata.packageId], ['custom', '1250', '']);
    const paid = stripe.pay(sessionId);
    await purchase.handleStripeEvent(evt('checkout.session.completed', paid));
    await purchase.handleStripeEvent(evt('checkout.session.completed', paid)); // Stripe retries
    assert.deepEqual([walletOf().purchasedBalance, paymentDoc(paymentId).status], [1250, 'PAID']);
    const tx = transactions.docs.filter((t) => t.type === 'PURCHASE');
    assert.deepEqual([tx.length, tx[0].note], [1, 'Bought "Custom amount"']);
    const history = await purchase.listPayments({}, { organizationId: orgId });
    assert.deepEqual([history.data[0].kind, history.data[0].packageName], ['CUSTOM', 'Custom amount']);
  });

  test('regional rate is charged in the region currency', async () => {
    const india = await regions.create({ name: 'India', currency: 'INR', countries: ['IN'], isActive: true });
    await setCustom({ regionalRates: [{ regionId: india._id, ratePer1K: 1600 }] });
    pricing.clearRegionCache();
    const { paymentId } = await buyCustom(1000, 'IN');
    assert.deepEqual([paymentDoc(paymentId).amount, paymentDoc(paymentId).currency, String(paymentDoc(paymentId).regionId)], [1600, 'INR', String(india._id)]);
    assert.equal(stripe.created[0].line_items[0].price_data.unit_amount, 160000);
  });

  test('amounts outside the limits or off the step are refused before any payment is created', async () => {
    await setCustom();
    for (const n of [50, 50050, 1025, 12.5, 'abc', '', -100]) {
      await assert.rejects(buyCustom(n), { code: 'INVALID_AMOUNT' }, String(n));
    }
    await assert.rejects(buyCustom(1025), { message: 'Choose between 100 and 50,000 credits, in steps of 50.' });
    assert.deepEqual([payments.docs.length, stripe.created.length], [0, 0]);
  });

  test("an amount below Stripe's minimum charge is refused", async () => {
    // Saved before the minimum check existed, or a region rate this low: still never sent to Stripe
    await settings.findOneAndUpdate({ key: 'global' }, { $set: { customPurchase: { ...CUSTOM, ratePer1K: 1 } } }, { upsert: true });
    await assert.rejects(buyCustom(100), { code: 'AMOUNT_TOO_SMALL' });
    assert.equal(stripe.created.length, 0);
  });

  test('Super Admin sees the custom settings with the packages; deleting a region is handled by the regions screen', async () => {
    await setCustom();
    const admin = await purchase.listPackagesForAdmin();
    assert.deepEqual([admin.custom.enabled, admin.custom.ratePer1K, admin.custom.step], [true, 19, 50]);
  });
});

describe('custom amount (controller)', () => {
  const controller = require('../api-server/controllers/aiCredit.controller');
  const res = () => { const r = { statusCode: 200, status(c) { r.statusCode = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const reqAs = (role, body, extra = {}) => ({ organizationId: String(orgId), user: { _id: userId }, role: { roleName: role }, headers: { 'cf-ipcountry': 'US' }, body, ...extra });

  beforeEach(() => purchase.updateCustomPricing({ enabled: true, ratePer1K: 19, currency: 'USD', minCredits: 100, maxCredits: 50000, step: 50 }, userId));

  test('the price sent by the browser is ignored', async () => {
    const r = res();
    await controller.purchaseCredits(reqAs('ADMIN', { credits: 1000, price: 0.01, amount: 0.01 }), r);
    assert.equal(r.body.isSuccess, true);
    assert.equal(stripe.created[0].line_items[0].price_data.unit_amount, 1900);
  });

  test('only the owner can buy a custom amount; members and demo cannot', async () => {
    for (const [role, extra] of [['Analyst', {}], ['ADMIN', { isMockTestingUser: true }]]) {
      const r = res();
      await controller.purchaseCredits(reqAs(role, { credits: 1000 }, extra), r);
      assert.deepEqual([r.body.isSuccess, r.body.code], [false, 'NOT_ALLOWED']);
    }
    assert.equal(stripe.created.length, 0);
  });

  test('packages endpoint returns the custom offer; demo shows a sample offer', async () => {
    const k = res();
    await controller.getCreditPackages(reqAs('ADMIN', {}), k);
    assert.deepEqual(k.body.data.custom, { ratePer1K: 19, currency: 'USD', minCredits: 100, maxCredits: 50000, step: 50 });
    const d = res();
    await controller.getCreditPackages(reqAs('ADMIN', {}, { isMockTestingUser: true }), d);
    assert.equal(d.body.data.custom.currency, 'USD');
    const pay = res();
    await controller.getMyPayments(reqAs('ADMIN', {}, { isMockTestingUser: true }), pay);
    assert.ok(pay.body.data.some((row) => row.kind === 'CUSTOM'));
  });

  test('saving custom pricing is audited with before and after', async () => {
    const r = res();
    const rq = reqAs('SUPER_ADMIN', { enabled: true, ratePer1K: 21, currency: 'usd', minCredits: 200, maxCredits: 10000, step: 100 });
    await controller.adminUpdateCustomPricing(rq, r);
    assert.equal(r.body.isSuccess, true);
    assert.deepEqual([rq.auditChange.previousValue.ratePer1K, rq.auditChange.newValue.ratePer1K, rq.auditChange.newValue.currency], [19, 21, 'USD']);
    const { eventForRoute } = require('../api-server/constants/auditRouteEvents');
    assert.equal(eventForRoute('POST', '/api/ai-credits/admin/custom-pricing/update'), 'AI_CREDIT_CUSTOM_PRICING_UPDATED');
    const bad = res();
    await controller.adminUpdateCustomPricing(reqAs('SUPER_ADMIN', { enabled: true, ratePer1K: 0, currency: 'USD', minCredits: 100, maxCredits: 1000, step: 50 }), bad);
    assert.deepEqual([bad.body.isSuccess, bad.body.code], [false, 'INVALID_CUSTOM_PRICING']);
  });
});

describe('the Stripe webhook route sends credit purchases to this flow first', () => {
  test('stripeWebhook checks AI credit events before subscription handling', () => {
    const src = require('node:fs').readFileSync(path.join(root, 'api-server/controllers/user.controller.js'), 'utf8');
    const webhook = src.slice(src.indexOf('exports.stripeWebhook'));
    assert.ok(webhook.indexOf('aiCreditPurchase.service").handleStripeEvent(event)') > 0);
    assert.ok(webhook.indexOf('handleStripeEvent(event)') < webhook.indexOf('case "checkout.session.completed"'));
  });
});

describe('who can buy (controller)', () => {
  const controller = require('../api-server/controllers/aiCredit.controller');
  const res = () => { const r = { statusCode: 200, status(c) { r.statusCode = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const reqAs = (role, extra = {}) => ({ organizationId: String(orgId), user: { _id: userId }, role: { roleName: role }, headers: { 'cf-ipcountry': 'US' }, body: { packageId: String(pkg._id) }, ...extra });

  test('the organization owner (ADMIN) gets a checkout link', async () => {
    const r = res();
    await controller.purchaseCredits(reqAs('ADMIN'), r);
    assert.equal(r.body.isSuccess, true);
    assert.match(r.body.data.url, /^https:\/\/checkout\.stripe\.test\//);
  });

  test('team members cannot buy or see payments; they still see the packages', async () => {
    const r = res();
    await controller.purchaseCredits(reqAs('Analyst'), r);
    assert.deepEqual([r.body.isSuccess, r.body.code], [false, 'NOT_ALLOWED']);
    const p = res();
    await controller.getMyPayments(reqAs('Analyst'), p);
    assert.deepEqual([p.body.canView, p.body.data.length], [false, 0]);
    const k = res();
    await controller.getCreditPackages(reqAs('Analyst'), k);
    assert.deepEqual([k.body.data.canPurchase, k.body.data.packages.length], [false, 1]);
    assert.equal(payments.docs.length, 0);
  });

  test("team members cannot cancel or verify the owner's checkout", async () => {
    const started = res();
    await controller.purchaseCredits(reqAs('ADMIN'), started);
    const { paymentId } = started.body.data;
    const sessionId = paymentDoc(paymentId).stripeSessionId;
    const c = res();
    await controller.cancelCreditPurchase(reqAs('Analyst', { body: { paymentId } }), c);
    assert.deepEqual([c.body.isSuccess, c.body.code], [false, 'NOT_ALLOWED']);
    const v = res();
    await controller.verifyCreditPurchase(reqAs('Analyst', { body: { sessionId } }), v);
    assert.deepEqual([v.body.isSuccess, v.body.code], [false, 'NOT_ALLOWED']);
    assert.deepEqual([paymentDoc(paymentId).status, stripe.sessions.get(sessionId).status], ['PENDING', 'open']);
    // The owner still can
    const o = res();
    await controller.cancelCreditPurchase(reqAs('ADMIN', { body: { paymentId } }), o);
    assert.deepEqual([o.body.isSuccess, paymentDoc(paymentId).status, stripe.sessions.get(sessionId).status], [true, 'CANCELLED', 'expired']);
  });

  test('demo accounts see sample packages and payments but can never pay', async () => {
    const r = res();
    await controller.purchaseCredits(reqAs('ADMIN', { isMockTestingUser: true }), r);
    assert.deepEqual([r.body.isSuccess, r.body.code], [false, 'NOT_ALLOWED']);
    const k = res();
    await controller.getCreditPackages(reqAs('ADMIN', { isMockTestingUser: true }), k);
    assert.deepEqual([k.body.data.isDemo, k.body.data.canPurchase, k.body.data.packages.length], [true, false, 3]);
    const p = res();
    await controller.getMyPayments(reqAs('ADMIN', { isMockTestingUser: true }), p);
    assert.equal(p.body.data.length, 4); // includes a custom amount purchase
    assert.equal(stripe.created.length, 0);
  });

  test('purchase and package actions are audited', () => {
    const { events } = require('../api-server/constants/auditEvents');
    const { eventForRoute } = require('../api-server/constants/auditRouteEvents');
    const expected = {
      '/api/ai-credits/purchase': 'AI_CREDIT_PURCHASE_STARTED',
      '/api/ai-credits/purchase/verify': 'AI_CREDIT_PURCHASE_VERIFIED',
      '/api/ai-credits/purchase/cancel': 'AI_CREDIT_PURCHASE_CANCELLED',
      '/api/ai-credits/admin/packages/create': 'AI_CREDIT_PACKAGE_CREATED',
      '/api/ai-credits/admin/packages/update': 'AI_CREDIT_PACKAGE_UPDATED',
      '/api/ai-credits/admin/packages/delete': 'AI_CREDIT_PACKAGE_DELETED',
    };
    for (const [route, ev] of Object.entries(expected)) {
      assert.equal(eventForRoute('POST', route), ev);
      assert.ok(events.includes(ev), ev);
    }
    assert.equal(eventForRoute('POST', '/api/ai-credits/packages'), undefined);
  });
});
