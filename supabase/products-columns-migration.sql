-- Add missing columns to products table for full product management
-- Run this in Supabase SQL Editor

-- New columns for product management
ALTER TABLE products ADD COLUMN IF NOT EXISTS salary_transfer boolean DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS residency text DEFAULT 'resident_expat';
ALTER TABLE products ADD COLUMN IF NOT EXISTS eibor_benchmark text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stress_rate numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS partial_settlement text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS key_points text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE products ADD COLUMN IF NOT EXISTS validity_end date;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE products ADD COLUMN IF NOT EXISTS fixed_period text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS processing_fee numeric;

-- Migrate existing active boolean to status text
UPDATE products SET status = CASE WHEN active = true THEN 'active' ELSE 'retired' END WHERE status IS NULL;
