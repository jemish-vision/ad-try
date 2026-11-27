'use strict';

/**
 * Provider SDK clients for a given API key (the platform's or an organization's own), reused per key.
 * Keys are only used as a hash in the cache key, never stored in plain text here.
 */
const crypto = require('crypto');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleGenAI } = require('@google/genai');

const MAX_CLIENTS = 200;
const clients = new Map();

function cached(kind, apiKey, make) {
  const id = `${kind}:${crypto.createHash('sha256').update(String(apiKey || '')).digest('hex')}`;
  let client = clients.get(id);
  if (!client) {
    if (clients.size >= MAX_CLIENTS) clients.delete(clients.keys().next().value);
    client = make();
    clients.set(id, client);
  }
  return client;
}

function requireKey(apiKey, envName) {
  if (!apiKey) throw new Error(`${envName} not set`);
  return apiKey;
}

const OpenAIClass = OpenAI.default || OpenAI;

/** OpenAI client (chat completions). */
const openaiClient = (apiKey) => cached('openai', requireKey(apiKey, 'OPENAI_API_KEY'), () => new OpenAIClass({ apiKey }));
/** Gemini via @google/generative-ai (getGenerativeModel). */
const geminiClient = (apiKey) => cached('gemini-legacy', requireKey(apiKey, 'GOOGLE_AI_STUDIO_KEY'), () => new GoogleGenerativeAI(apiKey));
/** Gemini via @google/genai (ai.models.generateContent). */
const genAiClient = (apiKey) => cached('genai', requireKey(apiKey, 'GOOGLE_AI_STUDIO_KEY'), () => new GoogleGenAI({ apiKey }));

module.exports = { openaiClient, geminiClient, genAiClient, _clearClientsForTests: () => clients.clear() };
