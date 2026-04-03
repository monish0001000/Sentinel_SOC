import asyncio
import os
import json
import logging
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from models import Base, Log
from datetime import datetime

# Configuration
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
PG_USER = os.getenv("POSTGRES_USER", "admin")
PG_PASS = os.getenv("POSTGRES_PASSWORD", "password")
PG_DB = os.getenv("POSTGRES_DB", "sentinel_logs")
PG_HOST = os.getenv("POSTGRES_HOST", "localhost")
DATABASE_URL = f"postgresql+asyncpg://{PG_USER}:{PG_PASS}@{PG_HOST}:5432/{PG_DB}"

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DBArchiver")

async def get_db_engine():
    """
    Attempts to connect to the database with retries.
    """
    max_retries = 10
    wait_time = 5
    
    for attempt in range(max_retries):
        try:
            engine = create_async_engine(DATABASE_URL, echo=False)
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("✅ Database connected and initialized.")
            return engine
        except Exception as e:
            logger.warning(f"⚠️ Database connection failed (Attempt {attempt + 1}/{max_retries}): {e}")
            await asyncio.sleep(wait_time)
            
    logger.error("❌ Critical: Could not connect to Database after multiple attempts.")
    raise ConnectionError("Database unavailable")

async def archive_logs():
    try:
        engine = await get_db_engine()
        async_session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        
        r = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)
        # Retry logic for Redis could also be added, but redis-py handles some connection issues.
        # We'll assume Redis is up if this container is running later, but let's be safe.
        
        pubsub = r.pubsub()
        await pubsub.subscribe("soc_logs")
        logger.info(f"✅ Subscribed to Redis channel: soc_logs on {REDIS_HOST}")

        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"]
                try:
                    # Attempt to parse JSON
                    try:
                        payload_json = json.loads(data)
                        source = payload_json.get("source", "unknown")
                        event_type = payload_json.get("event_type", "info")
                        severity = payload_json.get("severity", "low")
                        payload_str = json.dumps(payload_json)
                    except json.JSONDecodeError:
                        payload_str = data
                        source = "raw"
                        event_type = "raw_log"
                        severity = "unknown"

                    async with async_session() as session:
                        new_log = Log(
                            timestamp=datetime.now(),
                            source=source,
                            event_type=event_type,
                            payload=payload_str,
                            severity=severity
                        )
                        session.add(new_log)
                        await session.commit()
                        # Optional: Use rich if installed for nicer logs in dev, otherwise standard logging
                        # logger.info(f"Archived log: {event_type}")

                except Exception as e:
                    logger.error(f"Failed to archive log: {e}")

    except Exception as e:
        logger.error(f"Fatal Error in main loop: {e}")

if __name__ == "__main__":
    try:
        print("Starting DB Archiver Service...")
        asyncio.run(archive_logs())
    except KeyboardInterrupt:
        logger.info("Stopping DB Archiver.")
