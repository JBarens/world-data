import httpx
import json
from database import SessionLocal
from models import CountryData

INDICATORS = {
    "gdp_per_capita": "NY.GDP.PCAP.CD",
    "population": "SP.POP.TOTL",
    "hdi": "HD.HCI.OVRL",  # World Bank Human Capital Index (0-1 scale, close proxy for HDI)
    "gini": "SI.POV.GINI",
}


def fetch_indicator(indicator_code: str, mrv: int = 1) -> dict:
    url = f"https://api.worldbank.org/v2/country/all/indicator/{indicator_code}?format=json&per_page=300&mrv={mrv}"
    r = httpx.get(url, timeout=60)
    data = r.json()
    # World Bank returns most-recent-first; keep first non-null per country
    result = {}
    for item in data[1]:
        if item["value"] is not None and item["countryiso3code"] not in result:
            result[item["countryiso3code"]] = item["value"]
    return result


def run():
    gdp = fetch_indicator(INDICATORS["gdp_per_capita"])
    pop = fetch_indicator(INDICATORS["population"])
    gini = fetch_indicator(INDICATORS["gini"], mrv=5)  # look back 5 years for coverage
    try:
        hdi = fetch_indicator(INDICATORS["hdi"])
    except Exception as e:
        print(f"HDI fetch failed ({e}), skipping")
        hdi = {}

    # fetch country list for iso_numeric + name
    r = httpx.get("https://api.worldbank.org/v2/country?format=json&per_page=300", timeout=30)
    countries = r.json()[1]

    db = SessionLocal()
    count = 0
    for c in countries:
        if c["region"]["id"] == "NA":  # Skip aggregates
            continue
        iso3 = c["id"]
        existing = db.query(CountryData).filter_by(iso_alpha3=iso3).first()
        obj = existing or CountryData(iso_alpha3=iso3)
        obj.name = c["name"]
        obj.gdp_per_capita = gdp.get(iso3)
        obj.population = pop.get(iso3)
        obj.gini = gini.get(iso3)
        obj.hdi = hdi.get(iso3)
        obj.indicators = {}
        if not existing:
            db.add(obj)
        count += 1

    db.commit()
    db.close()
    print(f"Seeded {count} countries")


if __name__ == "__main__":
    run()
