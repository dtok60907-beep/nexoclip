ALTER TABLE generation_jobs ADD COLUMN environment TEXT NOT NULL DEFAULT 'unclassified'
  CHECK (environment IN ('development','production','unclassified'));
CREATE INDEX generation_jobs_environment_report_idx ON generation_jobs(workspace_id,environment,finished_at);
CREATE FUNCTION reject_generation_environment_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.environment IS DISTINCT FROM OLD.environment THEN
    RAISE EXCEPTION 'Generation environment is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER generation_jobs_environment_immutable BEFORE UPDATE ON generation_jobs
  FOR EACH ROW EXECUTE FUNCTION reject_generation_environment_change();
