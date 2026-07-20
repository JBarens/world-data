"""
Downloads Natural Earth admin-1 and admin-2 shapefiles and converts to GeoJSON
with tighter simplification tolerance for smoother province outlines.
Run from project root: python scripts/regenerate_geojson.py
"""

import urllib.request
import zipfile
import json
import os
import io
import shapefile
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

TOLERANCE = 0.03  # degrees — was 0.15, much smoother now

ADMIN1_URL = "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip"
ADMIN2_URL = "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_2_counties.zip"

ADMIN1_OUT = "frontend/public/admin1-global.geojson"
ADMIN2_OUT = "frontend/public/admin2-us.geojson"

ADMIN1_KEEP = ["name", "name_en", "admin", "adm0_a3", "type_en", "iso_3166_2",
               "ne_id", "adm1_code", "latitude", "longitude", "scalerank"]
ADMIN2_KEEP = ["name", "name_en", "admin", "adm0_a3", "type_en", "ne_id",
               "adm2_code", "region", "region_cod", "fips", "latitude", "longitude"]


def download_zip(url):
    print(f"Downloading {url.split('/')[-1]}...")
    with urllib.request.urlopen(url) as r:
        return io.BytesIO(r.read())


def convert(zip_bytes, keep_fields, out_path, filter_fn=None):
    features = []
    with zipfile.ZipFile(zip_bytes) as z:
        shp_name = next(n for n in z.namelist() if n.endswith(".shp"))
        base = shp_name[:-4]
        shp = io.BytesIO(z.read(base + ".shp"))
        dbf = io.BytesIO(z.read(base + ".dbf"))

        sf = shapefile.Reader(shp=shp, dbf=dbf)
        fields = [f[0].lower() for f in sf.fields[1:]]

        for sr in sf.iterShapeRecords():
            props = dict(zip(fields, sr.record))
            if filter_fn and not filter_fn(props):
                continue
            try:
                geom = shape(sr.shape.__geo_interface__)
                geom = geom.simplify(TOLERANCE, preserve_topology=True)
                if geom.is_empty:
                    continue
                kept = {k: props.get(k) for k in keep_fields if k in props}
                features.append({"type": "Feature", "geometry": mapping(geom), "properties": kept})
            except Exception:
                continue

    print(f"  {len(features)} features → {out_path}")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))
    size_mb = os.path.getsize(out_path) / 1e6
    print(f"  File size: {size_mb:.1f} MB")


admin1_zip = download_zip(ADMIN1_URL)
convert(admin1_zip, ADMIN1_KEEP, ADMIN1_OUT)

admin2_zip = download_zip(ADMIN2_URL)
convert(admin2_zip, ADMIN2_KEEP, ADMIN2_OUT, filter_fn=lambda p: p.get("adm0_a3") == "USA")

print("Done.")
