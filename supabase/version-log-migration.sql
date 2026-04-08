-- Add max_ltv column to banks table
ALTER TABLE banks ADD COLUMN IF NOT EXISTS max_ltv numeric DEFAULT 80;

-- Create version_log table
CREATE TABLE IF NOT EXISTS version_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL DEFAULT 'update',
  changed_by uuid REFERENCES auth.users(id),
  details jsonb,
  changed_at timestamptz DEFAULT now()
);

ALTER TABLE version_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_version_log" ON version_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin_insert_version_log" ON version_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
