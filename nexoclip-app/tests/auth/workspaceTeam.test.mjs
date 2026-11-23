import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {getPool,closePool} from '../../src/db/pool.js';
import {teamAction} from '../../src/services/workspaceTeam.js';
test('workspace invite, acceptance, role changes and removal', {skip:!process.env.WORKSPACE_TEAM_TEST_DB}, async()=>{
  const db=getPool(),workspaceId=randomUUID();
  const accounts=['owner','admin','member'].map(role=>({role,user_id:randomUUID(),email:randomUUID()+'@example.test'}));
  const [owner,admin,member]=accounts;
  const act=(who,body)=>teamAction(who,{workspaceId,...body});
  try{
    await db.query("insert into workspaces(id,name,slug) values($1,'Team test',$1::uuid::text)",[workspaceId]);
    for(const u of accounts){
      await db.query("insert into users(id,email,password_hash) values($1,$2,'test')",[u.user_id,u.email]);
      if(u!==member)await db.query('insert into workspace_memberships(workspace_id,user_id,role) values($1,$2,$3)',[workspaceId,u.user_id,u.role]);
    }
    await assert.rejects(act(admin,{action:'invite',email:member.email,role:'admin'}),{status:403});
    const {token}=await act(admin,{action:'invite',email:member.email,role:'member'});
    await assert.rejects(act(owner,{action:'accept',token}),{status:403});
    assert.equal((await act(member,{action:'accept',token})).id,workspaceId);
    await assert.rejects(act(member,{action:'accept',token}),{status:404});
    await assert.rejects(act(member,{action:'invite',email:admin.email,role:'member'}),{status:403});
    await act(owner,{action:'role',userId:member.user_id,role:'admin'});
    await assert.rejects(act(admin,{action:'remove',userId:member.user_id}),{status:403});
    await act(owner,{action:'remove',userId:member.user_id});
    assert.equal((await act(owner,{action:'list'})).members.length,2);
  } finally {
    await db.query('delete from workspaces where id=$1',[workspaceId]);
    await db.query('delete from users where id=any($1::uuid[])',[accounts.map(u=>u.user_id)]);
    await closePool();
  }
});
