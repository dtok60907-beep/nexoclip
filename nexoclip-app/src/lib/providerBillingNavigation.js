const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function providerBillingJobPath(workspaceId, jobId) {
  if (!uuid(workspaceId) || !uuid(jobId)) return null;
  return `/admin/provider-billing?${new URLSearchParams({workspaceId,jobId})}`;
}
