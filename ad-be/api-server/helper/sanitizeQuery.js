const SAFE_OPERATORS = new Set([
  // Comparison
  "$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin", "$exists", "$regex", "$options", "$type", "$set", "$unset", "$push",
  // Logical
  "$and", "$or", "$not", "$nor",
  // Expression & Arithmetic (used in rules such as BudgetUsage via $expr, $multiply, $divide)
  "$expr", "$multiply", "$mul", "$divide", "$add", "$subtract", "$mod", "$cond"
]);

const sanitizeQueryObject = (obj) => {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeQueryObject(item));
  }

  const sanitized = {};
  for (const key of Object.keys(obj)) {
    // If a key starts with "$" (MongoDB operator), ensure it is in the whitelist of safe query/expression operators
    if (key.startsWith("$") && !SAFE_OPERATORS.has(key)) {
      continue;
    }
    sanitized[key] = sanitizeQueryObject(obj[key]);
  }
  return sanitized;
};

module.exports = { sanitizeQueryObject, SAFE_OPERATORS };
