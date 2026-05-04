#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# EIP YouTube Uploader — Publish Release to GitHub
# Run this after building on Windows to upload the artifacts to GitHub Releases
# Usage: bash publish-release.sh <path-to-release-folder>
# ─────────────────────────────────────────────────────────────────────────────

GITHUB_TOKEN="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"
REPO="msmith-eip/eip-youtube-uploader"
RELEASE_ID="317252173"

RELEASE_DIR="${1:-./release}"

echo "Uploading release artifacts from: $RELEASE_DIR"

upload_asset() {
  local file="$1"
  local name="$(basename "$file")"
  echo "Uploading: $name"
  curl -s -X POST \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @"$file" \
    "https://uploads.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets?name=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$name'))")" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print('  ✓ Uploaded:', r.get('name', 'ERROR: '+str(r)[:100]))"
}

# Upload all Windows artifacts
for f in "$RELEASE_DIR"/*.exe "$RELEASE_DIR"/*.zip "$RELEASE_DIR"/latest.yml "$RELEASE_DIR"/*.blockmap; do
  [ -f "$f" ] && upload_asset "$f"
done

echo ""
echo "Done! Release v1.0.1 is live at:"
echo "https://github.com/${REPO}/releases/tag/v1.0.1"
