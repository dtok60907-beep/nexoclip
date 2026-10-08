const accountFields='u.id,u.email,u.display_name,u.suspended_at,u.access_version::text';
export function createAccountAccessRepository(pool) {
 return {
  async transaction(fn) {const db=await pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}},
  async account(id,db=pool,lock=false) {return (await db.query(`SELECT ${accountFields},
    (SELECT count(*)::integer FROM sessions s WHERE s.user_id=u.id AND s.revoked_at IS NULL AND s.expires_at>now()) AS active_sessions
    FROM users u WHERE u.id=$1 ${lock?'FOR NO KEY UPDATE OF u':''}`,[id])).rows[0] || null;},
  async history(id) {return (await pool.query(`SELECT e.id::text,e.action,e.reason,e.previous_version::text,e.new_version::text,e.revoked_sessions,e.suspended_at,e.created_at,u.email AS actor_email
    FROM account_access_events e JOIN users u ON u.id=e.actor_user_id WHERE e.target_user_id=$1 ORDER BY e.id DESC LIMIT 50`,[id])).rows;},
  async replay(db,actor,key) {return (await db.query('SELECT *,id::text,previous_version::text,new_version::text FROM account_access_events WHERE actor_user_id=$1 AND request_key=$2',[actor,key])).rows[0] || null;},
  async revokeSessions(db,id) {return (await db.query('UPDATE sessions SET revoked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL RETURNING id',[id])).rowCount;},
  async update(db,id,action) {return (await db.query(`UPDATE users SET suspended_at=CASE $2 WHEN 'suspend' THEN clock_timestamp() WHEN 'activate' THEN NULL ELSE suspended_at END,
    access_version=access_version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING id,suspended_at,access_version::text`,[id,action])).rows[0];},
  async audit(db,{targetUserId,userId,requestKey,action,reason,previousVersion,account,revokedSessions}) {return (await db.query(`INSERT INTO account_access_events(target_user_id,actor_user_id,request_key,action,reason,previous_version,new_version,suspended_at,revoked_sessions)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text,action,previous_version::text,new_version::text,suspended_at,revoked_sessions`,[targetUserId,userId,requestKey,action,reason,previousVersion,account.access_version,account.suspended_at,revokedSessions])).rows[0];},
 };
}
