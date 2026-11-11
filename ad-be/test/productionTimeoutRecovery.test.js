const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const pause = () => new Promise(resolve => setImmediate(resolve));
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function bulkFixture() {
  const context = { module: { exports: {} }, process: { env: {} }, require(name) {
    if (name.includes('logger')) return { write_logs() {} };
    return require(name);
  } };
  vm.runInNewContext(read('api-server/helper/parallelBulkWrite.js'), context);
  return context.module.exports.parallelBulkWrite;
}

test('bulk concurrency is shared across independent callers without losing rows', async () => {
  const write = bulkFixture();
  let active = 0, max = 0, count = 0;
  const model = { async bulkWrite(rows, options) {
    assert.equal(options.ordered, false);
    max = Math.max(max, ++active);
    await pause();
    count += rows.length;
    active--;
  } };
  await Promise.all(Array.from({ length: 20 }, () => write(model, Array.from({ length: 12 }, (_, id) => ({ id })), 2)));
  assert.equal(max, 2);
  assert.equal(count, 240);
});

test('bulk failure drains siblings before returning and stops later chunks', async () => {
  const write = bulkFixture();
  let release, calls = 0, finished = false;
  const blocked = new Promise(resolve => { release = resolve; });
  const failure = new Error('database unavailable');
  const model = { async bulkWrite() {
    if (++calls === 1) throw failure;
    await blocked;
  } };
  const job = write(model, [1, 2, 3, 4], 1).catch(error => { finished = true; return error; });
  await pause();
  assert.equal(finished, false);
  assert.equal(calls, 2);
  release();
  assert.equal(await job, failure);
  assert.equal(calls, 2);
});

test('invalid bulk batch size fails instead of looping forever', async () => {
  await assert.rejects(bulkFixture()({}, [1], -1), /positive integer/);
});

test('nonduplicate validation errors remain fatal', async () => {
  const error = Object.assign(new Error('validation'), { writeErrors: [{ code: 121 }] });
  await assert.rejects(bulkFixture()({ bulkWrite: async () => { throw error; } }, [1]), /validation/);
});

test('duplicate-only bulk conflicts retain the existing recovery behavior', async () => {
  let calls = 0;
  const duplicate = Object.assign(new Error('duplicate'), { code: 11000, writeErrors: [{ code: 11000 }] });
  await bulkFixture()({ async bulkWrite() { calls++; throw duplicate; } }, [1, 2, 3], 1);
  assert.equal(calls, 3);
});

function renewalFixture(users, sender) {
  const updates = [];
  const history = function () { this._id = 'history'; this.save = async () => {}; };
  history.findByIdAndUpdate = async (id, value) => updates.push(value);
  const context = {
    exports: {}, process: { env: {} }, Buffer, AggregateError,
    moment: Object.assign(() => ({ tz: () => ({ format: () => '2026-11-06' }) }), { utc: () => ({ format: () => '2026-11-06' }) }),
    cron_logs() {}, cronJobHistorySchema: history,
    userSchema: {
      aggregate: async () => users,
      findOne: () => ({ lean: () => ({ populate: async () => ({ roleId: { roleName: 'user' } }) }) }),
    },
    googleconfigSchema: { findOne: () => ({ lean: async () => null }) },
    limit: fn => fn(), sendEmailHelper: sender, trialEndReminderEmail: data => data,
  };
  const source = read('api-server/controllers/user.controller.js');
  vm.runInNewContext(source.slice(source.indexOf('exports.cronSendSubscriptionRenewalEmail'), source.indexOf('exports.cancelSubscription')), context);
  return { run: context.exports.cronSendSubscriptionRenewalEmail, updates };
}

test('zero renewal recipients complete without undefined users reference', async () => {
  const f = renewalFixture([], () => { throw new Error('unexpected send'); });
  await f.run();
  assert.equal(f.updates.at(-1).status, 'COMPLETED');
  assert.equal(f.updates.at(-1).recordsCount, 0);
});

test('renewal completion waits for delivery', async () => {
  let release;
  const delivery = new Promise(resolve => { release = resolve; });
  const f = renewalFixture([{ _id: 1, email: 'test@example.com' }], () => delivery);
  const run = f.run();
  await pause();
  assert.equal(f.updates.length, 0);
  release({ delivered: true });
  await run;
  assert.equal(f.updates.at(-1).status, 'COMPLETED');
  assert.equal(f.updates.at(-1).recordsCount, 1);
});

test('failed renewal delivery is recorded after siblings finish', async () => {
  let release, sends = 0;
  const delivery = new Promise(resolve => { release = resolve; });
  const f = renewalFixture([{ _id: 1 }, { _id: 2 }], () => ++sends === 1 ? { delivered: false } : delivery);
  const run = f.run();
  await pause();
  assert.equal(f.updates.length, 0);
  release({ delivered: true });
  await assert.rejects(run, /1 subscription reminders failed/);
  assert.equal(f.updates.at(-1).status, 'FAILED');
  assert.match(f.updates.at(-1).error, /1 subscription reminders failed/);
});

function emailFixture(env) {
  const configContext = { module: { exports: {} }, process: { env } };
  vm.runInNewContext(read('shared/emailConfig.js'), configContext);
  let transports = 0, options, mail;
  const logs = [];
  const context = { module: { exports: {} }, process: { env }, require(name) {
    if (name.includes('logger')) return { cron_logs: log => logs.push(log) };
    if (name.includes('emailConfig')) return configContext.module.exports;
    if (name === 'nodemailer') return { createTransport: transport => {
      options = transport; transports++;
      return { sendMail: (_mail, cb) => { mail = _mail; cb(null, {}); } };
    } };
    throw new Error(name);
  } };
  vm.runInNewContext(read('api-server/helper/emailHelper.js'), context);
  return { send: context.module.exports.sendEmailHelper, logs, transports: () => transports, options: () => options, mail: () => mail };
}

test('merged mail configuration preserves Gmail, SMTP ports, and custom sender', async () => {
  for (const [host, port, service, secure] of [
    ['smtp.gmail.com', '587', 'gmail', undefined],
    ['smtp.unitpost.com', '2587', undefined, false],
    ['smtp.example.com', '465', undefined, true],
  ]) {
    const f = emailFixture({ NODE_ENV: 'production', EMAIL_USER: 'test', EMAIL_PASS: 'test-pass', EMAIL_HOST: host, EMAIL_PORT: port, EMAIL_FROM: 'sender@example.com' });
    assert.equal((await f.send('to@example.com', 'subject', 'body')).delivered, true);
    assert.equal(f.options().service, service);
    assert.equal(f.options().secure, secure);
    if (!service) {
      assert.equal(f.options().host, host);
      assert.equal(f.options().port, Number(port));
    }
    assert.equal(f.mail().from, 'sender@example.com');
    assert.equal(f.mail().to, 'to@example.com');
    assert.equal(f.mail().subject, 'subject');
  }
});

test('SMTP settings loaded after import use legacy credentials', async () => {
  const env = {};
  const f = emailFixture(env);
  Object.assign(env, { EMAIL_USER: 'test', PASS: 'test-pass' });
  assert.equal((await f.send('to@example.com', 'subject', 'body')).delivered, true);
  assert.equal(f.options().auth.pass, 'test-pass');
});

test('missing SMTP credentials fail before connecting; explicit password works', async () => {
  const env = { EMAIL_USER: 'test' };
  const f = emailFixture(env);
  const result = await f.send('to@example.com', 'subject', 'private body');
  assert.equal(result.delivered, false);
  assert.equal(f.transports(), 0);
  assert.match(result.error.message, /Email credentials missing/);
  env.EMAIL_PASS = 'secret';
  assert.equal((await f.send('to@example.com', 'subject', 'private body')).delivered, true);
  assert.equal(f.options().auth.pass, 'secret');
  assert.ok(f.logs.every(log => !/private body|secret/.test(log.message)));
});

const { withDrainingTimeout } = require('../worker-service/drainingTimeout.helper');
test('deadline reports timeout while retaining the worker until actual settlement', async () => {
  let release, reported, finished = false;
  const task = new Promise(resolve => { release = resolve; });
  const deadline = new Promise(resolve => { reported = resolve; });
  const run = withDrainingTimeout(task, 5, 'test', reported).catch(error => { finished = true; return error; });
  await deadline;
  assert.equal(finished, false);
  release('late result');
  assert.match((await run).message, /exceeded 5ms timeout/);
});

test('normal task results and errors are preserved', async () => {
  assert.equal(await withDrainingTimeout(Promise.resolve(42), 100, 'test'), 42);
  await assert.rejects(withDrainingTimeout(Promise.reject(new Error('task error')), 100, 'test'), /task error/);
});

test('a late failing task is drained without an unhandled rejection', async () => {
  let reject, notify;
  const task = new Promise((_resolve, fail) => { reject = fail; });
  const deadline = new Promise(resolve => { notify = resolve; });
  const run = withDrainingTimeout(task, 5, 'late failure', notify);
  await deadline;
  const checked = assert.rejects(run, /exceeded 5ms timeout/);
  reject(new Error('database unavailable'));
  await checked;
});
