import os
import subprocess
import requests
from rich import print

# Configuration
DEV_MODE = os.getenv("DEV_MODE", "True").lower() == "true"
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/your-webhook-url")

def block_ip(ip_address: str):
    """
    Blocks the IP address using the system firewall.
    Supports Windows (PowerShell/NetFirewallRule) and Linux (iptables).
    If DEV_MODE is True, it only logs the command.
    """
    
    if os.name == 'nt': # Windows
        command = f"New-NetFirewallRule -DisplayName 'Block {ip_address}' -Direction Inbound -LocalPort Any -Protocol TCP -Action Block -RemoteAddress {ip_address}"
        shell = "powershell"
    else: # Linux
        command = f"iptables -A INPUT -s {ip_address} -j DROP"
        shell = "bash"

    if DEV_MODE:
        print(f"[bold yellow]🛡️ [MOCK MODE] Blocking IP:[/bold yellow] {ip_address}")
        print(f"[dim]Command that would be executed: {command}[/dim]")
        return True
    
    try:
        print(f"[bold red]⛔ ACTIVE DEFENSE ENGAGED:[/bold red] Blocking {ip_address}...")
        subprocess.run([shell, "-c", command], check=True, capture_output=True)
        print(f"[bold green]✅ Success:[/bold green] {ip_address} has been blocked.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[bold red]❌ Critical Failure:[/bold red] Could not block IP. {e}")
        return False

def send_notification(message: str):
    """
    Sends a notification to Discord (or other channels).
    """
    if DEV_MODE:
        print(f"[bold cyan]🔔 [MOCK NOTIFICATION]:[/bold cyan] {message}")
        return

    data = {"content": message}
    try:
        response = requests.post(DISCORD_WEBHOOK_URL, json=data)
        if response.status_code != 204:
             print(f"[bold red]❌ Notification Failed:[/bold red] {response.status_code}")
    except Exception as e:
        print(f"[bold red]❌ Notification Verification Error:[/bold red] {e}")
