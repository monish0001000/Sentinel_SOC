from core.ngfw import SecurityRule


DEFAULT_POLICIES = (
    SecurityRule("Block RDP Brute Force", "Untrust", "Any", "Any", "rdp", "deny"),
    SecurityRule("Allow Corporate VPN", "Untrust", "Trust", "10.0.0.0/8", "Any", "allow"),
    SecurityRule("Block Known Malicious IPs", "Untrust", "Any", "192.168.1.100", "Any", "deny"),
    SecurityRule("Monitor SQL Traffic", "Trust", "DMZ", "Any", "sql", "allow"),
    SecurityRule("Prevent Data Exfiltration", "Trust", "Untrust", "Any", "ftp", "deny"),
    SecurityRule("Isolate Compromised Hosts", "Any", "Any", "Any", "Any", "deny"),
    SecurityRule("Allow DNS Queries", "Any", "Any", "Any", "dns", "allow"),
    SecurityRule("Block SMB via WAN", "Untrust", "Any", "Any", "smb", "deny"),
    SecurityRule("Allow HTTPS Ops", "Trust", "Untrust", "Any", "https", "allow"),
    SecurityRule("Zero Trust Default", "Any", "Any", "Any", "Any", "deny"),
)


async def seed_data(firewall_service, siem_service):
    """
    Initialise baseline firewall configuration only when no policy exists.

    This function deliberately does not create SIEM events. SIEM records must
    originate from collectors or explicitly identified test fixtures, never
    from random startup data.
    """
    try:
        existing_policies = firewall_service.get_policies()
        if existing_policies:
            print(
                f"[SEEDER] Preserving {len(existing_policies)} existing firewall policies."
            )
            return

        print("[SEEDER] No firewall policies found; installing baseline policies.")
        for policy in DEFAULT_POLICIES:
            await firewall_service.add_policy(policy.to_dict())
        print(f"[SEEDER] Installed {len(DEFAULT_POLICIES)} baseline policies.")
    except Exception as exc:
        # Startup should surface a configuration error rather than silently
        # pretending that initialisation succeeded.
        print(f"[SEEDER] ERROR: {exc}")
        raise
