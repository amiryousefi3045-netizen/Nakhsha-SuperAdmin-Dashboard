#!/bin/bash

# ============================================================================
# MongoDB Restore Script for Nakhsha
# ============================================================================
# Purpose: Restore MongoDB database from backup
# Usage: ./restore-mongodb.sh <backup_directory> [--drop-existing]
# Example: ./restore-mongodb.sh ./_backups/nakhsha_backup_20260520_120000
# ============================================================================

set -e

BACKUP_SOURCE="$1"
DROP_EXISTING="$2"
MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017}"
LOG_FILE="./_backups/restore.log"

# Validation
if [ -z "$BACKUP_SOURCE" ]; then
    echo "❌ Usage: $0 <backup_directory> [--drop-existing]"
    echo "Example: $0 ./_backups/nakhsha_backup_20260520_120000"
    exit 1
fi

if [ ! -d "$BACKUP_SOURCE" ]; then
    echo "❌ Backup directory not found: $BACKUP_SOURCE"
    exit 1
fi

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

trap 'log "❌ Restore failed"; exit 1' ERR

log "================================"
log "🔄 Starting MongoDB Restore"
log "================================"
log "Source: $BACKUP_SOURCE"
log "Target: $MONGODB_URI"

# Confirmation
if [ "$DROP_EXISTING" == "--drop-existing" ]; then
    log "⚠️  WARNING: Existing 'nakhsha' database will be DROPPED"
    read -p "Are you sure? Type 'yes' to confirm: " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        log "❌ Restore cancelled"
        exit 1
    fi
    DROP_FLAG="--drop"
else
    DROP_FLAG=""
    log "⚠️  Existing data will be merged with backup"
fi

# Perform restore
log "📦 Restoring from backup..."
mongorestore \
  --uri="$MONGODB_URI" \
  "$DROP_FLAG" \
  "$BACKUP_SOURCE" \
  --quiet

log "✅ Restore completed successfully"
log "================================"

exit 0
