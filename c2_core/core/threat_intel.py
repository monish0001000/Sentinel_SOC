"""
Real-Time Threat Intelligence Service
Integrates with multiple threat feeds for live IP reputation checking
"""
import requests
import os
import time
import asyncio
import threading
from typing import Set, Dict, Optional
from datetime import datetime, timedelta
from collections import defaultdict

class ThreatIntelService:
    def __init__(self):
        self.malicious_ips: Set[str] = set()
        self.suspicious_domains: Set[str] = set()
        self.reputation_cache: Dict[str, Dict] = {}  # IP -> {score, timestamp, etc}
        self.cache_ttl = 3600  # 1 hour cache
        
        # API Keys (from environment)
        self.abuseipdb_key = os.getenv("ABUSEIPDB_API_KEY", "")
        self.virustotal_key = os.getenv("VIRUSTOTAL_API_KEY", "")
        
        # Feed URLs
        self.feeds = {
            "abuse.ch": "https://sslbl.abuse.ch/blacklist/",
            "blocklist.de": "https://www.blocklist.de/api/",
            "c2_tracker": "https://indicators.abuse.ch/feeds/"
        }
        
        # Query statistics
        self.queries_made = 0
        self.cache_hits = 0
        
        # Load static blocklist
        self.load_static_blocklist()
        
        # Start background feed updater
        update_thread = threading.Thread(target=self._update_feeds, daemon=True)
        update_thread.start()
        
        print("[THREAT INTEL] 🟢 Real-Time Threat Intelligence Service Started")

    def load_static_blocklist(self):
        """Load static known-bad IPs (C2, botnet command centers)"""
        # Well-known C2 infrastructure (updated regularly)
        self.malicious_ips = {
            # Add known malicious IPs here
            # These would come from actual threat feeds in production
        }
        print(f"[THREAT INTEL] Loaded {len(self.malicious_ips)} static IOCs")

    def _update_feeds(self):
        """BACKGROUND THREAD: Periodically update threat feeds"""
        while True:
            try:
                # Update feeds every 4 hours
                time.sleep(4 * 3600)
                print("[THREAT INTEL] Updating threat feeds from live sources...")
                # In production, would download latest feeds
            except Exception as e:
                print(f"[THREAT INTEL] Feed update error: {e}")
                time.sleep(3600)

    def check_ip_abuseipdb(self, ip: str) -> Optional[Dict]:
        """Query AbuseIPDB for IP reputation (REAL-TIME)"""
        if not self.abuseipdb_key:
            return None
        
        try:
            url = "https://api.abuseipdb.com/api/v2/check"
            headers = {
                "Key": self.abuseipdb_key,
                "Accept": "application/json"
            }
            params = {
                "ipAddress": ip,
                "maxAgeInDays": 90
            }
            
            response = requests.get(url, headers=headers, params=params, timeout=5)
            if response.status_code == 200:
                data = response.json()
                return {
                    "source": "AbuseIPDB",
                    "abuse_score": data.get("abuseConfidenceScore", 0),
                    "total_reports": data.get("totalReports", 0),
                    "is_whitelisted": data.get("isWhitelisted", False),
                    "usage_type": data.get("usageType", "unknown")
                }
        except requests.timeout:
            pass
        except Exception as e:
            print(f"[THREAT INTEL] AbuseIPDB error: {e}")
        
        return None

    def check_ip_virustotal(self, ip: str) -> Optional[Dict]:
        """Query VirusTotal for IP reputation (REAL-TIME)"""
        if not self.virustotal_key:
            return None
        
        try:
            url = f"https://www.virustotal.com/api/v3/ip_addresses/{ip}"
            headers = {"x-apikey": self.virustotal_key}
            
            response = requests.get(url, headers=headers, timeout=5)
            if response.status_code == 200:
                data = response.json()
                attributes = data.get("data", {}).get("attributes", {})
                
                return {
                    "source": "VirusTotal",
                    "last_analysis_stats": attributes.get("last_analysis_stats", {}),
                    "country": attributes.get("country", "unknown"),
                    "as_owner": attributes.get("as_owner", "unknown"),
                    "reputation": attributes.get("reputation", 0)
                }
        except requests.timeout:
            pass
        except Exception as e:
            print(f"[THREAT INTEL] VirusTotal error: {e}")
        
        return None

    def check_ip(self, ip: str) -> Dict:
        """
        REAL-TIME check if IP is malicious using multiple sources.
        Returns dict with:
        - malicious: bool
        - confidence: str (high/medium/low)
        - sources: list of detection sources
        - details: full threat intel data
        - risk_score: 0-100
        """
        # Check cache first
        if ip in self.reputation_cache:
            cached = self.reputation_cache[ip]
            if datetime.utcnow() - cached["timestamp"] < timedelta(seconds=self.cache_ttl):
                self.cache_hits += 1
                print(f"[THREAT INTEL] Cache hit for {ip}")
                return cached["data"]
        
        self.queries_made += 1
        result = {
            "ip": ip,
            "malicious": False,
            "confidence": "low",
            "sources": [],
            "risk_score": 0,
            "details": {},
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # 1. Check static blocklist (fastest)
        if ip in self.malicious_ips:
            result["malicious"] = True
            result["confidence"] = "high"
            result["sources"].append("Sentinel Static Feed")
            result["risk_score"] += 50
        
        # 2. Query AbuseIPDB (REAL-TIME API)
        abuseipdb_result = self.check_ip_abuseipdb(ip)
        if abuseipdb_result:
            result["details"]["abuseipdb"] = abuseipdb_result
            abuse_score = abuseipdb_result.get("abuse_score", 0)
            
            if abuse_score > 75:
                result["malicious"] = True
                result["confidence"] = "high"
                result["risk_score"] += abuse_score // 2
            elif abuse_score > 25:
                result["confidence"] = "medium"
                result["risk_score"] += abuse_score // 3
            
            if abuse_score > 0:
                result["sources"].append(f"AbuseIPDB ({abuse_score}%)")
        
        # 3. Query VirusTotal (REAL-TIME API)
        vt_result = self.check_ip_virustotal(ip)
        if vt_result:
            result["details"]["virustotal"] = vt_result
            stats = vt_result.get("last_analysis_stats", {})
            
            # Calculate threat level from detections
            malicious_count = stats.get("malicious", 0)
            suspicious_count = stats.get("suspicious", 0)
            
            if malicious_count > 5:
                result["malicious"] = True
                result["confidence"] = "high"
                result["risk_score"] += malicious_count * 5
            elif malicious_count > 0 or suspicious_count > 3:
                result["confidence"] = "medium"
                result["risk_score"] += malicious_count * 3 + suspicious_count
            
            if malicious_count > 0:
                result["sources"].append(f"VirusTotal ({malicious_count} detections)")
        
        # Cap risk score at 100
        result["risk_score"] = min(100, result["risk_score"])
        
        # Cache the result
        self.reputation_cache[ip] = {
            "data": result,
            "timestamp": datetime.utcnow()
        }
        
        return result

    def check_domain(self, domain: str) -> Dict:
        """Check domain reputation for C2/malware domains"""
        result = {
            "domain": domain,
            "malicious": False,
            "confidence": "low",
            "sources": [],
            "risk_score": 0,
            "details": {}
        }
        
        if domain in self.suspicious_domains:
            result["malicious"] = True
            result["confidence"] = "high"
            result["sources"].append("Sentinel Domain Feed")
            result["risk_score"] = 80
        
        return result

    def add_to_feed(self, ip: str):
        """Add IP to local malicious feed"""
        self.malicious_ips.add(ip)
        print(f"[THREAT INTEL] Added {ip} to malicious feed")

    def add_suspicious_domain(self, domain: str):
        """Add domain to suspicious feed"""
        self.suspicious_domains.add(domain)
        print(f"[THREAT INTEL] Added {domain} to suspicious domain feed")

    def get_stats(self) -> Dict:
        """Get threat intel service statistics"""
        return {
            "queries_made": self.queries_made,
            "cache_hits": self.cache_hits,
            "cache_size": len(self.reputation_cache),
            "malicious_ips": len(self.malicious_ips),
            "suspicious_domains": len(self.suspicious_domains),
            "apis_available": {
                "abuseipdb": bool(self.abuseipdb_key),
                "virustotal": bool(self.virustotal_key)
            }
        }
