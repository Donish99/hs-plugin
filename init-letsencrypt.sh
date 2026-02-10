#!/bin/bash
set -e

DOMAIN="level-test.uz"
EMAIL="${1:?Usage: ./init-letsencrypt.sh your@email.com}"
COMPOSE="docker compose --env-file .env.production"

echo "=== Obtaining SSL certificate for $DOMAIN ==="

# 1. Create dummy certificate so nginx can start
echo "Creating dummy certificate..."
$COMPOSE run --rm --entrypoint "" certbot sh -c "
  mkdir -p /etc/letsencrypt/live/$DOMAIN
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj '/CN=$DOMAIN'
"

# 2. Start nginx with dummy cert
echo "Starting nginx..."
$COMPOSE up -d frontend

# 3. Delete dummy certificate
echo "Removing dummy certificate..."
$COMPOSE run --rm --entrypoint "" certbot sh -c "
  rm -rf /etc/letsencrypt/live/$DOMAIN
  rm -rf /etc/letsencrypt/archive/$DOMAIN
  rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf
"

# 4. Request real certificate
echo "Requesting certificate from Let's Encrypt..."
$COMPOSE run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

# 5. Reload nginx with real cert
echo "Reloading nginx..."
$COMPOSE exec frontend nginx -s reload

echo ""
echo "=== Done! SSL certificate installed for $DOMAIN ==="
echo "App is available at https://$DOMAIN:4501"
