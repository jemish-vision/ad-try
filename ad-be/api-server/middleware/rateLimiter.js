let rateLimitPackage = null;
try {
  rateLimitPackage = require("express-rate-limit");
} catch (e) {
  rateLimitPackage = null;
}

const createInMemoryLimiter = ({ windowMs, max, message }) => {
  const hits = new Map();

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of hits.entries()) {
      if (now > data.resetTime) {
        hits.delete(key);
      }
    }
  }, 60 * 1000);

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req, res, next) => {
    const ip =
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "unknown-ip";
    const now = Date.now();

    let record = hits.get(ip);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(ip, record);
      return next();
    }

    record.count += 1;
    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader("Retry-After", retryAfterSeconds);
      return res.status(429).json({
        isSuccess: false,
        message:
          typeof message === "string"
            ? message
            : message?.message || "Too many requests, please try again later.",
      });
    }

    return next();
  };
};

const createRateLimiter = ({ windowMs, max, message }) => {
  if (rateLimitPackage) {
    return rateLimitPackage({
      windowMs,
      max,
      message:
        typeof message === "string"
          ? { isSuccess: false, message }
          : message,
      standardHeaders: true,
      legacyHeaders: false,
    });
  }
  return createInMemoryLimiter({ windowMs, max, message });
};

// Global API rate limit: 100000 requests per 15 minutes per IP
const globalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100000,
  message: "Too many requests from this IP, please try again after 15 minutes.",
});

// Sensitive Auth / Login rate limit: 15 attempts per 15 minutes per IP
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: "Too many login/authentication attempts from this IP, please try again after 15 minutes.",
});

// OTP rate limit: 10 attempts per 15 minutes per IP
const otpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many OTP requests or verification attempts from this IP, please try again after 15 minutes.",
});

// Chatbot LLM rate limit: 30 requests per hour per IP
const chatbotLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: "Too many chatbot requests from this IP, please try again later.",
});

// Support ticket rate limit: 100 requests per hour per IP
const ticketLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: "Too many support ticket requests from this IP, please try again later.",
});

module.exports = {
  createRateLimiter,
  globalLimiter,
  authLimiter,
  otpLimiter,
  chatbotLimiter,
  ticketLimiter,
};
