const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildComparison, normalizeOffer, normalizeFees } = require('../api-server/helpers/competitorComparison.helper');

const offer = (o) => ({
  SellerId: o.id,
  MyOffer: o.mine || false,
  SubCondition: 'new',
  ListingPrice: { Amount: o.price, CurrencyCode: 'USD' },
  Shipping: { Amount: o.ship ?? 0, CurrencyCode: 'USD' },
  IsFulfilledByAmazon: o.fba || false,
  IsBuyBoxWinner: o.bb || false,
  PrimeInformation: { IsPrime: o.prime || false, IsNationalPrime: o.prime || false },
  SellerFeedbackRating: { SellerPositiveFeedbackRating: o.fb ?? 95, FeedbackCount: o.fbCount ?? 100 },
});

const payload = (offers) => ({
  ASIN: 'B000TEST01',
  status: 'Success',
  Summary: {
    TotalOfferCount: offers.length,
    NumberOfOffers: [{ condition: 'new', fulfillmentChannel: 'Merchant', OfferCount: offers.length }],
    BuyBoxPrices: [{ condition: 'New', LandedPrice: { Amount: 26.49 }, ListingPrice: { Amount: 22.99 }, Shipping: { Amount: 3.5 } }],
    LowestPrices: [{ condition: 'new', fulfillmentChannel: 'Amazon', LandedPrice: { Amount: 24.99 }, ListingPrice: { Amount: 24.99 }, Shipping: { Amount: 0 } }],
  },
  Offers: offers,
});

test('normalizeOffer computes landed price and fulfillment', () => {
  const n = normalizeOffer(offer({ id: 'X', price: 22.99, ship: 3.5, fba: true, prime: true }), 'ME');
  assert.equal(n.landedPrice, 26.49);
  assert.equal(n.fulfillment, 'FBA');
  assert.equal(n.isPrime, true);
  assert.equal(n.isOurs, false);
});

test('losing Buy Box: deltas are ours minus rival (negative landed = we are cheaper)', () => {
  const data = buildComparison({
    offersPayload: payload([
      offer({ id: 'ME', price: 24.99, ship: 0, fb: 98, fbCount: 500 }),
      offer({ id: 'X', price: 22.99, ship: 3.5, fba: true, prime: true, bb: true, fb: 92, fbCount: 120 }),
    ]),
    catalogItem: null,
    ourSellerId: 'ME',
    marketplaceId: 'ATVPDKIKX0DER',
  });
  assert.equal(data.comparison.status, 'losing');
  assert.equal(data.ourOffer.sellerId, 'ME');
  assert.equal(data.primaryRival.sellerId, 'X');
  assert.deepEqual(data.comparison.vsBuyBox, { listingPrice: 2, shipping: -3.5, landedPrice: -1.5 });
  assert.equal(data.competitors.length, 1);
});

test('winning Buy Box compares against cheapest rival; MyOffer flag identifies us without sellerId', () => {
  const data = buildComparison({
    offersPayload: payload([
      offer({ id: 'ME', mine: true, price: 20, bb: true }),
      offer({ id: 'B', price: 25 }),
      offer({ id: 'A', price: 21, ship: 1 }),
    ]),
    catalogItem: null,
    ourSellerId: null,
    marketplaceId: 'M',
  });
  assert.equal(data.comparison.status, 'winning');
  assert.equal(data.primaryRival.sellerId, 'A');
  assert.equal(data.comparison.vsBuyBox, null);
  assert.equal(data.comparison.vsLowest.landedPrice, -2);
  assert.deepEqual(data.competitors.map((c) => c.sellerId), ['A', 'B']);
});

test('falls back to our listing when our offer is not in returned offers', () => {
  const data = buildComparison({
    offersPayload: payload([offer({ id: 'X', price: 10, bb: true })]),
    catalogItem: null,
    ourSellerId: 'ME',
    marketplaceId: 'M',
    ourListing: { sellingPrice: 12, currency: 'USD' },
  });
  assert.equal(data.ourOffer.source, 'listing');
  assert.equal(data.comparison.status, 'losing');
  assert.equal(data.comparison.vsPrimaryRival.listingPrice, 2);
});

test('no offer of ours and no listing -> no_offer', () => {
  const data = buildComparison({ offersPayload: payload([offer({ id: 'X', price: 10, bb: true })]), ourSellerId: 'ME', marketplaceId: 'M' });
  assert.equal(data.comparison.status, 'no_offer');
  assert.equal(data.comparison.vsPrimaryRival, null);
});

test('normalizes catalog item fields', () => {
  const data = buildComparison({
    offersPayload: payload([]),
    catalogItem: {
      asin: 'B000TEST01',
      summaries: [{ marketplaceId: 'M', itemName: 'Widget', brand: 'Acme' }],
      images: [{ marketplaceId: 'M', images: [{ variant: 'PT01', link: 'x', width: 500 }, { variant: 'MAIN', link: 'main.jpg', width: 1000 }] }],
      salesRanks: [{ marketplaceId: 'M', classificationRanks: [{ title: 'Kitchen', rank: 42 }] }],
      attributes: { bullet_point: [{ value: 'Strong' }, { value: 'Light' }] },
    },
    ourSellerId: 'ME',
    marketplaceId: 'M',
  });
  assert.equal(data.product.title, 'Widget');
  assert.equal(data.product.brand, 'Acme');
  assert.equal(data.product.image, 'main.jpg');
  assert.deepEqual(data.product.salesRank, { rank: 42, category: 'Kitchen' });
  assert.deepEqual(data.product.bulletPoints, ['Strong', 'Light']);
});

test('listing price of 0 is ignored -> no_offer instead of a fake ₹0 offer', () => {
  const data = buildComparison({
    offersPayload: { ASIN: 'B0X', Summary: { TotalOfferCount: 0 }, Offers: [] },
    ourSellerId: 'ME',
    marketplaceId: 'M',
    ourListing: { sellingPrice: 0, basePrice: 0 },
  });
  assert.equal(data.ourOffer, null);
  assert.equal(data.comparison.status, 'no_offer');
});

test('pack size falls back to number_of_items / item_package_quantity', () => {
  const mk = (attributes) => buildComparison({ offersPayload: payload([]), catalogItem: { asin: 'B0X', summaries: [{ marketplaceId: 'M' }], attributes }, ourSellerId: 'ME', marketplaceId: 'M' }).product;
  assert.deepEqual([mk({ number_of_items: [{ value: 3 }] }).unitValue, mk({ number_of_items: [{ value: 3 }] }).unitType], [3, 'count']);
  assert.equal(mk({ item_package_quantity: [{ value: 2 }] }).unitValue, 2);
  assert.equal(mk({ unit_count: [{ value: 20, type: { value: 'Meter' } }] }).unitType, 'Meter');
});

test('category falls back to the overall (display group) rank', () => {
  const p = buildComparison({ offersPayload: payload([]), catalogItem: { asin: 'B0X', summaries: [{ marketplaceId: 'M' }], salesRanks: [{ marketplaceId: 'M', displayGroupRanks: [{ title: 'Bags', rank: 1234 }] }] }, ourSellerId: 'ME', marketplaceId: 'M' }).product;
  assert.deepEqual(p.salesRank, { rank: 1234, category: 'Bags' });
});

test('normalizeFees splits referral / FBA / closing fees', () => {
  const fees = normalizeFees({
    Status: 'Success',
    FeesEstimate: {
      TotalFeesEstimate: { CurrencyCode: 'INR', Amount: 128.5 },
      FeeDetailList: [
        { FeeType: 'ReferralFee', FinalFee: { Amount: 74.85 } },
        { FeeType: 'FBAFees', FinalFee: { Amount: 41.65 } },
        { FeeType: 'FixedClosingFee', FinalFee: { Amount: 12 } },
        { FeeType: 'VariableClosingFee', FinalFee: { Amount: 0 } },
      ],
    },
  });
  assert.deepEqual(fees, { total: 128.5, referral: 74.85, fba: 41.65, closing: 12, other: 0, currency: 'INR' });
  assert.equal(normalizeFees({ Status: 'ClientError' }), null);
});

test('summary exposes Buy Box eligible offer count', () => {
  const p = payload([]);
  p.Summary.BuyBoxEligibleOffers = [{ condition: 'new', fulfillmentChannel: 'Amazon', OfferCount: 2 }, { condition: 'new', fulfillmentChannel: 'Merchant', OfferCount: 1 }, { condition: 'used', OfferCount: 5 }];
  const data = buildComparison({ offersPayload: p, ourSellerId: 'ME', marketplaceId: 'M' });
  assert.equal(data.summary.buyBoxEligibleCount, 3);
});

test('catalog exposes all ranks and variation family', () => {
  const p = buildComparison({
    offersPayload: payload([]),
    catalogItem: {
      asin: 'B0CHILD',
      summaries: [{ marketplaceId: 'M' }],
      salesRanks: [{ marketplaceId: 'M', classificationRanks: [{ title: 'Totes', rank: 40 }, { title: 'Shoulder Bags', rank: 310 }], displayGroupRanks: [{ title: 'Bags', rank: 5120 }] }],
      relationships: [{ marketplaceId: 'M', relationships: [{ type: 'VARIATION', parentAsins: ['B0PARENT'], variationTheme: { theme: 'SIZE_NAME/COLOR_NAME', attributes: ['size', 'color'] } }] }],
    },
    ourSellerId: 'ME',
    marketplaceId: 'M',
  }).product;
  assert.deepEqual(p.allRanks.map((r) => [r.rank, r.category, r.type]), [[40, 'Totes', 'category'], [310, 'Shoulder Bags', 'category'], [5120, 'Bags', 'overall']]);
  assert.equal(p.variations.parentAsin, 'B0PARENT');
  assert.equal(p.variations.isParent, false);
  assert.deepEqual(p.variations.attributes, ['size', 'color']);
});
