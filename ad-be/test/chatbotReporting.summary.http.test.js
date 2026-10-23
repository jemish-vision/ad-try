'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  once
} = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const {
  createSummaryController
} = require('../api-server/controllers/chatbotReporting.controller');
const {
  createSummaryRouter
} = require('../api-server/routes/chatbotReporting.route');
const {
  createSummaryService
} = require('../api-server/services/chatbotReporting.summary');
const {
  validateReportResponse
} = require('../api-server/contracts/chatbotReporting.contract');
const fixtures = require('../../R-AdvertiseIQ/src/helper/chatbot/fixtures/reporting.v1.json');
const clone = value => JSON.parse(JSON.stringify(value));

function mockResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;

      return this;
    },
    json(body) {
      this.body = body;

      return this;
    }
  };
}

test('controller forwards only authenticated context and wraps the strict report for portal transport', async () => {
  const report = clone(fixtures.scenarios[0].response);
  const body = {
    message: 'must not be mixed into auth'
  };
  let seen;
  const controller = createSummaryController({
    summaryService: async (...args) => {
      seen = args;

      return report;
    }
  });
  const response = mockResponse();
  await controller({
    body,
    user: {
      _id: 'user',
      role: 'ignored'
    },
    config: {
      configId: 'config'
    },
    organizationId: 'org'
  }, response);
  assert.equal(seen[0], body);
  assert.deepEqual(seen[1], {
    userId: 'user',
    configId: 'config',
    organizationId: 'org'
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    isSuccess: true,
    data: report
  });
});

test('controller preserves intentional client errors with a consistent envelope', async () => {
  for (const statusCode of [400, 401, 403, 422, 503]) {
    const error = Object.assign(new Error('Safe public message'), {
      statusCode,
      code: 'REPORT_UNAVAILABLE'
    });
    const response = mockResponse();
    await createSummaryController({
      summaryService: async () => {
        throw error;
      }
    })({
      body: {},
      user: {}
    }, response);
    assert.equal(response.statusCode, statusCode);
    assert.deepEqual(response.body, {
      isSuccess: false,
      error: {
        code: 'REPORT_UNAVAILABLE',
        message: 'Safe public message'
      }
    });
  }
});

test('controller sanitizes unexpected database/provider errors', async () => {
  const response = mockResponse();
  await createSummaryController({
    summaryService: async () => {
      throw new Error('mongodb://private-secret?api_key=secret');
    }
  })({
    body: {},
    user: {}
  }, response);
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.isSuccess, false);
  assert.equal(typeof response.body.error.code, 'string');
  assert.equal(typeof response.body.error.message, 'string');
  assert.doesNotMatch(JSON.stringify(response.body), /private-secret|api_key|mongodb/);
});

test('HTTP route authenticates, rate limits, and delegates only POST /summary', async t => {
  const events = [];
  const router = createSummaryRouter({
    authenticate(req, res, next) {
      events.push('authenticate');

      if (req.headers.authorization !== 'Bearer fixture-token') {
        return res.status(401).json({
          isSuccess: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
      }

      req.user = {
        _id: 'user'
      };
      req.config = {
        configId: 'config'
      };
      req.organizationId = 'org';
      next();
    },
    limiter(req, res, next) {
      events.push('limiter');
      next();
    },
    controller: createSummaryController({
      summaryService: async body => {
        events.push('service');

        return {
          received: body
        };
      }
    })
  });
  const app = express();
  app.use(express.json());
  app.use('/api/customer/chatbot-reporting', router);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/customer/chatbot-reporting/summary`;
  const unauthorized = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: '{}'
  });
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(events.splice(0), ['authenticate']);
  const allowed = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: 'Bearer fixture-token',
      'content-type': 'application/json'
    },
    body: '{"category":"summary"}'
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), {
    isSuccess: true,
    data: {
      received: {
        category: 'summary'
      }
    }
  });
  assert.deepEqual(events.splice(0), ['authenticate', 'limiter', 'service']);
  const get = await fetch(url);
  assert.equal(get.status, 404);
  assert.deepEqual(events.splice(0), []);
});

test('HTTP real service rejects scope injection, foreign profiles, unsupported reports, and invalid bodies', async t => {
  let reads = 0;
  const service = createSummaryService({
    db: {},
    checkReportPermission: async () => true,
    resolveScope: async request => {
      if (JSON.stringify(request).includes('9999')) {
        throw Object.assign(new Error('Profile is not authorized'), {
          statusCode: 403,
          code: 'FORBIDDEN'
        });
      }

      return clone(fixtures.scenarios[0].response.scope);
    },
    readPeriods: async () => {
      reads++;
      const result = {
        rows: [{
          spend: 120,
          sales: 1000,
          orders: 20,
          clicks: 100,
          impressions: 10000
        }],
        verification: 'verified',
        sourceRefs: [{
          name: 'http_fixture',
          completedAt: '2026-10-20T02:00:00.000Z'
        }],
        dataAsOf: '2026-10-20T02:00:00.000Z',
        warnings: []
      };

      return {
        current: result,
        comparison: result
      };
    },
    now: () => new Date('2026-10-20T12:00:00.000Z'),
    makeReportId: () => 'http_test'
  });
  const app = express();
  app.use(express.json());
  app.use('/api/customer/chatbot-reporting', createSummaryRouter({
    authenticate(req, res, next) {
      req.user = {
        _id: '000000000000000000000002'
      };
      req.config = {
        configId: '000000000000000000000001'
      };
      req.organizationId = '000000000000000000000003';
      next();
    },
    limiter(req, res, next) {
      next();
    },
    controller: createSummaryController({
      summaryService: service
    })
  }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/customer/chatbot-reporting/summary`;
  const base = {
    schemaVersion: '1.0',
    category: 'summary',
    profileIds: ['1001'],
    adTypes: ['SP'],
    period: {
      preset: 'yesterday'
    },
    comparison: {
      mode: 'previous_period'
    },
    metrics: ['spend', 'sales', 'acos', 'roas', 'orders', 'cpc', 'cvr']
  };

  for (const [body, expected] of [[{
    ...base,
    configId: '000000000000000000000099'
  }, [400, 422]], [{
    ...base,
    profileIds: ['9999']
  }, [403]], [{
    ...base,
    period: {
      preset: 'last_7_days'
    }
  }, [400, 422]], [{
    ...base,
    adTypes: ['SD']
  }, [400, 422]], [{}, [400, 422]], [[], [400, 422]]]) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    assert.ok(expected.includes(response.status), `${JSON.stringify(body)} returned ${response.status}`);
    const data = await response.json();
    assert.equal(data.isSuccess, false);
    assert.equal(typeof data.error.code, 'string');
    assert.equal(typeof data.error.message, 'string');
  }

  assert.equal(reads, 0);
  const success = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(base)
  });
  assert.equal(success.status, 200);
  const payload = await success.json();
  assert.equal(payload.isSuccess, true);
  assert.doesNotThrow(() => validateReportResponse(payload.data));
  assert.equal(payload.data.cards.find(card => card.metric === 'acos').value, 12);
  assert.equal(reads, 1);
});

test('existing verifyToken validates real JWTs and cached authentication still allows fresh reporting scope denial', async t => {
  // Execute the unchanged middleware source, replacing only its model dependencies.
  // JWT verification, middleware control flow, config selection and cache are real.
  const ids = {
    user: '000000000000000000000002',
    config: '000000000000000000000001',
    organization: '000000000000000000000003',
    role: '000000000000000000000004'
  };
  const objectId = value => new mongoose.Types.ObjectId(value);
  const modelReads = [];
  const lean = value => ({
    lean: async () => value
  });
  const modelStubs = {
    '../models/user.model': {
      findOne(query) {
        modelReads.push(['user', query]);

        return lean({
          _id: objectId(ids.user),
          isActive: true
        });
      }
    },
    '../models/superAdmin/role.model': {
      findOne(query) {
        modelReads.push(['role', query]);

        return lean({
          _id: objectId(ids.role),
          roleName: 'CUSTOMER'
        });
      }
    },
    '../models/profileBasedPermission.model': {
      async aggregate(pipeline) {
        modelReads.push(['profiles', pipeline]);

        return [{
          profileId: 1001,
          configId: objectId(ids.config)
        }];
      }
    },
    '../models/config.model': {
      findById() {
        return lean({
          organizationId: objectId(ids.organization)
        });
      }
    },
    '../models/organization.model': {
      findOne() {
        throw new Error('Unexpected organization fallback');
      }
    },
    '../models/roleBasedPermission.model': {
      findOne() {
        throw new Error('Unexpected permission fallback');
      }
    }
  };
  const secret = 'chatbot-reporting-jwt-unit-test-secret-only';
  const authModule = {
    exports: {}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../api-server/middleware/user.auth'), 'utf8'), {
    module: authModule,
    exports: authModule.exports,
    process: {
      env: {
        CUSTOMER_TOKEN_KEY: secret
      }
    },
    require(name) {
      return Object.hasOwn(modelStubs, name) ? modelStubs[name] : require(name);
    }
  }, {
    filename: 'user.auth.js'
  });
  let reportingReads = 0;
  const scopeRequests = [];
  const service = createSummaryService({
    db: {},
    checkReportPermission: async () => true,
    resolveScope: async (input, context) => {
      scopeRequests.push({
        profileIds: [...input.profileIds],
        context
      });

      if (input.profileIds[0] !== '1001') {
        throw Object.assign(new Error('Reporting profile access denied'), {
          statusCode: 403,
          code: 'REPORT_ACCESS_DENIED'
        });
      }

      return clone(fixtures.scenarios[0].response.scope);
    },
    readPeriods: async () => {
      reportingReads++;
      const result = {
        rows: [{
          spend: 120,
          sales: 1000,
          orders: 20,
          clicks: 100,
          impressions: 10000
        }],
        verification: 'verified',
        sourceRefs: [{
          name: 'jwt_http_fixture',
          completedAt: '2026-10-20T02:00:00.000Z'
        }],
        dataAsOf: '2026-10-20T02:00:00.000Z',
        warnings: []
      };

      return {
        current: result,
        comparison: result
      };
    },
    now: () => new Date('2026-10-20T12:00:00.000Z'),
    makeReportId: () => 'jwt_http_test'
  });
  const app = express();
  app.use(express.json());
  app.use('/api/customer/chatbot-reporting', createSummaryRouter({
    authenticate: authModule.exports.verifyToken,
    limiter(req, res, next) {
      next();
    },
    controller: createSummaryController({
      summaryService: service
    })
  }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/customer/chatbot-reporting/summary`;
  const body = {
    schemaVersion: '1.0',
    category: 'summary',
    profileIds: ['1001'],
    adTypes: ['SP'],
    period: {
      preset: 'yesterday'
    },
    comparison: {
      mode: 'previous_period'
    },
    metrics: ['spend', 'sales', 'acos', 'roas', 'orders', 'cpc', 'cvr']
  };
  const send = (authorization, payload = body) => fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-config-id': ids.config,
      ...(authorization ? {
        authorization
      } : {})
    },
    body: JSON.stringify(payload)
  });
  const missing = await send();
  assert.equal(missing.status, 203);
  assert.equal((await missing.json()).message, 'Token is required');
  const invalid = await send('Bearer invalid-test-token');
  assert.equal(invalid.status, 203);
  assert.equal((await invalid.json()).message, 'Invalid token');
  const wrongSignature = jwt.sign({
    user_id: ids.user,
    roleId: ids.role
  }, 'different-test-only-secret', {
    algorithm: 'HS256',
    expiresIn: '5m'
  });
  const signatureDenied = await send(`Bearer ${wrongSignature}`);
  assert.equal(signatureDenied.status, 203);
  assert.equal((await signatureDenied.json()).message, 'Invalid token');
  assert.equal(scopeRequests.length, 0);
  assert.equal(modelReads.length, 0);
  const token = jwt.sign({
    user_id: ids.user,
    roleId: ids.role
  }, secret, {
    algorithm: 'HS256',
    expiresIn: '5m'
  });
  const allowed = await send(`Bearer ${token}`);
  assert.equal(allowed.status, 200);
  const payload = await allowed.json();
  assert.equal(payload.isSuccess, true);
  assert.doesNotThrow(() => validateReportResponse(payload.data));
  assert.equal(String(scopeRequests[0].context.userId), ids.user);
  assert.equal(String(scopeRequests[0].context.configId), ids.config);
  assert.equal(String(scopeRequests[0].context.organizationId), ids.organization);
  assert.equal(modelReads.find(([name]) => name === 'user')[1]._id, ids.user);
  assert.equal(modelReads.find(([name]) => name === 'role')[1]._id, ids.role);
  const profileLookup = modelReads.find(([name]) => name === 'profiles')[1];
  assert.equal(String(profileLookup[0].$match.configId), ids.config);
  assert.equal(reportingReads, 1);
  const modelReadCount = modelReads.length;
  const denied = await send(`Bearer ${token}`, {
    ...body,
    profileIds: ['9999']
  });
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), {
    isSuccess: false,
    error: {
      code: 'REPORT_ACCESS_DENIED',
      message: 'Reporting profile access denied'
    }
  });
  assert.equal(modelReads.length, modelReadCount, 'second JWT request uses existing authentication cache');
  assert.equal(scopeRequests.length, 2, 'reporting scope is still resolved on every request');
  assert.equal(reportingReads, 1, 'denied profile never reaches report data reads');
});
