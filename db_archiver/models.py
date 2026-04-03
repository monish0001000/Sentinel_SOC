from sqlalchemy import Column, Integer, String, TIMESTAMP, Text
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Log(Base):
    __tablename__ = 'incident_log'

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(TIMESTAMP, nullable=False)
    source = Column(String(50), nullable=True)     # network, system, etc.
    event_type = Column(String(50), nullable=True) # alert, info, error
    payload = Column(Text, nullable=True)          # JSON payload or raw string
    severity = Column(String(20), nullable=True)   # high, medium, low
