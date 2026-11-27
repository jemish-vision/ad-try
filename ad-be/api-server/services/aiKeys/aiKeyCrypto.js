'use strict';

/**
 * Encryption for organizations' own AI provider API keys.
 *
 * AES-256-GCM with a key derived (HKDF-SHA256) from ENCRYPTION_KEY for this purpose only, so these
 * ciphertexts can't be decrypted with the key used for other secrets and vice versa. Each ciphertext
 * is bound to its organization and provider (GCM additional data): a stored key copied to another
 * organization or provider fails to decrypt. Decryption is strict: anything that is not a valid
 * ciphertext throws (no plain-text fallback).
 *
 * Stored format: v1:<iv base64>:<auth tag base64>:<ciphertext base64>
 */
const crypto = require('crypto');

const VERSION = 'v1';
const IV_BYTES = 12;
let cachedKey = null;

function dataKey() {
  if (cachedKey) return cachedKey;
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY is not set: AI provider keys cannot be stored');
  const ikm = /^[0-9a-f]{64}$/i.test(secret) ? Buffer.from(secret, 'hex') : Buffer.from(secret, 'utf8');
  cachedKey = Buffer.from(crypto.hkdfSync('sha256', ikm, Buffer.from('advertiseiq-ai-provider-keys'), Buffer.from(`ai-provider-keys:${VERSION}`), 32));
  return cachedKey;
}

const aadFor = (organizationId, provider) => Buffer.from(`${String(organizationId)}:${String(provider)}`, 'utf8');

function encryptApiKey(plain, { organizationId, provider }) {
  if (typeof plain !== 'string' || !plain) throw new Error('Nothing to encrypt');
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', dataKey(), iv);
  cipher.setAAD(aadFor(organizationId, provider));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

function decryptApiKey(blob, { organizationId, provider }) {
  const parts = String(blob || '').split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Stored AI key is not in a supported format');
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAAD(aadFor(organizationId, provider));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

/** What may be shown of a key: its well-known prefix and last 4 characters, e.g. "sk-ant-…a1B2". */
function keyHint(plain) {
  const k = String(plain || '');
  const prefix = (k.match(/^(sk-ant-|sk-proj-|sk-svcacct-|sk-|AIza)/) || [''])[0];
  return `${prefix}…${k.slice(-4)}`;
}

const _resetKeyCacheForTests = () => {
  cachedKey = null;
};

module.exports = { encryptApiKey, decryptApiKey, keyHint, _resetKeyCacheForTests };
