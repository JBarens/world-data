from sqlalchemy.orm import Session
from pydantic import BaseModel
from pydantic_ai import Agent
import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from database import engine, get_db
from models import Base, CountryData

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
