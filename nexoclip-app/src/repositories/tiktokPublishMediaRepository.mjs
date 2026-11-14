export async function listTikTokPublishMedia(pool,{workspaceId,userId}) {
  const videos=await pool.query(`SELECT DISTINCT ON(g.created_at,g.id) g.id,g.prompt,a.filename,a.id AS asset_id,g.created_at FROM generation_jobs g
    JOIN generation_outputs o ON o.workspace_id=g.workspace_id AND o.generation_job_id=g.id
    JOIN assets a ON a.workspace_id=o.workspace_id AND a.id=o.asset_id
    WHERE g.workspace_id=$1 AND g.created_by_user_id=$2 AND g.kind='video' AND g.status='succeeded'
      AND a.content_type IN ('video/mp4','video/quicktime') AND a.size_bytes<=262144000 ORDER BY g.created_at DESC,g.id,o.output_index LIMIT 100`,[workspaceId,userId]);
  const photos=await pool.query(`SELECT id,filename,created_at,EXISTS(SELECT 1 FROM generation_outputs o WHERE o.workspace_id=assets.workspace_id AND o.asset_id=assets.id) AS generated FROM assets WHERE workspace_id=$1 AND content_type IN ('image/png','image/jpeg','image/webp') AND size_bytes<=20971520 ORDER BY created_at DESC LIMIT 100`,[workspaceId]);
  const url=id=>`/api/assets/${encodeURIComponent(id)}/download?workspace_id=${encodeURIComponent(workspaceId)}`;
  return {videos:videos.rows.map(v=>({...v,url:url(v.asset_id)})),photos:photos.rows.map(p=>({...p,url:url(p.id)}))};
}
