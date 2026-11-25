export function getAccountScopeHeaders(explicitConfigId) {
  let profile;
  try {
    profile = JSON.parse(localStorage.getItem("profile"));
  } catch {
    // Older sessions can still have a separately stored configuration ID.
  }

  const configId = explicitConfigId || profile?.config?.configId || profile?.configId || localStorage.getItem("configId");
  const organizationId = localStorage.getItem("organizationId");
  return {
    ...(configId ? { "x-config-id": configId } : {}),
    ...(organizationId && organizationId !== "null" && organizationId !== "undefined"
      ? { "x-organization-id": organizationId }
      : {}),
  };
}
