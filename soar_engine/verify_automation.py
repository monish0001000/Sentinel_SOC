import os
import asyncio
from fastapi.testclient import TestClient
from contextlib import contextmanager
# Set DEV_MODE to True for safety
os.environ["DEV_MODE"] = "True"

from soar_engine.listener import app
from soar_engine.playbook import decide_action

client = TestClient(app)

def test_whitelist_scenario():
    print("\n[TEST] Testing Whitelist Scenario...")
    response = client.post("/alert", json={
        "source_ip": "127.0.0.1",
        "rule_name": "Test Whitelist",
        "full_log": "Test log"
    })
    print(f"Response: {response.json()}")
    assert response.status_code == 202

def test_high_threat_scenario():
    print("\n[TEST] Testing High Threat Scenario (Mocked)...")
    # We rely on the playbook's internal mock for now if no API key
    response = client.post("/alert", json={
        "source_ip": "1.2.3.4", 
        "rule_name": "SSH Brute Force",
        "full_log": "Failed password for root from 1.2.3.4"
    })
    print(f"Response: {response.json()}")
    assert response.status_code == 202

if __name__ == "__main__":
    test_whitelist_scenario()
    test_high_threat_scenario()
    print("\nDone. Check the console output above for Rich logs from the background tasks (which might run slightly after validation in a real server, but TestClient runs synchronously for background tasks usually? No, it runs them. Let's see.)")
    print("Actually TestClient in Starlette/FastAPI runs background tasks after the response is sent within the same call block usually.")
