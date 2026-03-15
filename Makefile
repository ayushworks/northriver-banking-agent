# =============================================================================
# Nova Banking Agent — Developer Makefile
#
# Usage:  make <target>
#         make help          list all targets
#         make dev           start backend locally
#         make deploy        deploy to Cloud Run
#         make deploy SEED=1 deploy + seed Firestore
# =============================================================================

.DEFAULT_GOAL := help

# ---------------------------------------------------------------------------
# Config (override via env vars or make flags)
# ---------------------------------------------------------------------------

SERVICE_NAME  ?= nova-banking-agent
REGION        ?= europe-west4
PROJECT       ?= $(GOOGLE_CLOUD_PROJECT)
PORT          ?= 8080
SEED          ?= 0   # set to 1 to seed Firestore after deploy

# ---------------------------------------------------------------------------
# Targets
# ---------------------------------------------------------------------------

.PHONY: help dev dev-frontend seed build \
        docker-build docker-run \
        deploy trigger-setup \
        logs url describe \
        clean

help: ## Show all available targets
	@echo ""
	@echo "  Nova Banking Agent — available make targets"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ---------------------------------------------------------------------------
# Local development
# ---------------------------------------------------------------------------

dev: ## Start FastAPI backend with hot-reload (port $(PORT))
	uvicorn main:app --reload --port $(PORT)

dev-frontend: ## Start Vite dev server (proxies API to :$(PORT))
	cd frontend && npm run dev

dev-all: ## Start backend + frontend concurrently (requires 'concurrently')
	npx concurrently \
	  "uvicorn main:app --reload --port $(PORT)" \
	  "cd frontend && npm run dev"

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

build: ## Build the React frontend (output: frontend/dist/)
	cd frontend && npm install && npm run build
	@echo "Frontend built → frontend/dist/"

install: ## Install all dependencies (Python + Node)
	pip install -r requirements.txt
	cd frontend && npm install

# ---------------------------------------------------------------------------
# Firestore
# ---------------------------------------------------------------------------

seed: ## Seed Firestore with demo accounts, contacts and transactions
	python seed_data.py

seed-qr: ## (Re)generate the demo Vattenfall QR bill image
	python seed_data.py qr

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------

docker-build: ## Build the Docker image locally (tag: $(SERVICE_NAME):local)
	docker build -t $(SERVICE_NAME):local .
	@echo "Image built: $(SERVICE_NAME):local"

docker-run: docker-build ## Build + run the container locally (port $(PORT))
	docker run --rm -p $(PORT):$(PORT) \
	  --env-file .env \
	  --name $(SERVICE_NAME) \
	  $(SERVICE_NAME):local

docker-stop: ## Stop the locally running container
	docker stop $(SERVICE_NAME) 2>/dev/null || true

# ---------------------------------------------------------------------------
# Cloud Run deployment
# ---------------------------------------------------------------------------

deploy: ## Deploy to Cloud Run via ./deploy.sh
	@if [ "$(SEED)" = "1" ]; then \
	  ./deploy.sh --seed; \
	else \
	  ./deploy.sh; \
	fi

deploy-seed: ## Deploy to Cloud Run and seed Firestore afterwards
	./deploy.sh --seed

# ---------------------------------------------------------------------------
# Cloud Build trigger (one-time setup)
# ---------------------------------------------------------------------------

trigger-setup: ## Register a Cloud Build trigger for push-to-main CI/CD
	@[ -n "$(GITHUB_REPO)" ] || { echo "Set GITHUB_REPO=owner/repo before running this target"; exit 1; }
	@OWNER=$$(echo $(GITHUB_REPO) | cut -d/ -f1); \
	 REPO=$$(echo $(GITHUB_REPO) | cut -d/ -f2); \
	gcloud builds triggers create github \
	  --repo-name="$$REPO" \
	  --repo-owner="$$OWNER" \
	  --branch-pattern="^main$$" \
	  --build-config=cloudbuild.yaml \
	  --project=$(PROJECT) \
	  --description="Nova Banking Agent — deploy on push to main"
	@echo "Cloud Build trigger created. Push to main to deploy automatically."

trigger-run: ## Manually trigger a Cloud Build build from the current branch
	gcloud builds submit \
	  --config=cloudbuild.yaml \
	  --project=$(PROJECT)

# ---------------------------------------------------------------------------
# Observability
# ---------------------------------------------------------------------------

logs: ## Stream live Cloud Run logs
	gcloud run services logs tail $(SERVICE_NAME) \
	  --region=$(REGION) \
	  --project=$(PROJECT)

url: ## Print the Cloud Run service URL
	@gcloud run services describe $(SERVICE_NAME) \
	  --region=$(REGION) \
	  --project=$(PROJECT) \
	  --format="value(status.url)"

describe: ## Show full Cloud Run service description
	gcloud run services describe $(SERVICE_NAME) \
	  --region=$(REGION) \
	  --project=$(PROJECT)

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

clean: ## Remove local build artefacts (frontend/dist, __pycache__)
	rm -rf frontend/dist
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	@echo "Clean done."
