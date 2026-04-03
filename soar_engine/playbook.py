import sqlite3
import datetime
import os
from rich import print
from soar_engine.active_defense import block_ip, send_notification
from ai_brain.ai.analyst import analyze_log_with_ollama

# Configuration
WHITELIST_IPS = ["127.0.0.1", "192.168.1.1", "10.0.0.1", "8.8.8.8"]
ABUSEIPDB_API_KEY = os.getenv("ABUSEIPDB_API_KEY", "YOUR_KEY_HERE")
DB_PATH = "d:/project/Sentinel/Sentinel_level8/Sentinel_Level8_Enterprise - Copy/soar_engine/incident.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS incident_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            source_ip TEXT,
            threat_score INTEGER,
            ai_verdict TEXT,
            action_taken TEXT
        )
    ''')
    conn.commit()
    conn.close()

# Initialize DB on import
init_db()

def log_incident(source_ip, threat_score, ai_verdict, action_taken):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO incident_log (timestamp, source_ip, threat_score, ai_verdict, action_taken)
        VALUES (?, ?, ?, ?, ?)
    ''', (datetime.datetime.now().isoformat(), source_ip, threat_score, ai_verdict, action_taken))
    conn.commit()
    conn.close()

def check_ip_reputation(ip_address: str) -> int:
    """
    Checks AbuseIPDB for the IP reputation. Returns a confidence score (0-100).
    """
    # Mock return for now if no key
    if "YOUR_KEY_HERE" in ABUSEIPDB_API_KEY:
        print("[yellow]⚠️ No AbuseIPDB Key found. Returning mock score.[/yellow]")
        return 60 # Simulate a bad IP for testing

    url = "https://api.abuseipdb.com/api/v2/check"
    headers = {
        'Key': ABUSEIPDB_API_KEY,
        'Accept': 'application/json'
    }
    params = {'ipAddress': ip_address}
    
    try:
        response = requests.get(url, headers=headers, params=params)
        data = response.json()
        return data.get('data', {}).get('abuseConfidenceScore', 0)
    except Exception as e:
        print(f"[red]AbuseIPDB Error: {e}[/red]")
        return 0

async def decide_action(ip_address: str, log_entry: str, rule_name: str):
    print(f"\n[bold blue]🔎 Auditing Incident:[/bold blue] {rule_name} from {ip_address}")

    # 1. Whitelist Check
    if ip_address in WHITELIST_IPS:
        print(f"[bold green]🛡️ Whitelisted IP detected:[/bold green] {ip_address} - No action taken.")
        log_incident(ip_address, 0, "Whitelisted", "Ignored")
        return

    # 2. Threat Intelligence Check
    threat_score = check_ip_reputation(ip_address)
    print(f"[cyan]Threat Score:[/cyan] {threat_score}/100")

    ai_verdict = "Pending"
    action_taken = "None"

    # 3. Decision Matrix
    if threat_score > 50:
        print("[bold red]🚨 HIGH CONFIDENCE THREAT DETECTED[/bold red]")
        block_success = block_ip(ip_address)
        action_taken = "BLOCKED" if block_success else "BLOCK_FAILED"
        send_notification(f"🚨 **BLOCKED** {ip_address} (Score: {threat_score}) - {rule_name}")
    
    else:
        print("[yellow]⚠️ Low confidence. Engaging AI Analyst...[/yellow]")
        ai_verdict = await analyze_log_with_ollama(log_entry)
        print(f"[bold purple]🤖 AI Analyst Verdict:[/bold purple] {ai_verdict}")
        
        if "attack" in ai_verdict.lower() or "malicious" in ai_verdict.lower():
             print("[bold red]🤖 AI confirms threat. Updating firewall...[/bold red]")
             # Optionally block here too if AI is sure
             action_taken = "FLAGGED_BY_AI"
        else:
             print("[green]🤖 AI dismisses as false positive.[/green]")
             action_taken = "MONITORING"
        
        send_notification(f"⚠️ **Analyzed** {ip_address} - AI says: {ai_verdict}")

    # 4. Audit Log
    log_incident(ip_address, threat_score, ai_verdict, action_taken)
