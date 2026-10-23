'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveConfig,
  requestTurn,
  SUPPORTED_PROVIDERS,
} = require('../api-server/services/aiProvider.service');

test('resolveConfig defaults to anthropic with standard model and options', () => {
  const originalEnv = process.env.AI_PROVIDER;
  delete process.env.AI_PROVIDER;

  const config = resolveConfig();
  assert.equal(config.provider, 'anthropic');
  assert.equal(config.model, 'claude-haiku-5-5');
  assert.equal(config.maxTokens, 2048);
  assert.equal(config.timeoutMs, 45000);

  if (originalEnv) process.env.AI_PROVIDER = originalEnv;
});

test('resolveConfig supports switching to openai and gemini explicitly', () => {
  const openaiConfig = resolveConfig({ provider: 'openai', model: 'gpt-4o-mini' });
  assert.equal(openaiConfig.provider, 'openai');
  assert.equal(openaiConfig.model, 'gpt-4o-mini');

  const geminiConfig = resolveConfig({ provider: 'gemini', model: 'gemini-2.0-flash' });
  assert.equal(geminiConfig.provider, 'gemini');
  assert.equal(geminiConfig.model, 'gemini-2.0-flash');
});

test('resolveConfig rejects unknown providers with UNSUPPORTED_AI_PROVIDER', () => {
  assert.throws(
    () => resolveConfig({ provider: 'deepseek_v3' }),
    err => err.code === 'UNSUPPORTED_AI_PROVIDER'
  );
});

test('requestTurn with Anthropic stub executes tools and normalizes response', async () => {
  const stubClient = {
    messages: {
      create: async (payload) => {
        assert.equal(payload.model, 'claude-haiku-5-5');
        assert.ok(payload.tools.some(t => t.name === 'run_report'));
        return {
          model: 'claude-haiku-5-5',
          content: [
            { type: 'text', text: 'Analyzing your performance:' },
            {
              type: 'tool_use',
              id: 'call_anthropic_1',
              name: 'run_report',
              input: { category: 'summary', period: { preset: 'yesterday' } },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 150, output_tokens: 45 },
        };
      },
    },
  };

  const response = await requestTurn({
    instructions: 'You are an Amazon advertising assistant.',
    messages: [{ role: 'user', content: 'How did yesterday go?' }],
    tools: [{
      name: 'run_report',
      description: 'Run advertising report',
      parameters: { type: 'object', properties: { category: { type: 'string' } } },
    }],
    options: { provider: 'anthropic', apiKey: 'test-key' },
  }, stubClient);

  assert.equal(response.provider, 'anthropic');
  assert.equal(response.text, 'Analyzing your performance:');
  assert.equal(response.toolCalls.length, 1);
  assert.equal(response.toolCalls[0].id, 'call_anthropic_1');
  assert.equal(response.toolCalls[0].name, 'run_report');
  assert.equal(response.toolCalls[0].arguments.category, 'summary');
  assert.equal(response.finishReason, 'tool_use');
  assert.equal(response.usage.inputTokens, 150);
  assert.equal(response.usage.outputTokens, 45);
  assert.equal(response.continuation.provider, 'anthropic');
});

test('requestTurn with Anthropic stub handles toolResults continuation', async () => {
  let capturedMessages = null;
  const stubClient = {
    messages: {
      create: async (payload) => {
        capturedMessages = payload.messages;
        return {
          model: 'claude-haiku-5-5',
          content: [{ type: 'text', text: 'Yesterday your spend was $100 and sales were $500.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 280, output_tokens: 30 },
        };
      },
    },
  };

  const continuation = {
    provider: 'anthropic',
    messages: [
      { role: 'user', content: 'How did yesterday go?' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'call_anthropic_1', name: 'run_report', input: {} }] },
    ],
  };

  const response = await requestTurn({
    toolResults: [{ toolCallId: 'call_anthropic_1', name: 'run_report', result: { spend: 100, sales: 500 } }],
    continuation,
    options: { provider: 'anthropic', apiKey: 'test-key' },
  }, stubClient);

  assert.equal(response.text, 'Yesterday your spend was $100 and sales were $500.');
  assert.equal(response.toolCalls.length, 0);
  assert.equal(response.finishReason, 'stop');
  const toolResultMsg = capturedMessages.find(m => Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result'));
  assert.ok(toolResultMsg);
});

test('requestTurn with OpenAI stub executes tools and normalizes response', async () => {
  const stubClient = {
    chat: {
      completions: {
        create: async (payload) => {
          assert.equal(payload.model, 'gpt-4o');
          assert.ok(payload.tools.some(t => t.function.name === 'run_report'));
          return {
            model: 'gpt-4o',
            choices: [{
              message: {
                content: 'Checking report:',
                tool_calls: [{
                  id: 'call_openai_1',
                  function: {
                    name: 'run_report',
                    arguments: JSON.stringify({ category: 'waste' }),
                  },
                }],
              },
              finish_reason: 'tool_calls',
            }],
            usage: { prompt_tokens: 110, completion_tokens: 25 },
          };
        },
      },
    },
  };

  const response = await requestTurn({
    instructions: 'You are an advertising assistant.',
    messages: [{ role: 'user', content: 'Where am I wasting money?' }],
    tools: [{
      name: 'run_report',
      description: 'Run report',
      parameters: { type: 'object', properties: { category: { type: 'string' } } },
    }],
    options: { provider: 'openai', apiKey: 'test-key' },
  }, stubClient);

  assert.equal(response.provider, 'openai');
  assert.equal(response.text, 'Checking report:');
  assert.equal(response.toolCalls.length, 1);
  assert.equal(response.toolCalls[0].id, 'call_openai_1');
  assert.equal(response.toolCalls[0].arguments.category, 'waste');
  assert.equal(response.finishReason, 'tool_use');
  assert.equal(response.continuation.provider, 'openai');
});

test('requestTurn with Gemini stub executes tools and normalizes response', async () => {
  const stubClient = {
    models: {
      generateContent: async (payload) => {
        assert.equal(payload.model, 'gemini-2.0-flash');
        return {
          candidates: [{
            content: {
              parts: [{
                functionCall: {
                  name: 'run_report',
                  args: { category: 'time' },
                },
              }],
            },
          }],
          usageMetadata: { promptTokenCount: 95, candidatesTokenCount: 20 },
        };
      },
    },
  };

  const response = await requestTurn({
    instructions: 'You are an assistant.',
    messages: [{ role: 'user', content: 'When do my ads work best?' }],
    tools: [{
      name: 'run_report',
      description: 'Run report',
      parameters: { type: 'object', properties: { category: { type: 'string' } } },
    }],
    options: { provider: 'gemini', apiKey: 'test-key' },
  }, stubClient);

  assert.equal(response.provider, 'gemini');
  assert.equal(response.toolCalls.length, 1);
  assert.equal(response.toolCalls[0].name, 'run_report');
  assert.equal(response.toolCalls[0].arguments.category, 'time');
  assert.equal(response.finishReason, 'tool_use');
});

test('requestTurn throws AI_CREDENTIALS_MISSING when API key is missing', async () => {
  await assert.rejects(
    requestTurn({ options: { provider: 'anthropic', apiKey: '' } }),
    err => err.code === 'AI_CREDENTIALS_MISSING'
  );
  await assert.rejects(
    requestTurn({ options: { provider: 'openai', apiKey: '' } }),
    err => err.code === 'AI_CREDENTIALS_MISSING'
  );
  await assert.rejects(
    requestTurn({ options: { provider: 'gemini', apiKey: '' } }),
    err => err.code === 'AI_CREDENTIALS_MISSING'
  );
});

test('requestTurn wraps errors and sanitizes credentials', async () => {
  const stubClient = {
    messages: {
      create: async () => {
        throw new Error('API request failed with invalid key sk-ant-api03-abcdef1234567890abcdef1234567890');
      },
    },
  };

  await assert.rejects(
    requestTurn({ options: { provider: 'anthropic', apiKey: 'test' } }, stubClient),
    err => {
      assert.equal(err.code, 'AI_PROVIDER_ERROR');
      assert.ok(!err.details.includes('abcdef1234567890'));
      assert.ok(err.details.includes('[REDACTED]'));
      return true;
    }
  );
});
