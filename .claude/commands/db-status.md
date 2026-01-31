# Database Status

Check database connection and current schema status.

## Instructions

1. Verify database connection using the postgres MCP
2. List existing tables
3. Check migration status
4. Report any schema issues

## Queries to Run

```sql
-- List all tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Check if key tables exist
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_name = 'hubspot_accounts'
);

-- Count records in main tables
SELECT
  (SELECT COUNT(*) FROM hubspot_accounts) as accounts,
  (SELECT COUNT(*) FROM campaigns) as campaigns,
  (SELECT COUNT(*) FROM outreach_records) as outreach;
```

## Usage

Run this command to check database health and schema status before implementing database-related features.
