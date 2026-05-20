#!/bin/bash

# ============================================================================
# MongoDB Backup Script for Nakhsha
# ============================================================================
# Purpose: Automated backup of MongoDB database
# Usage: ./backup-mongodb.sh
# Cron: Add to crontab for daily backups: 0 2 * * * /path/to/backup-mongodb.sh
# ============================================================================

set -e  # Exit on any error

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./_backups}"
MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/nakhsha}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"  # Keep backups for 30 days
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="nakhsha_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
LOG_FILE="${BACKUP_DIR}/backups.log"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

# Error handler
trap 'log "❌ Backup failed at $(date)"; exit 1' ERR

log "================================"
log "🔄 Starting MongoDB Backup"
log "================================"
log "Backup directory: ${BACKUP_DIR}"
log "Database: nakhsha"
log "Timestamp: ${TIMESTAMP}"

# Perform backup
log "📦 Creating backup dump..."
mongodump \
  --uri="${MONGODB_URI}" \
  --out="${BACKUP_PATH}" \
  --quiet

log "✅ Backup dump created at ${BACKUP_PATH}"

# Count collections
COLLECTION_COUNT=$(find "${BACKUP_PATH}" -type f -name "*.bson" 2>/dev/null | wc -l)
log "📊 Collections backed up: ${COLLECTION_COUNT}"

# Get backup size
BACKUP_SIZE=$(du -sh "${BACKUP_PATH}" | cut -f1)
log "💾 Backup size: ${BACKUP_SIZE}"

# Optional: Upload to S3 (uncomment and configure if using AWS S3)
# log "📤 Uploading to S3..."
# aws s3 cp "${BACKUP_PATH}" "s3://your-bucket/nakhsha-backups/${BACKUP_NAME}.tar.gz" --sse AES256
# log "✅ Uploaded to S3"

# Cleanup old backups (keep only RETENTION_DAYS old)
log "🗑️  Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -maxdepth 1 -type d -name "nakhsha_backup_*" -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true
REMAINING=$(find "${BACKUP_DIR}" -maxdepth 1 -type d -name "nakhsha_backup_*" | wc -l)
log "📋 Remaining backups: ${REMAINING}"

log "================================"
log "✅ Backup completed successfully"
log "================================"
log ""

exit 0
