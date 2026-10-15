param(
    [int]$QuietSeconds = 3,
    [int]$PollMilliseconds = 1000
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repositoryRoot

$mutexName = "vibe-midterm-202502080-auto-git-sync"
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)

if (-not $createdNew) {
    Write-Output "Auto Git sync is already running."
    exit 0
}

function Invoke-Git {
    param(
        [string[]]$Arguments
    )

    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Get-WorkingTreeSignature {
    $status = & git status --porcelain=v1 --untracked-files=all
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect the Git working tree."
    }

    return ($status -join "`n")
}

try {
    $lastSignature = Get-WorkingTreeSignature
    $lastChangeAt = Get-Date

    Write-Output "Watching $repositoryRoot for changes."

    while ($true) {
        Start-Sleep -Milliseconds $PollMilliseconds
        $currentSignature = Get-WorkingTreeSignature

        if ($currentSignature -ne $lastSignature) {
            $lastSignature = $currentSignature
            $lastChangeAt = Get-Date
            continue
        }

        if ([string]::IsNullOrWhiteSpace($currentSignature)) {
            continue
        }

        $quietFor = ((Get-Date) - $lastChangeAt).TotalSeconds
        if ($quietFor -lt $QuietSeconds) {
            continue
        }

        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Write-Output "[$timestamp] Changes detected. Creating commit."

        Invoke-Git @("add", "--all")
        $stagedChanges = & git diff --cached --quiet
        if ($LASTEXITCODE -eq 0) {
            $lastSignature = Get-WorkingTreeSignature
            continue
        }

        $commitMessage = "Auto-sync: $timestamp"
        Invoke-Git @("commit", "-m", $commitMessage)
        Invoke-Git @("push", "origin", "HEAD")

        Write-Output "[$timestamp] Commit pushed successfully."
        $lastSignature = Get-WorkingTreeSignature
        $lastChangeAt = Get-Date
    }
}
catch {
    Write-Error $_
    exit 1
}
finally {
    if ($null -ne $mutex) {
        $mutex.ReleaseMutex()
        $mutex.Dispose()
    }
}
