#!/usr/bin/env bash
# =============================================================================
# NorthRiver Banking Agent — Cloud Run deployment script
#
# Usage:
#   ./deploy.sh                          # deploy with defaults from .env
#   ./deploy.sh --project my-project     # override project
#   ./deploy.sh --region us-central1     # override region
#   ./deploy.sh --seed                   # also seed Firestore after deploy
#   ./deploy.sh --help
#
# Required environment variables (or set in .env):
#   GOOGLE_CLOUD_PROJECT   GCP project ID
#   FIRESTORE_PROJECT      Firestore project (defaults to GOOGLE_CLOUD_PROJECT)
#   DEMO_CREDENTIALS       Login credentials (user:pass:acc:uid,...)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
step()    { echo -e "\n${BOLD}▶ $*${RESET}"; }
die()     { error "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Load .env if present (does NOT override variables already in the environment)
# ---------------------------------------------------------------------------

if [[ -f .env ]]; then
  info "Loading .env"
  set -o allexport
  # shellcheck source=/dev/null
  source .env
  set +o allexport
fi

# ---------------------------------------------------------------------------
# Defaults (can be overridden via env vars or CLI flags below)
# ---------------------------------------------------------------------------

SERVICE_NAME="${SERVICE_NAME:-northriver-banking-agent}"
REGION="${REGION:-europe-west4}"
PROJECT="${GOOGLE_CLOUD_PROJECT:-}"
FIRESTORE_PROJECT="${FIRESTORE_PROJECT:-$PROJECT}"
AI_LOCATION="${GOOGLE_CLOUD_LOCATION:-europe-west4}"
AGENT_MODEL="${AGENT_MODEL:-gemini-live-2.5-flash-native-audio}"
DEMO_CREDENTIALS="${DEMO_CREDENTIALS:-sophie:nova1234:acc_demo_01:user_demo_01,liam:nova1234:acc_demo_02:user_demo_02}"
MIN_INSTANCES="${MIN_INSTANCES:-1}"
MAX_INSTANCES="${MAX_INSTANCES:-10}"
MEMORY="${MEMORY:-1Gi}"
CPU="${CPU:-1}"
CONCURRENCY="${CONCURRENCY:-10}"
TIMEOUT="${TIMEOUT:-3600}"
SEED_AFTER_DEPLOY=false

# ---------------------------------------------------------------------------
# Parse CLI flags
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case $1 in
    --project)   PROJECT="$2";          shift 2 ;;
    --region)    REGION="$2";           shift 2 ;;
    --service)   SERVICE_NAME="$2";     shift 2 ;;
    --min-instances) MIN_INSTANCES="$2"; shift 2 ;;
    --seed)      SEED_AFTER_DEPLOY=true; shift ;;
    --help|-h)
      sed -n '3,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "Unknown argument: $1  (try --help)" ;;
  esac
done

# ---------------------------------------------------------------------------
# Validate prerequisites
# ---------------------------------------------------------------------------

step "Validating prerequisites"

[[ -z "$PROJECT" ]] && die "GOOGLE_CLOUD_PROJECT is not set. Set it in .env or pass --project <id>"

command -v gcloud &>/dev/null || die "gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install"

# Check gcloud auth
if ! gcloud auth print-access-token &>/dev/null 2>&1; then
  die "Not authenticated with gcloud. Run: gcloud auth login"
fi

# Check active project matches
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
if [[ -n "$ACTIVE_PROJECT" && "$ACTIVE_PROJECT" != "$PROJECT" ]]; then
  warn "gcloud active project ($ACTIVE_PROJECT) differs from target ($PROJECT). Deploying to $PROJECT."
fi

success "Prerequisites OK"
echo ""
echo -e "  Service:     ${BOLD}${SERVICE_NAME}${RESET}"
echo -e "  Project:     ${BOLD}${PROJECT}${RESET}"
echo -e "  Region:      ${BOLD}${REGION}${RESET}"
echo -e "  AI Location: ${BOLD}${AI_LOCATION}${RESET}"
echo -e "  Model:       ${BOLD}${AGENT_MODEL}${RESET}"
echo -e "  Min inst:    ${BOLD}${MIN_INSTANCES}${RESET}"
echo ""

# ---------------------------------------------------------------------------
# Enable required GCP APIs (idempotent)
# ---------------------------------------------------------------------------

step "Enabling required GCP APIs"

APIS=(
  run.googleapis.com
  cloudbuild.googleapis.com
  artifactregistry.googleapis.com
  firestore.googleapis.com
  aiplatform.googleapis.com
)

gcloud services enable "${APIS[@]}" \
  --project="$PROJECT" \
  --quiet

success "APIs enabled"

# ---------------------------------------------------------------------------
# Deploy to Cloud Run (--source triggers Cloud Build under the hood)
# The Dockerfile handles the full multi-stage build:
#   Stage 1 — Node 20: npm ci && npm run build (React → dist/)
#   Stage 2 — Python 3.12: pip install, copy backend + frontend/dist
# ---------------------------------------------------------------------------

step "Deploying ${SERVICE_NAME} to Cloud Run (region: ${REGION})"
info "Cloud Build will build the Docker image — this takes ~3 minutes on first run."

# Use ^|^ as the env-var delimiter so commas inside DEMO_CREDENTIALS are safe.
ENV_VARS="^|^"
ENV_VARS+="GOOGLE_GENAI_USE_VERTEXAI=TRUE"
ENV_VARS+="|GOOGLE_CLOUD_PROJECT=${PROJECT}"
ENV_VARS+="|GOOGLE_CLOUD_LOCATION=${AI_LOCATION}"
ENV_VARS+="|AGENT_MODEL=${AGENT_MODEL}"
ENV_VARS+="|FIRESTORE_PROJECT=${FIRESTORE_PROJECT}"
ENV_VARS+="|DEMO_CREDENTIALS=${DEMO_CREDENTIALS}"

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project  "$PROJECT" \
  --region   "$REGION" \
  --allow-unauthenticated \
  --min-instances "$MIN_INSTANCES" \
  --max-instances "$MAX_INSTANCES" \
  --memory   "$MEMORY" \
  --cpu      "$CPU" \
  --concurrency "$CONCURRENCY" \
  --timeout  "$TIMEOUT" \
  --set-env-vars "$ENV_VARS" \
  --quiet

# ---------------------------------------------------------------------------
# Print service URL
# ---------------------------------------------------------------------------

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT" \
  --region  "$REGION" \
  --format  "value(status.url)")

success "Deployment complete!"
echo ""
echo -e "  🌐  ${BOLD}${SERVICE_URL}${RESET}"
echo ""

# ---------------------------------------------------------------------------
# Optional: seed Firestore
# ---------------------------------------------------------------------------

if [[ "$SEED_AFTER_DEPLOY" == "true" ]]; then
  step "Seeding Firestore (project: ${FIRESTORE_PROJECT})"
  GOOGLE_CLOUD_PROJECT="$PROJECT" FIRESTORE_PROJECT="$FIRESTORE_PROJECT" \
    python seed_data.py
  success "Firestore seeded"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo -e "${GREEN}${BOLD}All done.${RESET}"
echo ""
echo "  Demo credentials:"
echo "    username: sophie   password: nova1234"
echo "    username: liam     password: nova1234"
echo ""
echo "  Useful commands:"
echo "    make logs           # stream live logs"
echo "    make seed           # seed Firestore separately"
echo "    make url            # print service URL"
