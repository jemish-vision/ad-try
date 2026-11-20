function sellerOwnerScope(organizationId, userId) {
  if (organizationId && userId) {
    return { $or: [{ organizationId }, { organizationId: null, userId }] };
  }
  if (organizationId) return { organizationId };
  if (userId) return { organizationId: null, userId };
  return null;
}

function sameSeller(left, right) {
  return Boolean(left && right && String(left).trim() === String(right).trim());
}

module.exports = { sellerOwnerScope, sameSeller };
