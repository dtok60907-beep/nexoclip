import { createHash } from 'node:crypto';
import { getPool } from '../db/pool.js';
import * as repository from '../repositories/socialRepository.js';
import { createAssetDownload } from './assetService.js';
import { requireCanSpend } from './tenantContext.js';
import { createPostizAdapter, decryptApiKey, encryptApiKey, postizConfigured, socialError } from '../providers/postiz/adapter.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireSocialWrite(tenant) {
  requireCanSpend(tenant);
  if (!['owner', 'admin'].includes(tenant.workspace.role)) {
    throw socialError('Only workspace owners and admins can connect accounts or schedule posts.', 403, 'SOCIAL_ROLE_REQUIRED');
  }
}

export function validateSocialPost(input, now = Date.now()) {
  if (!UUID.test(input?.idempotencyKey || '')) throw socialError('A valid request ID is required.', 400);
  if (typeof input.channelId !== 'string' || !input.channelId || input.channelId.length > 100) throw socialError('Choose a connected account.', 400);
  if (typeof input.content !== 'string' || !input.content.trim() || input.content.length > 3000) throw socialError('Write a caption of 1–3,000 characters.', 400);
  if (!['draft', 'schedule'].includes(input.type)) throw socialError('Choose draft or schedule.', 400);
  if (input.assetId && (typeof input.assetId !== 'string' || !UUID.test(input.assetId))) throw socialError('Choose an asset from this workspace.', 400);
  const scheduledAt = input.type === 'schedule' && typeof input.date === 'string' ? Date.parse(input.date) : null;
  if (input.type === 'schedule' && (!Number.isFinite(scheduledAt) || scheduledAt < now + 60_000)) {
    throw socialError('Choose a publishing time at least one minute in the future.', 400);
  }
  if (scheduledAt > now + 90 * 86400_000) throw socialError('Schedule within the next 90 days.', 400);
  return { channelId: input.channelId, content: input.content.trim(), type: input.type,
    assetId: input.assetId || null, date: scheduledAt ? new Date(scheduledAt).toISOString() : null };
}

function safeChannel(channel) {
  return { id: channel.id, name: channel.name, identifier: channel.identifier, disabled: Boolean(channel.disabled) };
}

export function createSocialService({ db = () => getPool(), repo = repository, adapter = createPostizAdapter(),
  assetDownload = createAssetDownload, env = process.env, now = Date.now } = {}) {
  async function credential(workspaceId) {
    const row = await repo.findSocialWorkspace(db(), workspaceId);
    if (!row || row.status !== 'ready') throw socialError('Activate your social workspace first. Pending setup needs administrator review.', 409, 'SOCIAL_SETUP_REQUIRED');
    return decryptApiKey(row.encrypted_api_key, workspaceId, env);
  }
  return {
    async status(tenant) {
      const configured = postizConfigured(env);
      const permissions = { canManage: ['owner', 'admin'].includes(tenant.workspace.role) && !tenant.impersonation?.readOnly,
        linkedinEnabled: env.POSTIZ_LINKEDIN_ENABLED === 'true' };
      if (!configured) return { ...permissions, configured: false, status: 'unavailable', channels: [], posts: [] };
      const row = await repo.findSocialWorkspace(db(), tenant.workspace.id);
      if (row?.status !== 'ready') return { ...permissions, configured, status: row?.status || 'inactive', channels: [], posts: [] };
      const key = decryptApiKey(row.encrypted_api_key, tenant.workspace.id, env);
      const [channels, result] = await Promise.all([adapter.channels(key),
        adapter.posts(key, new Date(now() - 30 * 86400_000).toISOString(), new Date(now() + 90 * 86400_000).toISOString())]);
      if (!Array.isArray(channels) || !Array.isArray(result?.posts)) throw socialError('Invalid response from social service.');
      return { ...permissions, configured, status: 'ready',
        channels: channels.map(safeChannel), posts: result.posts.map(post => ({
          id: post.id, content: post.content, state: post.state, publishDate: post.publishDate,
          channelName: post.integration?.name, channel: post.integration?.providerIdentifier,
        })) };
    },
    async activate(tenant) {
      requireSocialWrite(tenant);
      if (!postizConfigured(env)) throw socialError('Social publishing is being set up.', 503);
      const id = tenant.workspace.id;
      const existing = await repo.findSocialWorkspace(db(), id);
      if (existing?.status === 'ready') return { status: 'ready' };
      if (!await repo.claimSocialWorkspace(db(), id)) throw socialError('Workspace setup is pending. Please refresh; do not create a second account.', 409, 'SOCIAL_SETUP_PENDING');
      try {
        const result = await adapter.provision(id);
        await repo.completeSocialWorkspace(db(), id, result.id, encryptApiKey(result.apiKey, id, env));
        return { status: 'ready' };
      } catch (error) {
        // Postiz create-user has no idempotency key; a lost response requires reconciliation.
        await repo.flagSocialWorkspace(db(), id);
        throw error;
      }
    },
    async connect(tenant, origin) {
      requireSocialWrite(tenant);
      if (env.POSTIZ_LINKEDIN_ENABLED !== 'true') throw socialError('LinkedIn is waiting for its OAuth app configuration.', 503);
      return { url: await adapter.connect(await credential(tenant.workspace.id), `${origin}/studio/social?connected=1`) };
    },
    async cancel(tenant, postId) {
      requireSocialWrite(tenant);
      if (typeof postId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(postId)) throw socialError('Invalid post ID.', 400);
      const key = await credential(tenant.workspace.id);
      const result = await adapter.posts(key, new Date(now() - 30 * 86400_000).toISOString(), new Date(now() + 90 * 86400_000).toISOString());
      const post = result?.posts?.find(item => item.id === postId);
      if (!post || !['DRAFT', 'QUEUE', 'ERROR'].includes(post.state)) throw socialError('Only your workspace’s drafts and queued or failed posts can be removed.', 409);
      await adapter.deletePost(key, postId);
      return { removed: true };
    },
    async submit(tenant, input) {
      requireSocialWrite(tenant);
      const post = validateSocialPost(input, now());
      const id = tenant.workspace.id;
      const key = await credential(id);
      const channels = await adapter.channels(key);
      const channel = Array.isArray(channels) && channels.find(item => item.id === post.channelId && !item.disabled);
      if (!channel) throw socialError('This connected account is not available in your workspace.', 403);
      if (channel.identifier !== 'linkedin') throw socialError('This composer currently supports LinkedIn profiles.', 400);
      let asset;
      if (post.assetId) {
        asset = await assetDownload(id, post.assetId);
        if (!asset || !/^(image|video)\//.test(asset.asset.content_type)) throw socialError('Image or video not found in this workspace.', 404);
        if (asset.asset.size_bytes > 100 * 1024 * 1024) throw socialError('Choose a file smaller than 100 MB.', 400);
        if (!/^https:\/\//.test(asset.download?.url || '')) throw socialError('This asset needs public HTTPS storage before it can be published.', 400);
      }
      const hash = createHash('sha256').update(JSON.stringify(post)).digest('hex');
      const { claimed, row } = await repo.claimSubmission(db(), id, input.idempotencyKey, hash);
      if (!claimed) {
        if (row.request_hash !== hash) throw socialError('This request ID was already used for a different post.', 409, 'SOCIAL_REQUEST_CONFLICT');
        if (row.status === 'accepted') return row.result;
        throw socialError('This submission is pending review. Refresh the post list before submitting again.', 409, 'SOCIAL_SUBMISSION_PENDING');
      }
      try {
        const image = [];
        if (asset) {
          const uploaded = await adapter.upload(key, asset.download.url);
          if (!uploaded?.id || !uploaded?.path) throw socialError('Social media upload could not be confirmed.');
          image.push({ id: uploaded.id, path: uploaded.path });
        }
        const result = await adapter.createPost(key, { type: post.type, date: post.date || new Date(now()).toISOString(),
          shortLink: false, tags: [], posts: [{ integration: { id: channel.id },
            value: [{ content: post.content, image }], settings: { __type: 'linkedin' } }] });
        if (!Array.isArray(result) || !result.length || result.some(item => !item?.postId)) throw socialError('Post submission could not be confirmed. Refresh your post list.');
        const safe = { posts: result.map(item => ({ id: item.postId })), type: post.type };
        await repo.finishSubmission(db(), id, input.idempotencyKey, safe);
        return safe;
      } catch (error) {
        await repo.finishSubmission(db(), id, input.idempotencyKey, null);
        throw error;
      }
    },
  };
}
