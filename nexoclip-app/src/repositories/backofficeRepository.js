import { getEconomicsReport } from './economicsRepository.js';
export function createBackofficeRepository(pool) {
 const orderFields = 'id, workspace_id, customer_user_id, invoice_number, company_name, credits, bonus_credits, amount_idr, notes, status, payment_reference, payment_fee_idr, paid_at, created_at, credit_ledger_id, topup_id';
 const api = {
  async directory(q = '') {
   const search = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
   const [users, workspaces] = await Promise.all([
    pool.query(`SELECT u.id,u.email,u.display_name,u.created_at,
     COALESCE(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'role',m.role)) FILTER (WHERE w.id IS NOT NULL),'[]') AS workspaces
     FROM users u LEFT JOIN workspace_memberships m ON m.user_id=u.id LEFT JOIN workspaces w ON w.id=m.workspace_id
     WHERE (u.email || ' ' || COALESCE(u.display_name,'')) ILIKE $1
     GROUP BY u.id ORDER BY u.created_at DESC,u.id LIMIT 101`,[search]),
    pool.query('SELECT id,name FROM workspaces ORDER BY name,id LIMIT 1000'),
   ]);
   return { users:users.rows.slice(0,100), truncated:users.rows.length>100, workspaces:workspaces.rows };
  },
  async member(db,workspaceId,userId) {
   return (await db.query(`SELECT u.id,u.email,u.display_name,u.created_at,m.role,m.created_at AS joined_at FROM users u
    JOIN workspace_memberships m ON m.user_id=u.id WHERE m.workspace_id=$1 AND u.id=$2`,[workspaceId,userId])).rows[0] || null;
  },
  async profile(workspaceId,userId) {
   const account = await api.member(pool,workspaceId,userId);
   if (!account) return null;
   const until=new Date();until.setUTCHours(24,0,0,0);const since=new Date(until.getTime()-30*86400000);
   const [workspace,sessions,jobs,payments,ledger,lots,audit,orders,economics] = await Promise.all([
    pool.query(`SELECT w.id,w.name,COALESCE(a.balance,0)::text AS balance,
     COALESCE((SELECT sum(reserved_credits) FROM generation_credit_allocations WHERE workspace_id=w.id AND finalized_at IS NULL),0)::text AS reserved
     FROM workspaces w LEFT JOIN credit_accounts a ON a.workspace_id=w.id WHERE w.id=$1`,[workspaceId]),
    pool.query('SELECT action,created_at FROM account_session_events WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[userId]),
    pool.query('SELECT id,kind,model,status,estimated_cost,settlement_status,created_at,finished_at FROM generation_jobs WHERE workspace_id=$1 AND created_by_user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 50',[workspaceId,userId]),
    pool.query('SELECT id,order_id,user_id,amount_idr,credits,status,provider_key,is_sandbox,created_at,completed_at FROM credit_topups WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[workspaceId]),
    pool.query('SELECT id,reason,amount,balance_after,created_at FROM credit_ledger WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[workspaceId]),
    pool.query('SELECT source_type,granted_credits,available_credits,amount_idr,payment_fee_idr,created_at FROM credit_lots WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[workspaceId]),
    pool.query(`SELECT e.action,e.reason,e.entity_id,e.created_at,u.email AS actor_email,t.email AS target_email FROM admin_account_events e
     JOIN users u ON u.id=e.actor_user_id JOIN users t ON t.id=e.target_user_id WHERE e.workspace_id=$1 ORDER BY e.created_at DESC,e.id DESC LIMIT 50`,[workspaceId]),
    api.orders(workspaceId),
    getEconomicsReport(pool,{workspaceId,since:since.toISOString(),until:until.toISOString(),groupBy:'model',page:1,pageSize:1}),
   ]);
   return { account,workspace:workspace.rows[0],sessions:sessions.rows,jobs:jobs.rows,payments:payments.rows,ledger:ledger.rows,lots:lots.rows,audit:audit.rows,orders,economics:{totals:economics.totals,since:since.toISOString(),until:until.toISOString()} };
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
