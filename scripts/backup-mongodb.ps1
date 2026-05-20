# ============================================================================
# MongoDB Backup Script for Nakhsha (Windows PowerShell)
# ============================================================================
# Purpose: Automated backup of MongoDB database on Windows
# Usage: .\backup-mongodb.ps1
# Scheduler: Add to Windows Task Scheduler for daily backups
# ============================================================================

param(
    [string]$BackupDir = "./_backups",
    [string]$MongoDBUri = "mongodb://127.0.0.1:27017/nakhsha",
    [int]$RetentionDays = 30
)

# Configuration
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupName = "nakhsha_backup_$Timestamp"
$BackupPath = Join-Path $BackupDir $BackupName
$LogFile = Join-Path $BackupDir "backups.log"

# Create backup directory if it doesn't exist
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

# Logging function
function Write-Log {
    param([string]$Message)
    $LogMessage = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Write-Host $LogMessage
    Add-Content -Path $LogFile -Value $LogMessage
}

# Error handler
trap {
    Write-Log "❌ Backup failed: $_"
    exit 1
}

Write-Log "================================"
Write-Log "🔄 Starting MongoDB Backup"
Write-Log "================================"
Write-Log "Backup directory: $BackupDir"
Write-Log "Database: nakhsha"
Write-Log "Timestamp: $Timestamp"

# Check if mongodump is available
$mongodump = Get-Command mongodump -ErrorAction SilentlyContinue
if (-not $mongodump) {
    Write-Log "❌ mongodump not found. Please install MongoDB tools."
    exit 1
}

# Perform backup
Write-Log "📦 Creating backup dump..."
& mongodump `
    --uri=$MongoDBUri `
    --out=$BackupPath

Write-Log "✅ Backup dump created at $BackupPath"

# Count collections
$CollectionCount = (Get-ChildItem -Path $BackupPath -Recurse -Filter "*.bson" | Measure-Object).Count
Write-Log "📊 Collections backed up: $CollectionCount"

# Get backup size
$BackupSize = "{0:N2} MB" -f ((Get-ChildItem $BackupPath -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB)
Write-Log "💾 Backup size: $BackupSize"

# Cleanup old backups
Write-Log "🗑️  Cleaning up backups older than $RetentionDays days..."
$CutoffDate = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupDir -Filter "nakhsha_backup_*" -Directory | 
    Where-Object { $_.LastWriteTime -lt $CutoffDate } | 
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

$RemainingCount = (Get-ChildItem -Path $BackupDir -Filter "nakhsha_backup_*" -Directory | Measure-Object).Count
Write-Log "📋 Remaining backups: $RemainingCount"

Write-Log "================================"
Write-Log "✅ Backup completed successfully"
Write-Log "================================"
Write-Log ""

exit 0
