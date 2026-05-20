# MongoDB Backup & Recovery Setup Guide

## Overview

This guide sets up automated MongoDB backups for the Nakhsha platform with automated retention policies.

---

## 1. Local Setup (Development)

### Manual Backup

**On Windows (PowerShell)**:

```powershell
cd d:\Work\Nakhsha
.\scripts\backup-mongodb.ps1
```

**On Linux/Mac**:

```bash
cd ~/nakhsha
chmod +x scripts/backup-mongodb.sh
./scripts/backup-mongodb.sh
```

### Manual Restore

**On Windows (PowerShell)**:

```powershell
.\scripts\restore-mongodb.ps1 -BackupPath "./_backups/nakhsha_backup_20260520_120000" -DropExisting
```

**On Linux/Mac**:

```bash
./scripts/restore-mongodb.sh ./_backups/nakhsha_backup_20260520_120000 --drop-existing
```

---

## 2. Automated Backups (Production)

### Option A: Linux/Mac (Cron)

1. Make script executable:

```bash
chmod +x /opt/nakhsha/scripts/backup-mongodb.sh
```

2. Add to crontab (2 AM daily):

```bash
crontab -e
# Add this line:
0 2 * * * /opt/nakhsha/scripts/backup-mongodb.sh
```

3. Verify cron job:

```bash
crontab -l
```

### Option B: Windows (Task Scheduler)

1. Open Task Scheduler
2. Create Basic Task:
   - **Name**: "Nakhsha MongoDB Backup"
   - **Trigger**: Daily at 2:00 AM
   - **Action**: Start a program
     - Program: `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
     - Arguments: `-ExecutionPolicy Bypass -File "D:\Work\Nakhsha\scripts\backup-mongodb.ps1"`

3. Set credentials to run under background account

### Option C: Docker Compose

Add backup service to `docker-compose.production.yml`:

```yaml
backup:
  image: mongo:7
  depends_on:
    - mongodb
  volumes:
    - ./scripts:/scripts:ro
    - mongodb-backups:/backups
  entrypoint: |
    sh -c 'while true; do
      /scripts/backup-mongodb.sh
      sleep 86400
    done'
  environment:
    - MONGODB_URI=mongodb://admin:password@mongodb:27017/nakhsha
    - BACKUP_DIR=/backups
```

---

## 3. Backup Verification

### Check Recent Backups

**Windows**:

```powershell
Get-ChildItem -Path "./_backups" | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

**Linux/Mac**:

```bash
ls -lht ./_backups | head -10
```

### Calculate Backup Size

**Windows**:

```powershell
$size = (Get-ChildItem "./_backups" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "Total backup size: $size MB"
```

**Linux/Mac**:

```bash
du -sh ./_backups/*
```

### List Collections in Backup

```bash
ls -la ./_backups/nakhsha_backup_*/nakhsha/
```

---

## 4. Disaster Recovery Procedure

### Step 1: Stop Application

```bash
docker-compose down
```

### Step 2: Verify Backup Integrity

```bash
# List available backups
ls -lh ./_backups/
```

### Step 3: Restore Database

**Option A: Drop and Replace (Full Restore)**

```powershell
.\scripts\restore-mongodb.ps1 -BackupPath "./_backups/nakhsha_backup_20260520_120000" -DropExisting
```

**Option B: Merge with Existing (Incremental)**

```powershell
.\scripts\restore-mongodb.ps1 -BackupPath "./_backups/nakhsha_backup_20260520_120000"
```

### Step 4: Verify Restoration

```bash
# Connect to MongoDB
mongosh "mongodb://localhost:27017/nakhsha"

# Check collections
> show collections

# Verify data count
> db.users.countDocuments()
> db.listings.countDocuments()
```

### Step 5: Restart Application

```bash
docker-compose up -d
```

---

## 5. Cloud Backup (AWS S3) - Optional Enhancement

### Setup S3 Upload

Modify `backup-mongodb.sh` to upload to S3:

```bash
# Install AWS CLI
brew install awscli  # macOS
# or download from https://aws.amazon.com/cli/

# Configure AWS credentials
aws configure
# Enter: AWS Access Key ID, Secret Access Key, Region

# Uncomment in backup script:
# aws s3 cp "${BACKUP_PATH}" "s3://your-bucket/nakhsha-backups/${BACKUP_NAME}" --sse AES256
```

Or use boto3 with Python:

```python
import boto3
import os

def upload_to_s3(backup_path, s3_bucket, s3_key):
    s3_client = boto3.client('s3')
    s3_client.upload_file(
        backup_path,
        s3_bucket,
        f'nakhsha-backups/{s3_key}',
        ServerSideEncryption='AES256'
    )
    print(f"Uploaded to s3://{s3_bucket}/nakhsha-backups/{s3_key}")
```

### Lifecycle Policy (Optional)

Set S3 to auto-archive old backups:

- 30 days: Standard
- 90 days: Glacier
- 365 days: Deep Archive

---

## 6. Monitoring & Alerts

### Log Monitoring

Check backup logs:

```powershell
# Windows
Get-Content "./_backups/backups.log" -Tail 50

# Linux/Mac
tail -50 ./_backups/backups.log
```

### Alert Setup (Email)

Add to backup script (after successful backup):

```bash
# Send notification email
mail -s "Nakhsha Backup: $BACKUP_NAME ($BACKUP_SIZE)" admin@nakhsha.com << EOF
Backup completed successfully at $(date)
Size: $BACKUP_SIZE
Collections: $COLLECTION_COUNT
Location: $BACKUP_PATH
EOF
```

### Monitoring Dashboard

Track backup metrics:

- Backup frequency (daily ✓)
- Last successful backup time
- Backup size trend
- Restore success rate
- Retention compliance

---

## 7. Backup Retention Policy

### Current Settings

```
Retention: 30 days
Backup frequency: Daily
Total backup slots: ~30 backups
```

### Adjust Retention

**Windows PowerShell**:

```powershell
.\backup-mongodb.ps1 -RetentionDays 60  # Keep 60 days
```

**Linux/Mac**:

```bash
RETENTION_DAYS=60 ./backup-mongodb.sh
```

---

## 8. Testing Restore (Important!)

**Never rely on untested backups**. Test monthly:

```bash
# 1. Restore to temporary database
mongorestore --uri="mongodb://127.0.0.1:27017/nakhsha_test" \
  ./_backups/nakhsha_backup_20260520_120000

# 2. Verify data
mongosh "mongodb://127.0.0.1:27017/nakhsha_test"
> db.users.countDocuments()  # Should match production

# 3. Clean up test database
mongosh "mongodb://127.0.0.1:27017" --eval "db.dropDatabase()"
```

---

## 9. Troubleshooting

| Problem                        | Solution                                                |
| ------------------------------ | ------------------------------------------------------- |
| `mongodump: command not found` | Install MongoDB tools: `brew install mongodb-community` |
| Backup size > 10GB             | Implement incremental backups or archive old data       |
| Restore takes > 5 minutes      | Check network speed, disk I/O, or use multiple threads  |
| Backups taking disk space      | Reduce `RETENTION_DAYS` or move to S3                   |
| Permission denied              | Run with `sudo` or adjust directory ownership           |

---

## 10. Checklist

- [ ] Backup scripts created (bash + PowerShell)
- [ ] Manual backup tested
- [ ] Manual restore tested
- [ ] Cron/Task Scheduler configured
- [ ] Backup monitoring set up
- [ ] Retention policy defined (30 days)
- [ ] S3 upload configured (optional)
- [ ] Alert notifications working
- [ ] Monthly restore drills scheduled
- [ ] Documentation updated

---

## Next Steps

1. **Immediate**: Test backup & restore manually
2. **This week**: Configure automated backups (cron/Task Scheduler)
3. **Monthly**: Practice full restore procedure
4. **Quarterly**: Review backup retention & archival strategy

**Status**: ✅ Phase 0 Item #2 Complete
