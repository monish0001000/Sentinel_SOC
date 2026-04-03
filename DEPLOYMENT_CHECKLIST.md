================================================================================
SENTINEL SOC v2.0.0 - DEPLOYMENT CHECKLIST
================================================================================

Use this checklist to ensure your real-time SOC is properly deployed and ready
for production monitoring.

================================================================================
PRE-DEPLOYMENT (Day 1)
================================================================================

☐ System Requirements Check
  ☐ Windows 10/11 or Windows Server 2016+ installed
  ☐ 8GB+ RAM available
  ☐ 20GB+ free disk space
  ☐ Administrator access to the system
  ☐ Network connectivity confirmed

☐ Software Installation
  ☐ Python 3.8+ installed
  ☐ pip package manager working
  ☐ Git installed (for version control)
  ☐ Administrator PowerShell session available

☐ Dependencies Installation
  ☐ Run: pip install -r requirements.txt (all packages)
  ☐ Run: choco install npcap (packet capture driver)
  ☐ Run: choco install redis (optional, for distributed mode)
  ☐ Verify installation: python verify_realtime.py

☐ Documentation Review
  ☐ Read README_V2_REALTIME.md
  ☐ Review upgrades.txt for all changes
  ☐ Study REALTIME_QUICKSTART.md
  ☐ Understand UPGRADE_CHANGES.md

================================================================================
SYSTEM VERIFICATION (Day 1 - Afternoon)
================================================================================

☐ Run Full Verification Script
  ☐ Execute: python verify_realtime.py
  ☐ All components show: ✓ (green checks)
  ☐ Warnings are addressed
  ☐ Test results: PASSED

☐ Systems Check
  ☐ Python version: 3.8+
  ☐ Platform: Windows
  ☐ Administrator privileges: Yes
  ☐ Event logs accessible: Yes
  ☐ Ports available: 8000, 8765, 1514, 3000

☐ Component Verification
  ☐ Windows Event Log: Accessible
  ☐ Network capture: Working
  ☐ Firewall (WFP): Available
  ☐ File monitoring: Ready
  ☐ Redis: Connected (if used)

☐ Database Initialization
  ☐ sentinel_siem.db created
  ☐ incident.db created
  ☐ fim_database.db created
  ☐ firewall_rules.json created

================================================================================
CONFIGURATION (Day 2)
================================================================================

☐ Environment Variables
  ☐ Set ABUSEIPDB_API_KEY (optional, for IP reputation)
  ☐ Set VIRUSTOTAL_API_KEY (optional, for malware database)
  ☐ Set REDIS_HOST (if using separate Redis)
  ☐ Document all settings

☐ Firewall Configuration
  ☐ Review firewall_rules.json
  ☐ Customize zones (Trust/Untrust/DMZ)
  ☐ Set default policies
  ☐ Test firewall startup

☐ FIM Configuration
  ☐ Verify monitored paths:
    ☐ C:\Windows\System32
    ☐ C:\Users
    ☐ C:\ProgramData
    ☐ Application data folders
  ☐ Review critical file extensions
  ☐ Set ransomware detection thresholds

☐ EDR Configuration
  ☐ Review suspicious process chains
  ☐ Configure LOLBin list
  ☐ Set detection sensitivities
  ☐ Test with benign processes first

☐ Network Monitoring
  ☐ Verify default interface detection
  ☐ Set packet capture filter
  ☐ Configure lateral movement ports
  ☐ Test network capture

================================================================================
BASELINE CREATION (Day 2 - Evening)
================================================================================

☐ Create FIM Baseline
  ☐ System at normal operating state
  ☐ Run: python c2_core/main.py
  ☐ Wait for "[FIM] Baseline created" message
  ☐ Note baseline size in console
  ☐ Verify fim_database.db size > 1MB

☐ Collect Initial System Metrics
  ☐ Let system run for 30 minutes
  ☐ Collect baseline CPU usage
  ☐ Note baseline memory usage
  ☐ Document network connection count
  ☐ Record process count

☐ Verify Event Log Collection
  ☐ Check Event Log streaming
  ☐ Look for Windows events in console
  ☐ Verify Sysmon events if available
  ☐ Confirm SIEM database collecting events

================================================================================
INITIAL STARTUP TEST (Day 3)
================================================================================

☐ First Production Startup
  ☐ Restart the server
  ☐ Open PowerShell as Administrator
  ☐ Run: python c2_core/main.py
  ☐ Wait for all component startup messages
  ☐ Note any warnings or errors

☐ Expected Startup Output
  ☐ ✓ [MAIN] Redis State Reset
  ☐ ✓ [SYSTEM LOGS] 🔴 Real-time Windows Event Log monitoring ACTIVE
  ☐ ✓ [NETWORK] 🔴 Starting real-time packet capture...
  ☐ ✓ [EDR] 🔴 Real-Time Behavior Monitor Started
  ☐ ✓ [FIM] 🔴 Real-Time File Integrity Monitor Started
  ☐ ✓ [WFP FIREWALL] 🔴 Kernel Interception Started via WinDivert
  ☐ ✓ [THREAT INTEL] 🟢 Real-Time Threat Intelligence Service Started

☐ Dashboard Access
  ☐ Open http://localhost:3000 in browser
  ☐ Dashboard loads without errors
  ☐ Can see real connections
  ☐ Can see real processes
  ☐ Network tab shows traffic

☐ API Testing
  ☐ Open http://localhost:8000/docs
  ☐ Swagger UI loads
  ☐ Can view all endpoints
  ☐ Test /firewall/status endpoint
  ☐ Verify response is valid JSON

================================================================================
FUNCTIONALITY TESTING (Day 3 - Afternoon)
================================================================================

☐ Event Log Monitoring
  ☐ Trigger Security event (failed login attempt)
  ☐ Verify event appears in dashboard
  ☐ Check SIEM database has the event
  ☐ Verify timestamp accuracy

☐ Process Monitoring
  ☐ Open cmd.exe (should be detected)
  ☐ Launch powershell.exe from cmd.exe
  ☐ Verify suspicious chain detected in console
  ☐ Check alert in dashboard/SIEM

☐ Network Monitoring
  ☐ Open browser and visit website
  ☐ Verify HTTP/HTTPS traffic captured
  ☐ Check DNS queries logged
  ☐ Review packet statistics in dashboard

☐ File Integrity Monitoring
  ☐ Create file in monitored directory
  ☐ Verify [FIM] notification in console
  ☐ Modify existing file
  ☐ Check modification is detected
  ☐ Verify hash mismatch alert

☐ Firewall Testing
  ☐ Verify firewall active in console
  ☐ Check firewall stats reporting
  ☐ Review firewall events in dashboard
  ☐ Test blocking rule (via API)

================================================================================
SECURITY TUNING (Day 4)
================================================================================

☐ Alert Tuning
  ☐ Review false positives from baseline
  ☐ Adjust sensitivities as needed
  ☐ Document whitelist entries
  ☐ Create custom alert rules

☐ Firewall Policies
  ☐ Review current policies
  ☐ Add organizational policies
  ☐ Test policy evaluation
  ☐ Verify default-deny works

☐ Firewall Blocklist
  ☐ Add known malicious IPs
  ☐ Add restricted ports
  ☐ Review panic mode threshold
  ☐ Test manual block/unblock

☐ Threat Intelligence
  ☐ Add API keys to environment
  ☐ Test AbuseIPDB queries
  ☐ Test VirusTotal lookups
  ☐ Verify caching working

☐ SOAR Playbooks
  ☐ Review existing playbooks
  ☐ Customize for your organization
  ☐ Test playbook execution
  ☐ Verify automation workflows

================================================================================
PERFORMANCE VALIDATION (Day 4 - Afternoon)
================================================================================

☐ Latency Measurement
  ☐ Event log ingestion: < 50ms
  ☐ Network packet detection: < 200ms
  ☐ Process alert: < 100ms
  ☐ Firewall block: < 5ms
  ☐ Dashboard update: < 100ms

☐ Throughput Verification
  ☐ Monitor events/sec rate
  ☐ Verify 100+ events/second
  ☐ Check packet capture rate
  ☐ Monitor CPU usage (<20%)
  ☐ Check memory usage (<2GB)

☐ Database Health
  ☐ Check SIEM database size: 50MB+
  ☐ Verify incident database working
  ☐ Check FIM database size: 10MB+
  ☐ No corruption detected

☐ WebSocket Performance
  ☐ Open browser webconsole
  ☐ Subscribe to WebSocket
  ☐ Verify real-time data flow
  ☐ Check latency < 100ms

================================================================================
BACKUP & DISASTER RECOVERY (Day 5)
================================================================================

☐ Backup Systems
  ☐ Backup sentinel_siem.db
  ☐ Backup incident.db
  ☐ Backup firewall_rules.json
  ☐ Backup fim_database.db
  ☐ Document backup location

☐ Backup Verification
  ☐ Test restore procedure
  ☐ Verify data integrity
  ☐ Document recovery steps
  ☐ Test on isolated system

☐ Disaster Recovery Planning
  ☐ Document recovery procedures
  ☐ Create incident templates
  ☐ Plan failover strategy
  ☐ Document escalation contacts

☐ Data Retention Policy
  ☐ Define log retention period
  ☐ Set database archive schedule
  ☐ Plan historical analysis
  ☐ Document compliance requirements

================================================================================
DOCUMENTATION COMPLETION (Day 5 - Afternoon)
================================================================================

☐ System Documentation
  ☐ Document system architecture
  ☐ List all monitoring sources
  ☐ Document alert definitions
  ☐ Create incident response runbooks
  ☐ Document escalation procedures

☐ Operational Procedures
  ☐ Create startup procedure
  ☐ Create shutdown procedure
  ☐ Create maintenance procedures
  ☐ Create backup procedures
  ☐ Create monitoring procedures

☐ User Training
  ☐ Train dashboard usage
  ☐ Train alert interpretation
  ☐ Train incident response
  ☐ Train API usage
  ☐ Train troubleshooting

☐ Compliance Documentation
  ☐ Document compliance mappings
  ☐ Create audit trail procedures
  ☐ Document access controls
  ☐ Create compliance reporting
  ☐ Document retention policies

================================================================================
PRODUCTION HANDOFF (Day 6)
================================================================================

☐ Stakeholder Sign-off
  ☐ Security team approval
  ☐ Operations team approval
  ☐ Management approval
  ☐ Compliance approval

☐ Production Deployment
  ☐ Deploy to production environment
  ☐ Configure redundancy/HA
  ☐ Set up monitoring alerts
  ☐ Enable central logging
  ☐ Complete transition

☐ Go-Live Testing
  ☐ Full system test
  ☐ Monitor for 24 hours
  ☐ Verify all components healthy
  ☐ Address any issues
  ☐ Document lessons learned

☐ Ongoing Monitoring
  ☐ Set up daily health checks
  ☐ Monitor resource usage
  ☐ Review incidents daily
  ☐ Update threat intelligence weekly
  ☐ Review logs periodically

================================================================================
ONGOING MAINTENANCE (Weekly/Monthly)
================================================================================

☐ Weekly Tasks
  ☐ Review incidents
  ☐ Check resource usage
  ☐ Verify backup success
  ☐ Review alerts for noise
  ☐ Update confidence thresholds

☐ Monthly Tasks
  ☐ Update threat feeds
  ☐ Review and adjust rules
  ☐ Audit access logs
  ☐ Test disaster recovery
  ☐ Review detection effectiveness

☐ Quarterly Tasks
  ☐ Full system audit
  ☐ Performance analysis
  ☐ Security assessment
  ☐ Compliance review
  ☐ Update documentation

☐ Annual Tasks
  ☐ Major version upgrade evaluation
  ☐ Complete system refresh
  ☐ Compliance certification
  ☐ Security assessment
  ☐ Architecture review

================================================================================
SUCCESS CRITERIA
================================================================================

Your SOC deployment is SUCCESSFUL when:

✓ All component startup messages show 🔴 (active)
✓ Dashboard shows real data within 1 minute
✓ Real-time alerts appear within 100ms of events
✓ Firewall blocks malicious traffic < 5ms
✓ No critical errors in console output
✓ All API endpoints responding
✓ WebSocket streaming live data
✓ SIEM database collecting events
✓ FIM baseline created successfully
✓ Dashboard accessible and interactive
✓ Verification script shows all ✓
✓ Team can interpret alerts
✓ Incident response procedures documented
✓ Backups working
✓ Compliance requirements met

================================================================================
ROLLBACK PROCEDURE (If Needed)
================================================================================

If something goes wrong:

1. Stop the system: Press Ctrl+C in PowerShell
2. Restore databases from backup:
   - Copy sentinel_siem.db from backup
   - Copy incident.db from backup
3. Downgrade to v1.0 if needed
4. Verify with: python verify_realtime.py
5. Restart when ready: python c2_core/main.py

================================================================================

Date Completed: _______________
Deployed By: ___________________
Verified By: ___________________
Approved By: ___________________

SIGN-OFF: All systems verified and production-ready ☐

================================================================================
