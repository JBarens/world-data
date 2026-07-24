import httpx
import json
from database import SessionLocal
from models import CountryData

# Promoted to DB columns (filtered/sorted often)
CORE_INDICATORS = {
    "gdp_per_capita": "NY.GDP.PCAP.CD",
    "population": "SP.POP.TOTL",
    "gini": "SI.POV.GINI",
    "hdi": "HD.HCI.OVRL",
}

# Stored in indicators JSON blob
EXTRA_INDICATORS = {
    "life_expectancy": "SP.DYN.LE00.IN",
    "unemployment": "SL.UEM.TOTL.ZS",
    "internet_users_pct": "IT.NET.USER.ZS",
    "co2_per_capita": "EN.ATM.CO2E.PC",
    "fertility_rate": "SP.DYN.TFRT.IN",
    "urban_pct": "SP.URB.TOTL.IN.ZS",
    "health_exp_pct": "SH.XPD.CHEX.GD.ZS",
    "education_exp_pct": "SE.XPD.TOTL.GD.ZS",
    "military_exp_pct": "MS.MIL.XPND.GD.ZS",
    "inflation": "FP.CPI.TOTL.ZG",
    "forest_pct": "AG.LND.FRST.ZS",
    "electricity_access": "EG.ELC.ACCS.ZS",
    "renewable_pct": "EG.FEC.RNEW.ZS",
    "mortality_u5": "SH.DYN.MORT",
    "trade_pct": "NE.TRD.GNFS.ZS",
    "fdi_pct": "BX.KLT.DINV.WD.GD.ZS",
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
    gdp = fetch_indicator(CORE_INDICATORS["gdp_per_capita"])
    pop = fetch_indicator(CORE_INDICATORS["population"])
    gini = fetch_indicator(CORE_INDICATORS["gini"], mrv=5)
    try:
        hdi = fetch_indicator(CORE_INDICATORS["hdi"])
    except Exception as e:
        print(f"HDI fetch failed ({e}), skipping")
        hdi = {}

    # Fetch all extra indicators (skip silently on failure)
    extra_data: dict[str, dict] = {}
    for key, code in EXTRA_INDICATORS.items():
        try:
            extra_data[key] = fetch_indicator(code, mrv=3)
            print(f"  {key}: {len(extra_data[key])} countries")
        except Exception as e:
            print(f"  {key} failed: {e}")
            extra_data[key] = {}

    # Fetch country list for iso_numeric + name
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
        obj.indicators = {key: extra_data[key].get(iso3) for key in EXTRA_INDICATORS}
        if not existing:
            db.add(obj)
        count += 1

    db.commit()
    db.close()
    print(f"Seeded {count} countries")


if __name__ == "__main__":
    run()
