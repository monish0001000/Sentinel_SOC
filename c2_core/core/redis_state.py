"""Safe initialisation of Sentinel-owned Redis state."""

DEFAULT_SENTINEL_STATE = {
    "firewall_status": "active",
    "lockdown": "false",
    "panic_mode": "false",
}


def initialize_redis_state(redis_client):
    """
    Create missing Sentinel keys without overwriting existing values.

    Redis may be shared with other services, so this function must never flush
    a database or delete keys it does not own.
    Returns the names of keys that were created.
    """
    created = []
    for key, value in DEFAULT_SENTINEL_STATE.items():
        if redis_client.setnx(key, value):
            created.append(key)
    return created
