#!/usr/bin/env pwsh
# ============================================================================
# Sentinel SOC - GitHub Push Helper Script
# ============================================================================
# This script handles authentication and pushes your project to GitHub

param(
    [string]$Token = "",
    [string]$Method = "auto"  # auto, pat, ssh, cli
)

Write-Host "==============================================================================="
Write-Host "🚀 Sentinel SOC - GitHub Push Helper"
Write-Host "==============================================================================="
Write-Host ""

# Check if in correct directory
if (-not (Test-Path ".git")) {
    Write-Host "❌ Error: Not in a git repository"
    Write-Host "   Change to: D:\project\Sentinel\Sentinel_level8\Sentinel_Level8_Enterprise - Copy"
    exit 1
}

# Check current status
Write-Host "📊 Current Repository Status:"
Write-Host ""
git status --short | Select-Object -First 5
git log --oneline | Select-Object -First 3
Write-Host ""

# Method 1: GitHub CLI (Most Elegant)
if ($Method -eq "auto" -or $Method -eq "cli") {
    Write-Host "🔐 Trying GitHub CLI method..."
    $ghInstalled = gh --version 2>$null
    
    if ($ghInstalled) {
        Write-Host "✅ GitHub CLI found"
        Write-Host ""
        Write-Host "Attempting to push to GitHub..."
        Write-Host ""
        
        # Try to push
        $result = git push origin main 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ SUCCESS! Your project has been pushed to GitHub!"
            Write-Host ""
            Write-Host "View your repository at:"
            Write-Host "  https://github.com/monish0001000/Sentinel_SOC_project"
            Write-Host ""
            Write-Host "Next steps:"
            Write-Host "  1. Share the link with your team"
            Write-Host "  2. Clone on other systems: git clone https://github.com/monish0001000/Sentinel_SOC_project.git"
            Write-Host "  3. Collaborate and contribute!"
            exit 0
        }
        else {
            Write-Host "⚠️ GitHub CLI push failed. Trying other methods..."
            Write-Host ""
        }
    }
    else {
        Write-Host "⚠️ GitHub CLI not found. Installing..."
        choco install gh -y | Select-String -Pattern "Success|Installing" | Select-Object -First 3
    }
}

# Method 2: Personal Access Token (PAT)
if ($Method -eq "auto" -or $Method -eq "pat") {
    Write-Host ""
    Write-Host "🔐 Method 2: Using Personal Access Token (PAT)"
    Write-Host ""
    
    if ($Token) {
        Write-Host "📝 Setting up credential helper..."
        
        # Configure credential helper
        git config --global credential.helper wincred
        
        Write-Host "🔄 Attempting push..."
        Write-Host ""
        
        # Try push (credentials should be cached or prompted)
        git push origin main
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✅ SUCCESS! Project pushed to GitHub!"
            Write-Host ""
            Write-Host "Repository: https://github.com/monish0001000/Sentinel_SOC_project"
            exit 0
        }
    }
    else {
        Write-Host "📋 To use PAT method:"
        Write-Host ""
        Write-Host "  1. Get PAT from: https://github.com/settings/tokens"
        Write-Host "     - Click 'Generate new token (classic)'"
        Write-Host "     - Select 'repo' and 'workflow' scopes"
        Write-Host "     - Copy the token"
        Write-Host ""
        Write-Host "  2. Run this script with your token:"
        Write-Host "     .\github_push.ps1 -Token 'your_token_here' -Method 'pat'"
        Write-Host ""
    }
}

# Method 3: SSH Setup
if ($Method -eq "auto" -or $Method -eq "ssh") {
    Write-Host ""
    Write-Host "🔐 Method 3: Setting up SSH (Most Secure)"
    Write-Host ""
    
    $sshPath = "$env:USERPROFILE\.ssh\id_ed25519"
    
    if (-not (Test-Path $sshPath)) {
        Write-Host "📝 Generating SSH key..."
        ssh-keygen -t ed25519 -C "sentinel@soc.dev" -N "" -f $sshPath
        Write-Host "✅ SSH key generated at: $sshPath"
        Write-Host ""
        Write-Host "📋 Public key:"
        Get-Content "$sshPath.pub"
        Write-Host ""
        Write-Host "🔐 Next steps:"
        Write-Host "  1. Go to: https://github.com/settings/keys"
        Write-Host "  2. Click 'New SSH key'"
        Write-Host "  3. Paste the public key above"
        Write-Host "  4. Save"
        Write-Host ""
    }
    else {
        Write-Host "✅ SSH key already exists at: $sshPath"
    }
    
    Write-Host "🔄 Updating git remote to use SSH..."
    git remote set-url origin "git@github.com:monish0001000/Sentinel_SOC_project.git"
    
    Write-Host "🚀 Pushing to GitHub..."
    git push origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ SUCCESS! Project pushed via SSH!"
        exit 0
    }
}

Write-Host ""
Write-Host "❌ Push failed. Please try one of these solutions:"
Write-Host ""
Write-Host "1️⃣ Use GitHub CLI (Easiest):"
Write-Host "   choco install gh"
Write-Host "   gh auth login"
Write-Host "   git push origin main"
Write-Host ""
Write-Host "2️⃣ Use Personal Access Token:"
Write-Host "   - Generate at: https://github.com/settings/tokens"
Write-Host "   - Run: .\github_push.ps1 -Token 'token_here' -Method 'pat'"
Write-Host ""
Write-Host "3️⃣ Read full troubleshooting:"
Write-Host "   - Open: GITHUB_PUSH_TROUBLESHOOTING.md"
Write-Host ""
Write-Host "4️⃣ Try manual approach:"
Write-Host "   - Open repository at: https://github.com/monish0001000/Sentinel_SOC_project"
Write-Host "   - Upload files manually via GitHub Web UI"
Write-Host ""

exit 1
