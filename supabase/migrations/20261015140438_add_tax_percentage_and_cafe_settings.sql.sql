ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_percentage numeric(5,2) NOT NULL DEFAULT 0;

INSERT INTO site_settings (key, value)
VALUES
  ('cafe_address', 'I-8 Markaz, Islamabad'),
  ('instagram_url', ''),
  ('tiktok_url', ''),
  ('facebook_url', '')
ON CONFLICT (key) DO NOTHING;
