import asyncio
import os
import sys
import redis
import requests
import psycopg2
from rich.console import Console
from rich.table import Table

console = Console()

# Configuration
# Assuming we run this from host (Windows), so localhost checks.
DB_HOST = "localhost"
DB_PORT = 5432
DB_USER = "admin"
DB_PASS = "password"
DB_NAME = "sentinel_logs"

API_URL = "http://localhost:8000"
REDIS_HOST = "localhost"
REDIS_PORT = 6379

def check_database():
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASS,
            dbname=DB_NAME
        )
        conn.close()
        return "✅ Connected"
    except Exception as e:
        return f"❌ Failed: {e}"

def check_api():
    try:
        # Assuming there is a root or heartbeat endpoint, if not we check docs or just connection
        response = requests.get(API_URL, timeout=2)
        if response.status_code in [200, 404]: # 404 means server is up but path unknown
            return "✅ Available"
        return f"⚠️ Status: {response.status_code}"
    except Exception as e:
        return f"❌ Failed: {e}"

def check_redis():
    try:
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT)
        r.ping()
        channels = r.pubsub_channels()
        status = "✅ Active"
        # Check if soc_logs is being listened to (requires clients to be connected)
        # Note: pubsub_channels only returns channels with subscribers if pattern is not used
        # We can't strictly prove specific subscribers from outside easily without MONITOR, 
        # but connection is good.
        return status
    except Exception as e:
        return f"❌ Failed: {e}"

def main():
    table = Table(title="Sentinel Level 9 Infrastructure Check")
    table.add_column("Service", style="cyan")
    table.add_column("Endpoint", style="magenta")
    table.add_column("Status", style="bold")

    console.print("[bold yellow]Running Connectivity Checks...[/bold yellow]")
    
    # 1. Database Check
    db_status = check_database()
    table.add_row("TimescaleDB / Postgres", f"{DB_HOST}:{DB_PORT}", db_status)

    # 2. C2 Core API Check
    api_status = check_api()
    table.add_row("C2 Core API", API_URL, api_status)

    # 3. Redis Check
    redis_status = check_redis()
    table.add_row("Redis Message Bus", f"{REDIS_HOST}:{REDIS_PORT}", redis_status)

    console.print(table)
    
    if "❌" in db_status or "❌" in api_status or "❌" in redis_status:
        console.print("[bold red]Infrastructure Checks Failed. Verify docker-compose is running.[/bold red]")
        sys.exit(1)
    else:
        console.print("[bold green]All Critical Services are Reachable![/bold green]")

if __name__ == "__main__":
    main()
