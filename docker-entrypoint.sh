#!/bin/sh
set -e

echo "Running database migrations..."
node -e "
  const ds = require('./dist/config/database.config').default;
  ds.initialize()
    .then(d => d.runMigrations())
    .then(() => { console.log('Migrations completed successfully'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
"

echo "Starting application..."
exec node dist/main
