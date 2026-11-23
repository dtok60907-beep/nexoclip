export const PUBLISH_MEDIA_PAGE_SIZE=24;

export async function listTikTokPublishMedia(pool,{workspaceId,userId,mediaType='video',offset=0}) {
  if(!['video','photo'].includes(mediaType)||!Number.isInteger(offset)||offset<0||offset>10000)throw Object.assign(new Error('Invalid media page'),{status:400});
  const result=mediaType==='video'
    ?await pool.query(`SELECT DISTINCT ON(g.created_at,g.id) g.id,a.filename,a.id AS asset_id,g.created_at FROM generation_jobs g
      JOIN generation_outputs o ON o.workspace_id=g.workspace_id AND o.generation_job_id=g.id
      JOIN assets a ON a.workspace_id=o.workspace_id AND a.id=o.asset_id
      WHERE g.workspace_id=$1 AND g.created_by_user_id=$2 AND g.kind='video' AND g.status='succeeded'
        AND a.content_type IN ('video/mp4','video/quicktime') AND a.size_bytes<=262144000
      ORDER BY g.created_at DESC,g.id DESC,o.output_index LIMIT 25 OFFSET $3`,[workspaceId,userId,offset])
    :await pool.query(`SELECT id,filename,created_at,EXISTS(SELECT 1 FROM generation_outputs o WHERE o.workspace_id=assets.workspace_id AND o.asset_id=assets.id) AS generated
      FROM assets WHERE workspace_id=$1 AND content_type IN ('image/png','image/jpeg','image/webp') AND size_bytes<=20971520
      ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET $2`,[workspaceId,offset]);
  const url=id=>`/api/assets/${encodeURIComponent(id)}/download?workspace_id=${encodeURIComponent(workspaceId)}`;
  const rows=result.rows.slice(0,PUBLISH_MEDIA_PAGE_SIZE).map(item=>({...item,url:url(item.asset_id||item.id),...(mediaType==='photo'?{thumbnailUrl:`${url(item.id)}&variant=thumb`}:{})}));
  return {videos:mediaType==='video'?rows:[],photos:mediaType==='photo'?rows:[],mediaType,nextOffset:result.rows.length>PUBLISH_MEDIA_PAGE_SIZE?offset+PUBLISH_MEDIA_PAGE_SIZE:null};
}
