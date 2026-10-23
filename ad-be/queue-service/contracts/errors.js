const { UnrecoverableError } = require("bullmq");

class PermanentJobError extends UnrecoverableError {
  constructor(message, details = {}) {
    super(message);
    this.name = "PermanentJobError";
    this.details = details;
  }
}

class InvalidJobPayloadError extends UnrecoverableError {
  constructor(message, details = {}) {
    super(message);
    this.name = "InvalidJobPayloadError";
    this.details = details;
  }
}

class ProfileInactiveError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProfileInactiveError";
    this.details = details;
    this.isOperational = true;
  }
}

class DependencyNotReadyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DependencyNotReadyError";
    this.details = details;
    this.isOperational = true;
  }
}

class RateLimitError extends Error {
  constructor(message, retryAfterMs = 60000) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
    this.isOperational = true;
  }
}

class TransientAmazonError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "TransientAmazonError";
    this.details = details;
    this.isOperational = true;
  }
}

module.exports = {
  PermanentJobError,
  InvalidJobPayloadError,
  ProfileInactiveError,
  DependencyNotReadyError,
  RateLimitError,
  TransientAmazonError,
};
