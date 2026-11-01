ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS bg TEXT;

UPDATE payment_methods SET icon = 'Wallet', color = 'text-emerald-600', bg = 'bg-emerald-100 dark:bg-emerald-900/30' WHERE method_id = 'cash';
UPDATE payment_methods SET icon = 'Building', color = 'text-blue-600', bg = 'bg-blue-100 dark:bg-blue-900/30' WHERE method_id = 'bankily';
UPDATE payment_methods SET icon = 'Building', color = 'text-orange-600', bg = 'bg-orange-100 dark:bg-orange-900/30' WHERE method_id = 'masrvi';
UPDATE payment_methods SET icon = 'Building', color = 'text-purple-600', bg = 'bg-purple-100 dark:bg-purple-900/30' WHERE method_id = 'sedad';
