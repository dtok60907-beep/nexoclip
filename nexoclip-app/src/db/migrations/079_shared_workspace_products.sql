-- Products belong to the workspace even when their original creator leaves.
ALTER TABLE workspace_products ALTER COLUMN owner_id DROP NOT NULL,
  DROP CONSTRAINT workspace_products_owner_id_fkey,
  ADD FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- Import explicitly saved Brand Kit entries into the shared catalog once.
WITH entries AS (
  SELECT workspace_id, updated_by, trim(line) AS line,
    CASE WHEN line LIKE '% — %' THEN ' — ' WHEN line LIKE '% - %' THEN ' - '
         WHEN line LIKE '%: %' THEN ': ' END AS separator
  FROM workspace_brand_kits CROSS JOIN LATERAL jsonb_array_elements_text(data->'products') AS line
), named AS (
  SELECT workspace_id, updated_by, left(trim(coalesce(split_part(line, separator, 1), line)),160) AS name,
    coalesce(substr(line, strpos(line, separator) + length(separator)), '') AS description FROM entries
)
INSERT INTO workspace_products(workspace_id,owner_id,name,data)
SELECT DISTINCT ON (workspace_id, lower(name)) workspace_id,updated_by,name,jsonb_build_object('advantages',description)
FROM named n WHERE name <> '' AND NOT EXISTS (
  SELECT 1 FROM workspace_products p WHERE p.workspace_id=n.workspace_id AND lower(p.name)=lower(n.name)
) ORDER BY workspace_id,lower(name),length(description) DESC;
