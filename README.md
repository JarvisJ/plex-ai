# Plex Media Browser

A full-stack application for browsing and discovering content in your Plex media library. Features an AI-powered assistant that can search your library, make personalized recommendations, and answer questions about movies and TV shows.

## Features

- **Library Browsing**: View all movies and TV shows in your Plex library with a responsive grid layout
- **Search & Filters**: Client-side search and multiselect filters for genres, years, and content ratings
- **AI Assistant**: Chat with an AI that understands your library and can make recommendations
- **Watchlist Management**: Add and remove items from your Plex watchlist
- **Performance Optimized**: Virtualized grids, lazy-loaded thumbnails, and Redis caching

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    React Frontend                          │  │
│  │  • Vite dev server (port 5173)                            │  │
│  │  • TypeScript + React 19                                   │  │
│  │  • TanStack Query for data fetching                       │  │
│  │  • Virtualized grid with @tanstack/react-virtual          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ /api/* (proxied)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  • Uvicorn server (port 8000)                             │  │
│  │  • Pydantic v2 for validation                             │  │
│  │  • LangChain + OpenAI for AI agent                        │  │
│  │  • Redis for caching                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │  Plex    │   │  Redis   │   │  OpenAI  │
        │  Server  │   │  Cache   │   │   API    │
        └──────────┘   └──────────┘   └──────────┘
```

## Project Structure

```
plex/
├── frontend/          # React + TypeScript application (Vite)
├── backend/           # FastAPI Python application
├── deploy/            # Production Docker Compose, nginx, deploy scripts
│   ├── docker-compose.prod.yaml
│   ├── nginx/nginx.conf
│   └── deploy-frontend.sh
├── infra/             # Terraform AWS infrastructure
│   ├── main.tf, variables.tf, outputs.tf
│   ├── s3.tf, cloudfront.tf, ec2.tf
│   ├── iam.tf, ssm.tf
│   └── user-data.sh
└── CLAUDE.md          # AI assistant context file
```

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.11+
- Redis server
- Plex account with at least one server

### 1. Start Redis

```bash
redis-server
```

### 2. Start the Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your API keys

source .venv/bin/activate
uvicorn app.main:app --reload
```

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Open the App

Navigate to http://localhost:5173 and log in with your Plex account.

## Production Deployment (AWS)

The app deploys to AWS with the following architecture:

```
Browser -> CloudFront (HTTPS)
             |-- /* -> S3 (frontend static files)
             |-- /api/* -> EC2 (Elastic IP)
                             |-- nginx (port 80, reverse proxy)
                             |-- FastAPI (port 8000, internal)
                             |-- Redis (port 6379, internal)
```

### Prerequisites

- AWS CLI configured with credentials
- Terraform >= 1.5
- An EC2 key pair in your target region

### 1. Configure Secrets

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your API keys, key pair name, and GitHub repo URL
```

### 2. Deploy Infrastructure

```bash
terraform init
terraform apply
```

This creates: S3 bucket, CloudFront distribution, EC2 instance (with Docker Compose), Elastic IP, IAM roles, and SSM parameters for secrets. The EC2 user-data script automatically installs Docker, clones the repo, fetches secrets from SSM, and starts the containers.

### 3. Wait for EC2 Bootstrap (~3-5 min)

```bash
ssh ec2-user@$(terraform output -raw ec2_public_ip) "sudo cloud-init status --wait"
```

### 4. Update FRONTEND_URL

The CloudFront URL isn't known until after `terraform apply`, so update it on the instance:

```bash
CF_URL=$(terraform output -raw cloudfront_url)
ssh ec2-user@$(terraform output -raw ec2_public_ip) \
  "sudo sed -i 's|FRONTEND_URL=.*|FRONTEND_URL=https://${CF_URL}|' /opt/plex/repo/deploy/.env && \
   cd /opt/plex/repo/deploy && sudo docker compose -f docker-compose.prod.yaml restart api"
```

### 5. Deploy Frontend

```bash
./deploy/deploy-frontend.sh $(terraform output -raw s3_bucket_name) $(terraform output -raw cloudfront_distribution_id)
```

### 6. Verify

```bash
# Health check via EC2 directly
curl http://$(terraform output -raw ec2_public_ip)/api/health

# Health check via CloudFront
curl https://$(terraform output -raw cloudfront_url)/api/health

# Open in browser
open https://$(terraform output -raw cloudfront_url)
```

### Redeploying

**Backend changes:** SSH into EC2, `cd /opt/plex/repo && git pull && cd deploy && sudo docker compose -f docker-compose.prod.yaml up -d --build`

**Frontend changes:** Run `./deploy/deploy-frontend.sh <bucket> <distribution-id>` from your local machine.

## Environment Variables

### Backend

| Variable                 | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `OPENAI_API_KEY`         | OpenAI API key for AI assistant                          |
| `TAVILY_API_KEY`         | Tavily API key for web search                            |
| `REDIS_URL`              | Redis connection URL (default: `redis://localhost:6379`) |
| `SESSION_SECRET_KEY`     | Secret key for JWT signing                               |
| `PLEX_CLIENT_IDENTIFIER` | Plex client identifier                                   |
| `FRONTEND_URL`           | Frontend URL for CORS (default: `http://localhost:5173`) |

## License

Private project - not for distribution.
