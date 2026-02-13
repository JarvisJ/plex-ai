#!/bin/bash
set -euo pipefail

# Usage: ./deploy-frontend.sh <s3-bucket-name> <cloudfront-distribution-id>

S3_BUCKET="${1:?Usage: $0 <s3-bucket-name> <cloudfront-distribution-id>}"
CF_DISTRIBUTION_ID="${2:?Usage: $0 <s3-bucket-name> <cloudfront-distribution-id>}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../frontend"

echo "=== Building frontend ==="
cd "$FRONTEND_DIR"
npm ci
npm run build

echo "=== Syncing to S3 ==="
# Hashed assets get long cache headers
aws s3 sync dist/assets/ "s3://$S3_BUCKET/assets/" \
  --cache-control "public, max-age=31536000, immutable" \
  --delete

# index.html and other root files get no-cache
aws s3 sync dist/ "s3://$S3_BUCKET/" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --exclude "assets/*" \
  --delete

echo "=== Invalidating CloudFront cache ==="
aws cloudfront create-invalidation \
  --distribution-id "$CF_DISTRIBUTION_ID" \
  --paths "/index.html" "/" \
  --query "Invalidation.Id" \
  --output text

echo "=== Frontend deployment complete ==="
