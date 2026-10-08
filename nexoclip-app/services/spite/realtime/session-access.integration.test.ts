import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { createSessionAccessCheck } from './session-access'
import { createAccountAccessRepository } from '../../../src/repositories/accountAccessRepository.js'
import { createAccountAccessService } from '../../../src/services/accountAccessService.js'

test('SaaS account mutations revoke realtime identity permanently while isolating other sessions', { skip: !process.env.NEXOCLIP_TEST_DATABASE_URL }, async () => {
  const schema = `rt_access_${randomUUID().replaceAll('-', '')}`
  const root = new Pool({ connectionString: process.env.NEXOCLIP_TEST_DATABASE_URL })
  await root.query(`CREATE SCHEMA ${schema}`)
  const pool = new Pool({ connectionString: process.env.NEXOCLIP_TEST_DATABASE_URL, options: `-c search_path=${schema},public` })
  try {
    for (const name of ['001_auth_sessions.sql', '048_account_access_management.sql']) {
      await pool.query(await readFile(new URL(`../../../src/db/migrations/${name}`, import.meta.url), 'utf8'))
    }
    const users = (await pool.query("INSERT INTO users(email,display_name,password_hash) VALUES ('operator@rt.test','Operator','fixture'),('target@rt.test','Target','fixture'),('other@rt.test','Other','fixture') RETURNING id")).rows
    const [operator, target, other] = users.map(row => String(row.id))
    const session = async (userId: string) => String((await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '1 hour') RETURNING id", [userId, randomUUID()])).rows[0].id)
    const targetSession = await session(target), otherSession = await session(other)
    const check = createSessionAccessCheck(pool)
    const options = { repository: createAccountAccessRepository(pool), env: { ...process.env, NEXOCLIP_OPERATOR_USER_IDS: operator } }
    const service = createAccountAccessService(options)
    const mutate = (action: string, version: string) => service.mutate({ userId: operator, input: { targetUserId: target, action, expectedVersion: version, requestKey: randomUUID(), reason: 'Synthetic realtime access lifecycle' } })
    const identity = { userId: target, sessionId: targetSession }
    assert.equal(await check(identity), true)
    assert.equal(await check({ ...identity, userId: other }), false, 'session cannot impersonate another owner')
    await mutate('suspend', '0')
    assert.equal(await check(identity), false)
    assert.equal(await check({ userId: other, sessionId: otherSession }), true)
    await mutate('activate', '1')
    assert.equal(await check(identity), false, 'activation must not revive issued tokens')
    const fresh = { userId: target, sessionId: await session(target) }
    assert.equal(await check(fresh), true)
    await mutate('revoke_sessions', '2')
    assert.equal(await check(fresh), false)
    const expired = { userId: other, sessionId: await session(other) }
    await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1", [expired.sessionId])
    assert.equal(await check(expired), false)
    await pool.query('UPDATE users SET suspended_at=now() WHERE id=$1', [other])
    assert.equal(await check({ userId: other, sessionId: otherSession }), false, 'suspend flag alone must deny access')
  } finally {
    await pool.end()
    await root.query(`DROP SCHEMA ${schema} CASCADE`)
    await root.end()
  }
})
