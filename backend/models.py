from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from database import Base
from datetime import datetime


class CountryData(Base):
    __tablename__ = "country_data"

    id = Column(Integer, primary_key=True, index=True)
    iso_numeric = Column(Integer, unique=True, index=True)
    iso_alpha3 = Column(String, unique=True, index=True)
    name = Column(String)
    # promoted columns - things you'll filter/sort on
    gdp_per_capita = Column(Float, nullable=True)
    population = Column(Integer, nullable=True)
    hdi = Column(Float, nullable=True)
    gini = Column(Float, nullable=True)
    # everything else lives here until needed
    indicators = Column(JSON, nullable=True)
    briefing = Column(JSON, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ProvinceBriefingCache(Base):
    __tablename__ = "province_briefings"

    id = Column(Integer, primary_key=True, index=True)
    adm1_code = Column(String, unique=True, index=True)
    adm0_a3 = Column(String, index=True)
    briefing = Column(JSON)
