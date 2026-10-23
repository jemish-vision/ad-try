'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requestTurn } = require('../api-server/services/aiProvider.service');

const tool = { name: 'run_report', parameters: { type: 'object', properties: {} } };
const userMessages = [{ role: 'user', content: 'Show my report' }];

test('modern Gemini retains original model function call, matching id and report result', async () => {
  const requests = [];
  const client = { models: { generateContent: async input => {
    requests.push(input);

    return requests.length === 1
      ? { candidates: [{ content: { role: 'model', parts: [
        { thoughtSignature: 'preserve_provider_metadata', functionCall: { id: 'google_call_1', name: 'run_report', args: { category: 'summary' } } },
      ] } }] }
      : { candidates: [{ content: { role: 'model', parts: [{ text: 'Verified report explanation' }] } }] };
  } } };
  const first = await requestTurn({ messages: userMessages, tools: [tool], options: { provider: 'gemini' } }, client);
  const second = await requestTurn({ messages: userMessages, tools: [tool], options: { provider: 'gemini' },
    continuation: first.continuation,
    toolResults: [{ toolCallId: first.toolCalls[0].id, name: 'run_report', result: { spend: 10 } }],
  }, client);

  assert.equal(second.text, 'Verified report explanation');
  assert.equal(requests[1].contents[1].parts[0].functionCall.id, 'google_call_1');
  assert.equal(requests[1].contents[1].parts[0].thoughtSignature, 'preserve_provider_metadata');
  assert.equal(requests[1].contents[2].parts[0].functionResponse.id, 'google_call_1');
  assert.equal(requests[1].contents[2].parts[0].functionResponse.response.spend, 10);
});

test('legacy Gemini receives structured continuation and report evidence', async () => {
  const payloads = [];
  const client = { getGenerativeModel: () => ({ generateContent: async input => {
    payloads.push(input);
    return { response: { candidates: [{ content: { role: 'model', parts: payloads.length === 1
      ? [{ functionCall: { name: 'run_report', args: { category: 'summary' } } }]
      : [{ text: 'Verified report explanation' }] } }] } };
  } }) };
  const first = await requestTurn({ messages: userMessages, tools: [tool], options: { provider: 'gemini' } }, client);
  await requestTurn({ messages: userMessages, options: { provider: 'gemini' }, continuation: first.continuation,
    toolResults: [{ toolCallId: first.toolCalls[0].id, name: 'run_report', result: { sales: 50 } }],
  }, client);

  assert.equal(payloads[1].contents[1].parts[0].functionCall.name, 'run_report');
  assert.equal(payloads[1].contents[2].parts[0].functionResponse.response.sales, 50);
  assert.equal(payloads[1].generationConfig.maxOutputTokens, 2048);
});

test('OpenAI continuation contains one system instruction and matching tool result', async () => {
  const requests = [];
  const client = { chat: { completions: { create: async input => {
    requests.push(input);
    return { choices: [{ message: requests.length === 1
      ? { role: 'assistant', tool_calls: [{ id: 'openai_call_1', type: 'function', function: { name: 'run_report', arguments: '{}' } }] }
      : { role: 'assistant', content: 'Report explanation' } }] };
  } } } };
  const first = await requestTurn({ instructions: 'Keep evidence scoped', messages: userMessages, tools: [tool], options: { provider: 'openai' } }, client);
  await requestTurn({ instructions: 'Keep evidence scoped', messages: userMessages, options: { provider: 'openai' }, continuation: first.continuation,
    toolResults: [{ toolCallId: 'openai_call_1', name: 'run_report', result: { spend: 10 } }],
  }, client);

  assert.equal(requests[1].messages.filter(message => message.role === 'system').length, 1);
  assert.equal(requests[1].messages.at(-1).tool_call_id, 'openai_call_1');
});

test('public provider errors omit original SDK error details', async () => {
  const sentinel = 'PRIVATE_SDK_ERROR_SENTINEL';
  const failure = async () => { throw Error(sentinel); };
  const providers = [
    ['anthropic', { messages: { create: failure } }],
    ['openai', { chat: { completions: { create: failure } } }],
    ['gemini', { models: { generateContent: failure } }],
  ];

  for (const [provider, client] of providers) {
    await assert.rejects(() => requestTurn({ messages: userMessages, options: { provider } }, client), error => {
      assert.equal(error.code, 'AI_PROVIDER_ERROR');
      assert.equal(error.message.includes(sentinel), false);
      return true;
    });
  }
});
