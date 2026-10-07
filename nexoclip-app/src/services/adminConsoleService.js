import { adminConsoleRepository } from '../repositories/adminConsoleRepository.js';
import { isPlatformOperator, operatorError } from './economicsService.js';

export const consoleSections = ['overview', 'customers', 'transactions', 'credits', 'jobs'];
const invalid = message => Object.assign(new Error(message), { status: 400 });
function date(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function consoleFilters(input = {}, today = new Date()) {
  const to = input.to || today.toISOString().slice(0, 10);
  const from = input.from || new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  if (!date(from) || !date(to) || from > to) throw invalid('Periode tanggal tidak valid');
  const page = input.page === undefined ? 1 : Number(input.page);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw invalid('Halaman tidak valid');
  if (input.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)) throw invalid('ID tidak valid');
  if (input.status && !['pending', 'completed', 'canceled', 'failed', 'queued', 'running', 'processing', 'succeeded'].includes(input.status)) throw invalid('Status tidak valid');
  return { from, to, page, pageSize: 25, q: String(input.q || '').trim().slice(0, 120), status: input.status || '', id: input.id || '' };
}
export function createAdminConsoleService({ repository = adminConsoleRepository, env = process.env } = {}) {
  return { async read({ userId, workspaceId, section, input }) {
    if (!isPlatformOperator(userId, env)) throw operatorError();
    if (!consoleSections.includes(section)) throw invalid('Bagian admin tidak valid');
    if (!workspaceId) throw invalid('workspace_id is required');
    const filters = consoleFilters(input);
    const workspace = section === 'customers' ? await repository.workspace(workspaceId) : undefined;
    const data = section === 'overview' ? await repository.overview(workspaceId, filters) : await repository.list(workspaceId, section, filters);
    return { section, workspaceId, filters, ...(workspace ? { workspace } : {}), ... (section === 'overview' ? { summary: data } : data) };
  } };
}
export const adminConsoleService = createAdminConsoleService();
