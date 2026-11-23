import { createHash, randomBytes } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { WorkspaceError } from './workspaceService.js';

const digest = token => createHash('sha256').update(String(token || '')).digest();
const denied = () => new WorkspaceError('Kamu tidak punya izin untuk tindakan ini.', 403);
export async function invitation(db, token) {
  const row = (await db.query(`SELECT w.name,i.email,i.role,i.workspace_id AS id FROM workspace_invitations i
    JOIN workspaces w ON w.id=i.workspace_id JOIN workspace_memberships m ON m.workspace_id=w.id AND m.user_id=i.inviter
    WHERE token_hash=$1 AND expires_at>now() AND (m.role='owner' OR (m.role='admin' AND i.role='member'))`, [digest(token)])).rows[0];
  if (!row) throw new WorkspaceError('Undangan sudah digunakan, kedaluwarsa, atau tidak berlaku.', 404);
  return row;
}
// Caller owns the transaction so registration, membership and token consumption commit together.
export async function acceptInvitation(db, token, user) {
  const target = await invitation(db, token);
  if (target.email !== user.email.toLowerCase()) throw new WorkspaceError('Gunakan akun dengan email tujuan undangan.', 403);
  const used = await db.query('DELETE FROM workspace_invitations WHERE token_hash=$1 AND expires_at>now() RETURNING workspace_id',[digest(token)]);
  if (!used.rowCount) throw new WorkspaceError('Undangan sudah digunakan.',409);
  await db.query('INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(workspace_id,user_id) DO NOTHING',[target.id,user.id,target.role]);
  await db.query('UPDATE users SET current_workspace_id=$1 WHERE id=$2',[target.id,user.id]);
  return {id:target.id,name:target.name};
}
export async function teamAction(session, body) {
  const db=await getPool().connect();
  try {
    await db.query('BEGIN');
    let result;
    if (body.action==='accept') result=await acceptInvitation(db,body.token,{id:session.user_id,email:session.email});
    else {
      const workspace=body.workspaceId;
      const actor=(await db.query('SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE',[workspace,session.user_id])).rows[0];
      if (!actor || !['owner','admin'].includes(actor.role)) throw denied();
      if (body.action==='list') result={members:(await db.query('SELECT u.id,u.email,m.role FROM workspace_memberships m JOIN users u ON u.id=m.user_id WHERE workspace_id=$1 ORDER BY u.email',[workspace])).rows};
      else if (body.action==='invite') {
        if (!['admin','member'].includes(body.role) || (body.role==='admin' && actor.role!=='owner')) throw denied();
        const email=String(body.email||'').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254) throw new WorkspaceError('Email tidak valid.');
        const token=randomBytes(32).toString('hex');
        await db.query(`INSERT INTO workspace_invitations(token_hash,workspace_id,email,role,inviter,expires_at)
          VALUES($1,$2,$3,$4,$5,now()+interval '7 days') ON CONFLICT(workspace_id,email) DO UPDATE
          SET token_hash=excluded.token_hash,role=excluded.role,inviter=excluded.inviter,expires_at=excluded.expires_at`,[digest(token),workspace,email,body.role,session.user_id]);
        result={token};
      } else {
        const args=[workspace,body.userId,actor.role];
        const scope="workspace_id=$1 AND user_id=$2 AND role<>'owner' AND ($3='owner' OR role='member')";
        let changed;
        if(body.action==='remove') changed=await db.query('DELETE FROM workspace_memberships WHERE '+scope,args);
        else if(body.action==='role' && actor.role==='owner' && ['admin','member'].includes(body.role)) changed=await db.query('UPDATE workspace_memberships SET role=$4 WHERE '+scope,[...args,body.role]);
        if(!changed?.rowCount) throw denied();
        result={ok:true};
      }
    }
    await db.query('COMMIT'); return result;
  } catch(e){await db.query('ROLLBACK');throw e;} finally{db.release();}
}
