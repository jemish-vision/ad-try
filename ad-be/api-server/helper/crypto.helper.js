const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

let cachedKey = null;

const getEncryptionKey = () => {
  if (cachedKey) return cachedKey;

  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is missing!");
  }
  if (key.length === 64) {
    cachedKey = Buffer.from(key, "hex");
    return cachedKey;
  }
  cachedKey = crypto.scryptSync(key, "global-salt-advertiseiq", 32);
  return cachedKey;
};

exports.encrypt = (text) => {
  if (text === null || text === undefined) return text;
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag().toString("hex");
    // Format: iv:authTag:encryptedPayload
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error("Encryption failed:", error);
    throw error;
  }
};

// exports.decrypt = (encryptedText) => {
//   if (!encryptedText) return encryptedText;
//   try {
//     const parts = encryptedText.split(":");
//     if (parts.length !== 3) {
//       return encryptedText; // Fallback for legacy plain text
//     }
//     const [ivHex, authTagHex, encryptedPayload] = parts;
//     const key = getEncryptionKey();
//     const iv = Buffer.from(ivHex, "hex");
//     const authTag = Buffer.from(authTagHex, "hex");
//     const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
//     decipher.setAuthTag(authTag);
//     let decrypted = decipher.update(encryptedPayload, "hex", "utf8");
//     decrypted += decipher.final("utf8");
//     return decrypted;
//   } catch (error) {
//     console.error("Decryption failed:", error);
//     return encryptedText;
//   }
// };

exports.decrypt = (encryptedText) => {
  if (!encryptedText) return encryptedText;
  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      return encryptedText; // Fallback for legacy plain text
    }
    const [ivHex, authTagHex, encryptedPayload] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedPayload, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    return encryptedText;
  }
};
