-- ticker_updates table for scrolling news ticker
CREATE TABLE IF NOT EXISTS ticker_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  category text DEFAULT 'policy',
  active boolean DEFAULT true,
  pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE ticker_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read" ON ticker_updates
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_write" ON ticker_updates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE ticker_updates;

-- Seed data
INSERT INTO ticker_updates (content, category, pinned) VALUES
  ('⚡ FAB: Max LTV reduced to 75% for Dubai and Abu Dhabi — 2026 war update', 'policy', false),
  ('⚡ HSBC: Max LTV reduced to 70% — 2026 war update', 'policy', false),
  ('⚡ RAK Bank: Max LTV reduced to 70% — 2026 war update', 'policy', false),
  ('⚡ Mashreq: Non-resident max LTV reduced to 50% — 2026 war update', 'policy', false),
  ('⚡ Mashreq: SE minimum LOB increased to 1 year — 2026 war update', 'policy', false),
  ('📈 3M EIBOR trending down — currently 3.81323% as of 07/04/2026', 'rate', false);
