# ============================================================================
# MongoDB Restore Script for Nakhsha (Windows PowerShell)
# ============================================================================
# Purpose: Restore MongoDB database from backup on Windows
# Usage: .\restore-mongodb.ps1 -BackupPath "path/to/backup" [-DropExisting]
# Example: .\restore-mongodb.ps1 -BackupPath "./_backups/nakhsha_backup_20260520_120000" -DropExisting
# ============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupPath,
    
    [string]$MongoDBUri = "mongodb://127.0.0.1:27017",
    
    [switch]$DropExisting,
    
    [string]$LogFile = "./_backups/restore.log"
)

# Validation
if (-not (Test-Path $BackupPath)) {
    Write-Host "❌ Backup directory not found: $BackupPath" -ForegroundColor Red
    exit 1
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
    Write-Log "❌ Restore failed: $_"
    exit 1
}

Write-Log "================================"
Write-Log "🔄 Starting MongoDB Restore"
Write-Log "================================"
Write-Log "Source: $BackupPath"
Write-Log "Target: $MongoDBUri"

# Check if mongorestore is available
$mongorestore = Get-Command mongorestore -ErrorAction SilentlyContinue
if (-not $mongorestore) {
    Write-Log "❌ mongorestore not found. Please install MongoDB tools."
    exit 1
}

# Confirmation for dropping existing data
if ($DropExisting) {
    Write-Log "⚠️  WARNING: Existing 'nakhsha' database will be DROPPED"
    $Confirmation = Read-Host "Are you sure? Type 'yes' to confirm"
    if ($Confirmation -ne "yes") {
        Write-Log "❌ Restore cancelled"
        exit 1
    }
    $DropFlag = "--drop"
} else {
    $DropFlag = ""
    Write-Log "⚠️  Existing data will be merged with backup"
}

# Perform restore
Write-Log "📦 Restoring from backup..."
if ($DropFlag) {
    & mongorestore --uri=$MongoDBUri --drop $BackupPath
} else {
    & mongorestore --uri=$MongoDBUri $BackupPath
}

Write-Log "✅ Restore completed successfully"
Write-Log "================================"

exit 0
