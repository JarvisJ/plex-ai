#!/bin/bash
set -euo pipefail

LOG="/var/log/plex-setup.log"
exec > >(tee -a "$LOG") 2>&1

echo "=== Plex Setup Starting ==="

# Install Docker
dnf install -y docker git
systemctl enable docker
systemctl start docker

# Install Docker Compose and Buildx plugins
mkdir -p /usr/local/lib/docker/cli-plugins
ARCH=$(uname -m)
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$ARCH" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

BUILDX_ARCH=$ARCH
if [ "$BUILDX_ARCH" = "x86_64" ]; then BUILDX_ARCH="amd64"; fi
if [ "$BUILDX_ARCH" = "aarch64" ]; then BUILDX_ARCH="arm64"; fi
BUILDX_VERSION=$(curl -s https://api.github.com/repos/docker/buildx/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
curl -SL "https://github.com/docker/buildx/releases/download/$BUILDX_VERSION/buildx-$BUILDX_VERSION.linux-$BUILDX_ARCH" \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx

# Install AWS CLI (for SSM parameter fetching)
dnf install -y awscli

# Create app directory
mkdir -p /opt/plex
cd /opt/plex

# Clone repository
git clone --branch ${github_branch} ${github_repo} repo
cd repo/deploy

# Fetch secrets from SSM Parameter Store and write .env
AWS_REGION="${aws_region}"

get_param() {
  aws ssm get-parameter \
    --region "$AWS_REGION" \
    --name "/plex/$1" \
    --with-decryption \
    --query "Parameter.Value" \
    --output text
}

cat > .env <<EOF
OPENAI_API_KEY=$(get_param OPENAI_API_KEY)
TAVILY_API_KEY=$(get_param TAVILY_API_KEY)
SESSION_SECRET_KEY=$(get_param SESSION_SECRET_KEY)
PLEX_CLIENT_IDENTIFIER=$(get_param PLEX_CLIENT_IDENTIFIER)
REDIS_URL=redis://redis:6379/0
FRONTEND_URL=https://PLACEHOLDER_WILL_UPDATE
EOF

chmod 600 .env

# Build and start containers
docker compose -f docker-compose.prod.yaml up -d --build

echo "=== Plex Setup Complete ==="
