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

  test('demo accounts see sample packages and payments but can never pay', async () => {
    const r = res();
    await controller.purchaseCredits(reqAs('ADMIN', { isMockTestingUser: true }), r);
    assert.deepEqual([r.body.isSuccess, r.body.code], [false, 'NOT_ALLOWED']);
    const k = res();
    await controller.getCreditPackages(reqAs('ADMIN', { isMockTestingUser: true }), k);
    assert.deepEqual([k.body.data.isDemo, k.body.data.canPurchase, k.body.data.packages.length], [true, false, 3]);
    const p = res();
    await controller.getMyPayments(reqAs('ADMIN', { isMockTestingUser: true }), p);
    assert.equal(p.body.data.length, 3);
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
