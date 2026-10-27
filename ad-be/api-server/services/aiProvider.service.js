'use strict';

const SUPPORTED_PROVIDERS = Object.freeze(['anthropic', 'openai', 'gemini']);

const DEFAULT_MODELS = Object.freeze({
  anthropic: 'claude-haiku-5-5',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
});

function providerError(code, message, originalError = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 502;
  if (originalError) {
    // Sanitize any API key that might be in error messages
    error.details = String(originalError.message || originalError)
      .replace(/sk-[a-zA-Z0-9_-]{20,}/g, '[REDACTED]')
      .replace(/key=[a-zA-Z0-9_-]{20,}/g, 'key=[REDACTED]');
  }
  return error;
}

function resolveConfig(overrides = {}) {
  const provider = (overrides.provider || process.env.AI_PROVIDER || 'anthropic').toLowerCase().trim();

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw providerError('UNSUPPORTED_AI_PROVIDER', `Unsupported AI provider "${provider}". Supported providers are: ${SUPPORTED_PROVIDERS.join(', ')}`);
  }

  const model = overrides.model
    || (provider === 'anthropic' && process.env.ANTHROPIC_MODEL)
    || (provider === 'openai' && process.env.OPENAI_MODEL)
    || (provider === 'gemini' && (process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_MODEL))
    || DEFAULT_MODELS[provider];

  const apiKey = overrides.apiKey
    || (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY)
    || (provider === 'openai' && process.env.OPENAI_API_KEY)
    || (provider === 'gemini' && (process.env.GOOGLE_AI_STUDIO_KEY || process.env.GEMINI_API_KEY));

  const timeoutMs = Number.isSafeInteger(overrides.timeoutMs) && overrides.timeoutMs > 0
    ? overrides.timeoutMs
    : Number(process.env.AI_TIMEOUT_MS) || 45000;

  const maxTokens = Number.isSafeInteger(overrides.maxTokens) && overrides.maxTokens > 0
    ? overrides.maxTokens
    : Number(process.env.AI_MAX_TOKENS) || 2048;

  const enablePromptCaching = overrides.enablePromptCaching !== undefined
    ? Boolean(overrides.enablePromptCaching)
    : process.env.AI_ENABLE_PROMPT_CACHING !== 'false';

  const promptCacheTtl = overrides.promptCacheTtl
    || process.env.AI_PROMPT_CACHE_TTL
    || '1h';

  return {
    provider,
    model,
    apiKey,
    timeoutMs,
    maxTokens,
    enablePromptCaching,
    promptCacheTtl,
  };
}

// ---------------------------------------------------------------------------
// Anthropic Implementation
// ---------------------------------------------------------------------------
function formatAnthropicTools(tools = [], enableCaching = true, ttl = '1h') {
  const formatted = tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters || { type: 'object', properties: {} },
  }));

  if (enableCaching && formatted.length > 0) {
    const cacheControl = { type: 'ephemeral' };
    if (ttl) {
      cacheControl.ttl = ttl;
    }
    formatted[formatted.length - 1].cache_control = cacheControl;
  }

  return formatted;
}

function formatAnthropicMessages(messages = [], toolResults = [], continuation = null) {
  if (continuation?.provider === 'anthropic' && Array.isArray(continuation.messages)) {
    const list = [...continuation.messages];
    if (toolResults.length) {
      list.push({
        role: 'user',
        content: toolResults.map(tr => ({
          type: 'tool_result',
          tool_use_id: tr.toolCallId,
          content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
        })),
      });
    }
    return list;
  }

  const list = [];
  for (const m of messages) {
    if (m.role === 'user' || m.role === 'assistant') {
      list.push({ role: m.role, content: m.content });
    }
  }

  if (toolResults.length) {
    list.push({
      role: 'user',
      content: toolResults.map(tr => ({
        type: 'tool_result',
        tool_use_id: tr.toolCallId,
        content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
      })),
    });
  }

  return list;
}

async function requestAnthropic(config, turn, clientFactory) {
  if (!config.apiKey && !clientFactory) {
    throw providerError('AI_CREDENTIALS_MISSING', 'ANTHROPIC_API_KEY is not configured on the server');
  }

  let client;
  if (clientFactory) {
    if (typeof clientFactory === 'function' && !clientFactory.messages) {
      client = new clientFactory({ apiKey: config.apiKey, timeout: config.timeoutMs });
    } else {
      client = clientFactory;
    }
  } else {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: config.apiKey, timeout: config.timeoutMs });
  }

  const messages = formatAnthropicMessages(turn.messages, turn.toolResults, turn.continuation);
  const enableCaching = config.enablePromptCaching !== false;
  const ttl = config.promptCacheTtl || '1h';
  const cacheControl = { type: 'ephemeral' };
  if (ttl) {
    cacheControl.ttl = ttl;
  }

  let system;
  if (turn.instructions) {
    system = enableCaching
      ? [{ type: 'text', text: turn.instructions, cache_control: cacheControl }]
      : turn.instructions;
  }

  const payload = {
    model: config.model,
    max_tokens: config.maxTokens,
    system,
    messages,
  };

  if (turn.tools && turn.tools.length) {
    payload.tools = formatAnthropicTools(turn.tools, enableCaching, ttl);
  }

  const betaHeaders = ['prompt-caching-2024-07-31'];
  if (ttl === '1h') {
    betaHeaders.push('extended-cache-ttl-2025-04-11');
  }

  const requestOptions = {
    signal: turn.signal,
    ...(enableCaching ? { headers: { 'anthropic-beta': betaHeaders.join(',') } } : {}),
  };

  let response;
  try {
    if (typeof turn.onToken === 'function' && typeof client.messages?.stream === 'function') {
      const stream = client.messages.stream(payload, requestOptions);
      stream.on('text', (textDelta) => {
        try { turn.onToken(textDelta); } catch (_) {}
      });
      response = await stream.finalMessage();
    } else {
      response = await client.messages.create(payload, requestOptions);
    }
  } catch (err) {
    throw providerError('AI_PROVIDER_ERROR', 'Anthropic API request failed', err);
  }

  let text = '';
  const toolCalls = [];

  for (const block of response.content || []) {
    if (block.type === 'text') {
      text += (text ? '\n\n' : '') + block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: typeof block.input === 'object' && block.input !== null ? block.input : {},
      });
    }
  }

  const nextMessages = [...messages, { role: 'assistant', content: response.content }];

  return {
    provider: 'anthropic',
    model: response.model || config.model,
    text,
    toolCalls,
    finishReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'stop',
    usage: {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      cacheCreationInputTokens: response.usage?.cache_creation_input_tokens || 0,
      cacheReadInputTokens: response.usage?.cache_read_input_tokens || 0,
    },
    continuation: {
      provider: 'anthropic',
      model: config.model,
      messages: nextMessages,
    },
  };
}

// ---------------------------------------------------------------------------
// OpenAI Implementation
// ---------------------------------------------------------------------------
function formatOpenAITools(tools = []) {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: 'object', properties: {} },
    },
  }));
}

function formatOpenAIMessages(messages = [], toolResults = [], continuation = null) {
  if (continuation?.provider === 'openai' && Array.isArray(continuation.messages)) {
    const list = [...continuation.messages];
    for (const tr of toolResults) {
      list.push({
        role: 'tool',
        tool_call_id: tr.toolCallId,
        content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
      });
    }
    return list;
  }

  const list = [];
  for (const m of messages) {
    if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
      list.push({ role: m.role, content: m.content });
    }
  }

  for (const tr of toolResults) {
    list.push({
      role: 'tool',
      tool_call_id: tr.toolCallId,
      content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
    });
  }

  return list;
}

async function requestOpenAI(config, turn, clientFactory) {
  if (!config.apiKey && !clientFactory) {
    throw providerError('AI_CREDENTIALS_MISSING', 'OPENAI_API_KEY is not configured on the server');
  }

  let client;
  if (clientFactory) {
    if (typeof clientFactory === 'function' && !clientFactory.chat) {
      client = new clientFactory({ apiKey: config.apiKey, timeout: config.timeoutMs });
    } else {
      client = clientFactory;
    }
  } else {
    const OpenAI = require('openai');
    client = new OpenAI({ apiKey: config.apiKey, timeout: config.timeoutMs });
  }

  const messages = [];
  if (turn.instructions && turn.continuation?.provider !== 'openai') {
    messages.push({ role: 'system', content: turn.instructions });
  }
  messages.push(...formatOpenAIMessages(turn.messages, turn.toolResults, turn.continuation));

  const payload = {
    model: config.model,
    max_tokens: config.maxTokens,
    messages,
  };

  if (turn.tools && turn.tools.length) {
    payload.tools = formatOpenAITools(turn.tools);
  }

  let response;
  try {
    response = await client.chat.completions.create(payload, { signal: turn.signal });
  } catch (err) {
    throw providerError('AI_PROVIDER_ERROR', 'OpenAI API request failed', err);
  }

  const choice = response.choices?.[0] || {};
  const message = choice.message || {};
  const text = message.content || '';
  const toolCalls = (message.tool_calls || []).map(tc => {
    let args = {};
    try {
      args = JSON.parse(tc.function?.arguments || '{}');
    } catch (_) {
      args = {};
    }
    return {
      id: tc.id,
      name: tc.function?.name,
      arguments: args,
    };
  });

  const nextMessages = [...messages, message];

  return {
    provider: 'openai',
    model: response.model || config.model,
    text,
    toolCalls,
    finishReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'stop',
    usage: {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: response.usage?.prompt_tokens_details?.cached_tokens || 0,
    },
    continuation: {
      provider: 'openai',
      model: config.model,
      messages: nextMessages,
    },
  };
}

// ---------------------------------------------------------------------------
// Gemini Implementation
// ---------------------------------------------------------------------------
function formatGeminiTools(tools = []) {
  const functionDeclarations = tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters || { type: 'object', properties: {} },
  }));
  return [{ functionDeclarations }];
}

function formatGeminiContents(turn) {
  const previous = turn.continuation?.provider === 'gemini'
    ? turn.continuation.contents
    : null;
  const contents = Array.isArray(previous)
    ? [...previous]
    : (turn.messages || []).map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));

  if (turn.toolResults?.length) {
    contents.push({
      role: 'user',
      parts: turn.toolResults.map(result => {
        const providerCall = contents.flatMap(content => content.parts || [])
          .find(part => part.functionCall?.id === result.toolCallId)?.functionCall;

        return {
          functionResponse: {
            name: result.name,
            response: typeof result.result === 'object' ? result.result : { result: result.result },
            ...(providerCall?.id ? { id: providerCall.id } : {}),
          },
        };
      }),
    });
  }

  return contents;
}

async function requestGemini(config, turn, clientFactory) {
  if (!config.apiKey && !clientFactory) {
    throw providerError('AI_CREDENTIALS_MISSING', 'GOOGLE_AI_STUDIO_KEY / GEMINI_API_KEY is not configured on the server');
  }

  let client;
  if (clientFactory) {
    client = clientFactory;
  } else {
    try {
      const { GoogleGenAI } = require('@google/genai');
      client = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: { timeout: config.timeoutMs } });
    } catch (_) {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      client = new GoogleGenerativeAI(config.apiKey);
    }
  }

  const contents = formatGeminiContents(turn);
  let response;
  try {
    if (client.models?.generateContent) {
      response = await client.models.generateContent({
        model: config.model,
        contents,
        config: {
          systemInstruction: turn.instructions || undefined,
          tools: turn.tools?.length ? formatGeminiTools(turn.tools) : undefined,
          maxOutputTokens: config.maxTokens,
          abortSignal: turn.signal,
        },
      });
    } else if (client.getGenerativeModel) {
      const model = client.getGenerativeModel({
        model: config.model,
        systemInstruction: turn.instructions || undefined,
        tools: turn.tools?.length ? formatGeminiTools(turn.tools) : undefined,
      });
      response = await model.generateContent({
        contents,
        generationConfig: { maxOutputTokens: config.maxTokens },
      }, { timeout: config.timeoutMs, signal: turn.signal });
    } else if (typeof client === 'function') {
      response = await client(config, turn);
    } else {
      throw new Error('Unsupported Gemini client interface');
    }
  } catch (err) {
    throw providerError('AI_PROVIDER_ERROR', 'Gemini API request failed', err);
  }

  let text = '';
  const toolCalls = [];

  const candidate = response.candidates?.[0] || response.response?.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  for (const part of parts) {
    if (part.text) {
      text += (text ? '\n\n' : '') + part.text;
    }
    if (part.functionCall) {
      toolCalls.push({
        id: part.functionCall.id || `${part.functionCall.name}_${toolCalls.length}`,
        name: part.functionCall.name,
        arguments: part.functionCall.args || {},
      });
    }
  }

  if (!text && typeof response.text === 'function') {
    text = response.text();
  }

  return {
    provider: 'gemini',
    model: config.model,
    text,
    toolCalls,
    finishReason: toolCalls.length ? 'tool_use' : 'stop',
    usage: {
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: response.usageMetadata?.cachedContentTokenCount || 0,
    },
    continuation: {
      provider: 'gemini',
      model: config.model,
      contents: candidate?.content ? [...contents, { role: 'model', ...candidate.content }] : contents,
    },
  };
}

// ---------------------------------------------------------------------------
// Unified Public Interface
// ---------------------------------------------------------------------------
async function requestTurn(input = {}, clientFactory = null) {
  const config = resolveConfig(input.options || {});

  switch (config.provider) {
    case 'anthropic':
      return requestAnthropic(config, input, clientFactory);
    case 'openai':
      return requestOpenAI(config, input, clientFactory);
    case 'gemini':
      return requestGemini(config, input, clientFactory);
    default:
      throw providerError('UNSUPPORTED_AI_PROVIDER', `Unknown provider: ${config.provider}`);
  }
}

module.exports = {
  SUPPORTED_PROVIDERS,
  DEFAULT_MODELS,
  resolveConfig,
  requestTurn,
};
