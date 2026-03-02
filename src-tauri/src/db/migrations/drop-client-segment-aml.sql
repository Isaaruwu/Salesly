-- Migration 5: Drop segment and aml_status columns from clients table
DROP INDEX IF EXISTS idx_clients_segment;
ALTER TABLE clients DROP COLUMN segment;
ALTER TABLE clients DROP COLUMN aml_status;
