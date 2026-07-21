from sqlalchemy.orm import Session
from pydantic import BaseModel
from pydantic_ai import Agent
import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from database import engine, get_db
from models import Base, CountryData, ProvinceBriefingCache

app = FastAPI()

_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)


class myModel(BaseModel):
    iso_alpha3: str
    name: str
    risk_level: int
    summary: str
    key_factors: list[str]


agent = Agent(
    model="anthropic:claude-haiku-4-5",
    output_type=myModel,
    instructions="You are a geopolitical analyst. Return structured country briefings.",
)


class ProvinceBriefingOutput(BaseModel):
    risk_level: int
    summary: str
    key_factors: list[str]


province_agent = Agent(
    model="anthropic:claude-haiku-4-5",
    output_type=ProvinceBriefingOutput,
    instructions="You are a geopolitical analyst providing province and state level briefings. Be concise and specific to the region.",
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/countries")
def get_countries(db: Session = Depends(get_db)):
    countries = db.query(CountryData).all()
    return [
        {
            "iso_alpha3": c.iso_alpha3,
            "name": c.name,
            "gdp_per_capita": c.gdp_per_capita,
            "population": c.population,
            "gini": c.gini,
            "hdi": c.hdi,
        }
        for c in countries
    ]


@app.get("/countries/{iso_alpha3}/briefing")
def get_country_briefing(iso_alpha3: str, db: Session = Depends(get_db)):
    country = db.query(CountryData).filter(CountryData.iso_alpha3 == iso_alpha3).first()
    if not country:
        return {"error": "Country not found"}

    # Prepare the data for the agent
    country_data = {
        "iso_alpha3": country.iso_alpha3,
        "name": country.name,
        "gdp_per_capita": country.gdp_per_capita,
        "population": country.population,
        "gini": country.gini,
    }

    if country.briefing:
        return country.briefing

    context = str(country_data)
    briefing = agent.run_sync(context)
    country.briefing = briefing.output.model_dump()
    db.commit()
    return briefing.output


@app.get("/provinces/{adm0_a3}/{adm1_code}/briefing")
def get_province_briefing(adm0_a3: str, adm1_code: str, name: str = "", db: Session = Depends(get_db)):
    cached = db.query(ProvinceBriefingCache).filter_by(adm1_code=adm1_code).first()
    if cached:
        return cached.briefing

    country = db.query(CountryData).filter_by(iso_alpha3=adm0_a3).first()
    country_name = country.name if country else adm0_a3
    gdp = country.gdp_per_capita if country else None
    context = f"Province/State: {name or adm1_code} in {country_name}. Country GDP/cap: ${gdp:,.0f}" if gdp else f"Province/State: {name or adm1_code} in {country_name}."

    briefing = province_agent.run_sync(context)
    record = ProvinceBriefingCache(adm1_code=adm1_code, adm0_a3=adm0_a3, briefing=briefing.output.model_dump())
    db.add(record)
    db.commit()
    return briefing.output
