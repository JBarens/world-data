from sqlalchemy.orm import Session
from pydantic import BaseModel
from pydantic_ai import Agent
import os
import re
from fastapi import FastAPI, Depends, HTTPException
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
    # Validate country exists — rejects arbitrary adm0_a3 values
    country = db.query(CountryData).filter_by(iso_alpha3=adm0_a3).first()
    if not country:
        raise HTTPException(status_code=404, detail="Country not found")

    # Cache keyed on both country + province so adm1_codes from different countries don't collide
    cache_key = f"{adm0_a3}:{adm1_code}"
    cached = db.query(ProvinceBriefingCache).filter_by(adm1_code=cache_key).first()
    if cached:
        return cached.briefing

    # Strip anything that isn't a letter, number, space, hyphen, or apostrophe to block prompt injection
    safe_name = re.sub(r"[^\w\s\-']", "", name)[:80] or adm1_code[:40]

    gdp = country.gdp_per_capita
    context = (
        f"Province/State: {safe_name} in {country.name}. Country GDP/cap: ${gdp:,.0f}."
        if gdp else
        f"Province/State: {safe_name} in {country.name}."
    )

    briefing = province_agent.run_sync(context)
    record = ProvinceBriefingCache(adm1_code=cache_key, adm0_a3=adm0_a3, briefing=briefing.output.model_dump())
    db.add(record)
    db.commit()
    return briefing.output
