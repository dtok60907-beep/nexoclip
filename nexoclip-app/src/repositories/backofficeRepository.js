import { accountHistoryFilters } from '../lib/accountHistoryFilters.js';
import { accountDirectoryFilters } from '../lib/accountDirectoryFilters.js';
import { getEconomicsReport } from './economicsRepository.js';
export function createBackofficeRepository(pool) {
 const orderFields = 'id, workspace_id, customer_user_id, invoice_number, company_name, credits, bonus_credits, amount_idr, notes, status, payment_reference, payment_fee_idr, paid_at, created_at, credit_ledger_id, topup_id';
 const api = {
  async directory(input = {}) {
   const {q,status,page,pageSize}=accountDirectoryFilters(input);
   const search = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
   const [result, workspaces] = await Promise.all([
    pool.query(`WITH filtered AS (
      SELECT u.id,u.email,u.display_name,u.created_at,u.suspended_at FROM users u
      WHERE (u.email || ' ' || COALESCE(u.display_name,'')) ILIKE $1
        AND ($2='all' OR ($2='active' AND u.suspended_at IS NULL) OR ($2='suspended' AND u.suspended_at IS NOT NULL))
     ), selected AS (
      SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT $3 OFFSET $4
     ), accounts AS (
      SELECT u.*, COALESCE(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'role',m.role) ORDER BY w.name,w.id)
       FILTER (WHERE w.id IS NOT NULL),'[]'::jsonb) AS workspaces
      FROM selected u LEFT JOIN workspace_memberships m ON m.user_id=u.id LEFT JOIN workspaces w ON w.id=m.workspace_id
      GROUP BY u.id,u.email,u.display_name,u.created_at,u.suspended_at
     ) SELECT (SELECT count(*)::int FROM filtered) AS total,
       COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC,a.id) FROM accounts a),'[]'::jsonb) AS users`,
     [search,status,pageSize,(page-1)*pageSize]),
    pool.query('SELECT id,name FROM workspaces ORDER BY name,id LIMIT 1000'),
   ]);
   const {users,total}=result.rows[0];
   return {users,workspaces:workspaces.rows,truncated:total>users.length,
    pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))},filters:{q,status}};
  },
  async member(db,workspaceId,userId) {
   return (await db.query(`SELECT u.id,u.email,u.display_name,u.created_at,m.role,m.created_at AS joined_at FROM users u
    JOIN workspace_memberships m ON m.user_id=u.id WHERE m.workspace_id=$1 AND u.id=$2`,[workspaceId,userId])).rows[0] || null;
  },
  async history(workspaceId,userId,input,{exportAll=false}={}) {
   const {history,page,pageSize,from,to,since,until,category}=accountHistoryFilters(input);
   const sources={
    sessions:{table:'account_session_events',fields:'id,action,created_at',scope:'user_id=$2',filter:"($7::text='all' OR action=$7)"},
    payments:{table:'credit_topups',fields:'id,order_id,user_id,amount_idr::text,credits::text,status,provider_key,is_sandbox,created_at,completed_at',scope:'workspace_id=$1',filter:"($7::text='all' OR status=$7)"},
    ledger:{table:'credit_ledger',fields:'id,reason,amount::text,balance_after::text,created_at',scope:'workspace_id=$1',filter:'reason ILIKE $7'},
   };
   const source=sources[history];
   const result=await pool.query(`WITH eligible AS (
     SELECT 1 FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2
    ), filtered AS (
     SELECT ${source.fields} FROM ${source.table} WHERE ${source.scope} AND EXISTS(SELECT 1 FROM eligible)
      AND ($5::timestamptz IS NULL OR created_at >= $5::timestamptz)
      AND ($6::timestamptz IS NULL OR created_at < $6::timestamptz)
      AND ${source.filter}
    ), selected AS (
     SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4
    ) SELECT EXISTS(SELECT 1 FROM eligible) AS authorized,(SELECT count(*)::int FROM filtered) AS total,
     COALESCE((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('id',r.id::text) ORDER BY r.created_at DESC,r.id DESC) FROM selected r),'[]'::jsonb) AS rows`,
    [workspaceId,userId,exportAll?5001:pageSize,exportAll?0:(page-1)*pageSize,since,until,history==='ledger'?`%${category.replace(/[\\%_]/g, '\\$&')}%`:category]);
   const {authorized,total,rows}=result.rows[0];if(!authorized)return null;
   return {history,workspaceId,customerId:userId,scope:history==='sessions'?'account':'workspace',rows,filters:{category},period:{from,to,since,until,basis:'created_at',timeZone:'UTC'},
    pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))}};
  },
  async profile(workspaceId,userId) {
   const account = await api.member(pool,workspaceId,userId);
   if (!account) return null;
   const until=new Date();until.setUTCHours(24,0,0,0);const since=new Date(until.getTime()-30*86400000);
   const [workspace,sessions,jobs,payments,ledger,lots,audit,orders,economics] = await Promise.all([
    pool.query(`SELECT w.id,w.name,COALESCE(a.balance,0)::text AS balance,
     COALESCE((SELECT sum(reserved_credits) FROM generation_credit_allocations WHERE workspace_id=w.id AND finalized_at IS NULL),0)::text AS reserved
     FROM workspaces w LEFT JOIN credit_accounts a ON a.workspace_id=w.id WHERE w.id=$1`,[workspaceId]),
    api.history(workspaceId,userId,{history:'sessions'}),
    pool.query('SELECT id,kind,model,status,estimated_cost,settlement_status,created_at,finished_at FROM generation_jobs WHERE workspace_id=$1 AND created_by_user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 50',[workspaceId,userId]),
    api.history(workspaceId,userId,{history:'payments'}),
    api.history(workspaceId,userId,{history:'ledger'}),
    pool.query('SELECT source_type,granted_credits,available_credits,amount_idr,payment_fee_idr,created_at FROM credit_lots WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[workspaceId]),
    pool.query(`SELECT e.action,e.reason,e.entity_id,e.created_at,u.email AS actor_email,t.email AS target_email FROM admin_account_events e
     JOIN users u ON u.id=e.actor_user_id JOIN users t ON t.id=e.target_user_id WHERE e.workspace_id=$1 ORDER BY e.created_at DESC,e.id DESC LIMIT 50`,[workspaceId]),
    api.orders(workspaceId),
    getEconomicsReport(pool,{workspaceId,since:since.toISOString(),until:until.toISOString(),groupBy:'model',page:1,pageSize:1}),
   ]);
   if(!sessions||!payments||!ledger)return null;
   return { historyPagination:{sessions:sessions.pagination,payments:payments.pagination,ledger:ledger.pagination},account,workspace:workspace.rows[0],sessions:sessions.rows,jobs:jobs.rows,payments:payments.rows,ledger:ledger.rows,lots:lots.rows,audit:audit.rows,orders,economics:{totals:economics.totals,since:since.toISOString(),until:until.toISOString()} };
  },
  async orders(workspaceId) { return (await pool.query(`SELECT ${orderFields} FROM business_credit_orders WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[workspaceId])).rows; },
  async transaction(fn) { const db=await pool.connect();try { await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result; } catch(e) { await db.query('ROLLBACK');throw e; } finally { db.release(); } },
  async lockWorkspace(db,id) { return (await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[id])).rows[0]; },
  async findOrder(db,workspaceId,id) { return (await db.query('SELECT * FROM business_credit_orders WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[workspaceId,id])).rows[0]; },
  async createOrder(db,v) {
   return (await db.query(`INSERT INTO business_credit_orders (workspace_id,customer_user_id,created_by_user_id,invoice_number,request_key,company_name,credits,bonus_credits,amount_idr,notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (workspace_id,request_key) DO NOTHING RETURNING *`,[v.workspaceId,v.customerId,v.userId,v.invoice,v.requestKey,v.company,v.credits,v.bonus,v.amount,v.notes])).rows[0] || (await db.query('SELECT * FROM business_credit_orders WHERE workspace_id=$1 AND request_key=$2',[v.workspaceId,v.requestKey])).rows[0];
  },
  async recordPayment(db,order,userId,reference,paidAt,fee,entry) {
   const topup=(await db.query(`INSERT INTO credit_topups (workspace_id,user_id,package_code,amount_idr,credits,provider_key,order_id,provider_txn_id,status,credit_ledger_id,completed_at)
    VALUES ($1,$2,'business_custom',$3,$4,'manual_business',$5,$6,'completed',$7,$8) RETURNING id`,[order.workspace_id,order.customer_user_id,order.amount_idr,Number(order.credits)+Number(order.bonus_credits),order.invoice_number,`${order.workspace_id}:${reference}`,entry.id,paidAt])).rows[0];
   return (await db.query(`UPDATE business_credit_orders SET status='completed',payment_reference=$3,paid_at=$4,payment_fee_idr=$5,settled_by_user_id=$6,credit_ledger_id=$7,topup_id=$8 WHERE workspace_id=$1 AND id=$2 RETURNING *`,[order.workspace_id,order.id,reference,paidAt,fee,userId,entry.id,topup.id])).rows[0];
  },
  async cancel(db,workspaceId,id) { return (await db.query("UPDATE business_credit_orders SET status='canceled' WHERE workspace_id=$1 AND id=$2 RETURNING *",[workspaceId,id])).rows[0]; },
  async audit(db,v) { await db.query('INSERT INTO admin_account_events(workspace_id,actor_user_id,target_user_id,action,reason,entity_id) VALUES($1,$2,$3,$4,$5,$6)',[v.workspaceId,v.userId,v.customerId,v.action,v.reason,v.entityId]); },
  async existingGrant(db,workspaceId,key) {return (await db.query('SELECT id,amount,reason,metadata FROM credit_ledger WHERE workspace_id=$1 AND idempotency_key=$2',[workspaceId,key])).rows[0];},
 };
 return api;
}
