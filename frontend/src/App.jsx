import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const API = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

// ─── constants ────────────────────────────────────────────────────────────────

const METRICS = {
  // ── Economic ──────────────────────────────────────────────────────
  gdp_per_capita: {
    label: "GDP / Capita", group: "Economic",
    domain: [500, 80000], colors: ["#f7fcb9", "#31a354"],
    format: (v) => "$" + Math.round(v).toLocaleString(),
  },
  gini: {
    label: "Gini Coefficient", group: "Economic",
    domain: [25, 65], colors: ["#fee5d9", "#a50f15"],
    format: (v) => v.toFixed(1),
  },
  inflation: {
    label: "Inflation %", group: "Economic",
    domain: [-2, 30], colors: ["#deebf7", "#a50f15"],
    format: (v) => v.toFixed(1) + "%",
  },
  trade_pct: {
    label: "Trade % of GDP", group: "Economic",
    domain: [20, 200], colors: ["#edf8e9", "#005a32"],
    format: (v) => v.toFixed(1) + "%",
  },
  fdi_pct: {
    label: "FDI % of GDP", group: "Economic",
    domain: [-2, 20], colors: ["#e0ecf4", "#006d2c"],
    format: (v) => v.toFixed(2) + "%",
  },
  // ── Social ────────────────────────────────────────────────────────
  population: {
    label: "Population", group: "Social",
    domain: [100000, 1.4e9], colors: ["#deebf7", "#08519c"],
    format: (v) => Math.round(v).toLocaleString(),
    log: true, absolute: true,
  },
  life_expectancy: {
    label: "Life Expectancy", group: "Social",
    domain: [50, 85], colors: ["#fff7bc", "#d95f0e"],
    format: (v) => v.toFixed(1) + " yrs",
  },
  hdi: {
    label: "HDI", group: "Social",
    domain: [0.4, 0.95], colors: ["#ffeda0", "#006837"],
    format: (v) => v.toFixed(3),
  },
  fertility_rate: {
    label: "Fertility Rate", group: "Social",
    domain: [1, 7], colors: ["#fef0d9", "#b30000"],
    format: (v) => v.toFixed(2),
  },
  urban_pct: {
    label: "Urban Population %", group: "Social",
    domain: [10, 100], colors: ["#f2f0f7", "#54278f"],
    format: (v) => v.toFixed(1) + "%",
  },
  mortality_u5: {
    label: "Child Mortality ‰", group: "Social",
    domain: [2, 120], colors: ["#fff5f0", "#67000d"],
    format: (v) => v.toFixed(1),
  },
  unemployment: {
    label: "Unemployment %", group: "Social",
    domain: [1, 30], colors: ["#f0f9e8", "#084081"],
    format: (v) => v.toFixed(1) + "%",
  },
  internet_users_pct: {
    label: "Internet Users %", group: "Social",
    domain: [5, 100], colors: ["#eff3ff", "#08519c"],
    format: (v) => v.toFixed(1) + "%",
  },
  // ── Infrastructure ────────────────────────────────────────────────
  health_exp_pct: {
    label: "Health Exp % GDP", group: "Infrastructure",
    domain: [2, 18], colors: ["#f7fbff", "#08306b"],
    format: (v) => v.toFixed(1) + "%",
  },
  education_exp_pct: {
    label: "Education Exp % GDP", group: "Infrastructure",
    domain: [1, 10], colors: ["#f7fbff", "#2171b5"],
    format: (v) => v.toFixed(1) + "%",
  },
  electricity_access: {
    label: "Electricity Access %", group: "Infrastructure",
    domain: [30, 100], colors: ["#fff7bc", "#fd8d3c"],
    format: (v) => v.toFixed(1) + "%",
  },
  military_exp_pct: {
    label: "Military Exp % GDP", group: "Infrastructure",
    domain: [0.5, 8], colors: ["#fff5eb", "#7f2704"],
    format: (v) => v.toFixed(2) + "%",
  },
  // ── Environment ───────────────────────────────────────────────────
  co2_per_capita: {
    label: "CO₂ / Capita (t)", group: "Environment",
    domain: [0.1, 20], colors: ["#e5f5e0", "#a50f15"],
    format: (v) => v.toFixed(1) + " t",
    log: true,
  },
  forest_pct: {
    label: "Forest Coverage %", group: "Environment",
    domain: [1, 90], colors: ["#f7fcf5", "#005a32"],
    format: (v) => v.toFixed(1) + "%",
  },
  renewable_pct: {
    label: "Renewable Energy %", group: "Environment",
    domain: [5, 100], colors: ["#f7fcf5", "#238b45"],
    format: (v) => v.toFixed(1) + "%",
  },
};

const NO_DATA_COLOR = "#5a5a6a";
const MAX_COMPARE = 2;
const ADMIN1_ZOOM = 4; // province tier (global)
const FOCUSED_PROV_ZOOM = 2; // province tier (when country focused)
const ADMIN2_ZOOM = 6; // county/municipality tier (US)

// ─── helpers ──────────────────────────────────────────────────────────────────

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function metricColor(value, domain, colors, log = false) {
  if (value == null) return NO_DATA_COLOR;
  const v = log ? Math.log10(Math.max(1, value)) : value;
  const d0 = log ? Math.log10(domain[0]) : domain[0];
  const d1 = log ? Math.log10(domain[1]) : domain[1];
  const t = Math.min(1, Math.max(0, (v - d0) / (d1 - d0)));
  const c0 = parseInt(colors[0].slice(1), 16);
  const c1 = parseInt(colors[1].slice(1), 16);
  const r = lerp((c0 >> 16) & 0xff, (c1 >> 16) & 0xff, t);
  const g = lerp((c0 >> 8) & 0xff, (c1 >> 8) & 0xff, t);
  const b = lerp(c0 & 0xff, c1 & 0xff, t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function buildMatchExpression(countryData, metric) {
  const { domain, colors, log } = METRICS[metric];
  const expr = ["match", ["get", "iso_3166_1_alpha_3"]];
  for (const [iso, c] of Object.entries(countryData))
    expr.push(iso, metricColor(c[metric], domain, colors, log));
  expr.push(NO_DATA_COLOR);
  return expr;
}

function buildAdmin1MatchExpression(countryData, provinceData, metric) {
  const { domain, colors, log } = METRICS[metric];
  // Country-level fallback for all provinces without specific data
  const countryExpr = ["match", ["get", "adm0_a3"]];
  for (const [iso, c] of Object.entries(countryData))
    countryExpr.push(iso, metricColor(c[metric], domain, colors, log));
  countryExpr.push(NO_DATA_COLOR);

  const provEntries = Object.entries(provinceData).filter(([, p]) => p[metric] != null);
  if (!provEntries.length) return countryExpr;

  // Province-level outer match, country-level inner fallback
  const expr = ["match", ["get", "adm1_code"]];
  for (const [code, p] of provEntries)
    expr.push(code, metricColor(p[metric], domain, colors, log));
  expr.push(countryExpr);
  return expr;
}

function buildAdmin2MatchExpression(countyData, metric) {
  const { domain, colors, log } = METRICS[metric];
  const expr = ["match", ["get", "fips"]];
  for (const [fips, c] of Object.entries(countyData)) {
    if (c[metric] != null)
      expr.push(fips, metricColor(c[metric], domain, colors, log));
  }
  expr.push(NO_DATA_COLOR);
  return expr;
}

function bboxFromGeometry(geometry) {
  let mnLng = Infinity,
    mnLat = Infinity,
    mxLng = -Infinity,
    mxLat = -Infinity;
  const scan = (c) => {
    if (typeof c[0] === "number") {
      if (c[0] < mnLng) mnLng = c[0];
      if (c[0] > mxLng) mxLng = c[0];
      if (c[1] < mnLat) mnLat = c[1];
      if (c[1] > mxLat) mxLat = c[1];
    } else c.forEach(scan);
  };
  scan(geometry.coordinates);
  return [
    [mnLng, mnLat],
    [mxLng, mxLat],
  ];
}

async function fitToCountry(name, map) {
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(name)}.json?types=country&access_token=${mapboxgl.accessToken}`,
    );
    const json = await res.json();
    const feat = json.features?.[0];
    if (!feat) return;
    if (feat.bbox) {
      const [w, s, e, n] = feat.bbox;
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 60, duration: 900, maxZoom: 8 },
      );
    } else {
      map.flyTo({ center: feat.center, zoom: 6, duration: 900 });
    }
  } catch {
    /* silent */
  }
}

// ─── ui components ────────────────────────────────────────────────────────────

function StatBar({ value, metric }) {
  const { domain, colors, log } = METRICS[metric];
  if (value == null) return null;
  const color = metricColor(value, domain, colors, log);
  const v = log ? Math.log10(Math.max(1, value)) : value;
  const d0 = log ? Math.log10(domain[0]) : domain[0];
  const d1 = log ? Math.log10(domain[1]) : domain[1];
  const pct = Math.min(100, Math.max(0, ((v - d0) / (d1 - d0)) * 100));
  return (
    <div
      style={{
        height: 5,
        borderRadius: 3,
        background: "rgba(255,255,255,0.08)",
        marginTop: 5,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 3,
          transition: "width 0.4s",
        }}
      />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#555",
          textTransform: "uppercase",
          letterSpacing: 1.2,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div
      style={{
        padding: "7px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        fontSize: 13,
        display: "flex",
        justifyContent: "space-between",
      }}
    >
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value || "—"}</span>
    </div>
  );
}

function MetricRows({ data }) {
  const groups = [...new Set(Object.values(METRICS).map((m) => m.group))];
  return groups.map((group) => (
    <div key={group} style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#3a3a5a", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 4 }}>
        {group}
      </div>
      {Object.entries(METRICS)
        .filter(([, m]) => m.group === group)
        .map(([key, { label, format }]) => {
          const val = data?.[key];
          return (
            <div key={key} style={{ padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#777" }}>{label}</span>
                <span style={{ fontWeight: 500, color: val != null ? "#eee" : "#444" }}>
                  {val != null ? format(val) : "—"}
                </span>
              </div>
              {val != null && <StatBar value={val} metric={key} />}
            </div>
          );
        })}
    </div>
  ));
}

function CompareSection({ title, compared, onRemove, referenceData }) {
  if (!compared.length) return null;
  return (
    <Section title={`${title} (${compared.length})`}>
      {compared.map((c) => (
        <div key={c.id} style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
              {c.parentName && (
                <div style={{ fontSize: 11, color: "#555" }}>
                  {c.parentName}
                </div>
              )}
            </div>
            <button
              onClick={() => onRemove(c.id)}
              style={{
                background: "none",
                border: "none",
                color: "#555",
                cursor: "pointer",
                fontSize: 16,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
          {Object.entries(METRICS).map(([key, { label, format }]) => {
            const myVal = referenceData?.[key];
            const theirVal = c.data?.[key];
            const diff =
              myVal != null && theirVal != null ? myVal - theirVal : null;
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  padding: "2px 0",
                  color: "#888",
                }}
              >
                <span>{label}</span>
                <span style={{ color: theirVal != null ? "#ddd" : "#444" }}>
                  {theirVal != null ? format(theirVal) : "—"}
                  {diff != null && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 11,
                        color: diff > 0 ? "#5d5" : "#d55",
                      }}
                    >
                      ({diff > 0 ? "+" : ""}
                      {format(Math.abs(diff))})
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </Section>
  );
}

function Panel({
  selectedStack,
  compared,
  regionCompared,
  focusedCountry,
  briefing,
  provinceBriefing,
  countryDataMap,
  onClose,
  onPop,
  onAddCompare,
  onRemoveCompare,
  onAddRegionCompare,
  onRemoveRegionCompare,
}) {
  if (!selectedStack.length) return null;
  const selected = selectedStack[selectedStack.length - 1];
  const canGoBack = selectedStack.length > 1;

  const isCountry = selected.type === "country";
  const isRegion = selected.type === "region";
  const isMunicipality = selected.type === "municipality";
  const isSubregion = isRegion || isMunicipality;

  const alreadyInComp = compared.some((c) => c.id === selected.id);
  const alreadyInRComp = regionCompared.some((c) => c.id === selected.id);
  const canAddComp = compared.length < MAX_COMPARE;
  const canAddRComp = regionCompared.length < MAX_COMPARE;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 320,
        height: "100vh",
        background: "rgba(10,10,20,0.93)",
        color: "#fff",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        backdropFilter: "blur(10px)",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.6)",
        overflowY: "auto",
      }}
    >
      {/* header */}
      <div
        style={{
          padding: "20px 20px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {canGoBack && (
            <button
              onClick={onPop}
              style={{
                background: "none",
                border: "none",
                color: "#555",
                cursor: "pointer",
                fontSize: 12,
                padding: 0,
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              ← {selectedStack[selectedStack.length - 2]?.name}
            </button>
          )}
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {selected.name}
          </h2>
          {isCountry && (
            <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
              {selected.iso}
            </div>
          )}
          {isRegion && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
              {selected.typeLabel} · {selected.parentName}
            </div>
          )}
          {isMunicipality && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
              {selected.typeLabel} · {selected.stateName} ·{" "}
              {selected.parentName}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#666",
            fontSize: 22,
            cursor: "pointer",
            padding: 0,
            lineHeight: 1,
            marginLeft: 12,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* focused badge */}
      {focusedCountry && isCountry && (
        <div
          style={{
            margin: "0 20px 12px",
            padding: "6px 10px",
            borderRadius: 6,
            background: "rgba(255,255,255,0.05)",
            fontSize: 11,
            color: "#666",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Province view · click any region</span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#444",
              cursor: "pointer",
              fontSize: 11,
              padding: 0,
            }}
          >
            Esc
          </button>
        </div>
      )}

      <div style={{ padding: "0 20px 24px", flex: 1 }}>
        {/* stats */}
        {isCountry && (
          <Section title="Statistics">
            <MetricRows data={selected.data} />
          </Section>
        )}

        {isSubregion && (
          <>
            <Section title={isMunicipality ? "County" : "Region"}>
              {isRegion && (
                <StatRow label="Country" value={selected.parentName} />
              )}
              {isMunicipality && (
                <StatRow label="Country" value={selected.parentName} />
              )}
              {isMunicipality && (
                <StatRow label="State" value={selected.stateName} />
              )}
              <StatRow label="Type" value={selected.typeLabel} />
              {selected.code && <StatRow label="Code" value={selected.code} />}
            </Section>
            {(() => {
              const countryFallback = selected.countryData ?? countryDataMap?.[selected.adm0_a3];
              const prov = selected.provinceData;
              // Build merged: province values win; country values only for rate/index metrics, never absolute
              const merged = Object.fromEntries(
                Object.keys(METRICS).map((key) => {
                  const provVal = prov?.[key];
                  const countryVal = countryFallback?.[key];
                  // Only fall back to country for per-capita/rate metrics, not totals (population)
                  const absolute = METRICS[key].absolute;
                  return [key, provVal ?? (absolute ? undefined : countryVal)];
                })
              );
              const hasProvData = prov && Object.values(prov).some((v) => v != null);
              const sourceLabel = hasProvData
                ? isMunicipality ? "Census 2022 · County-level" : "Subnational sources · State/Province-level"
                : "World Bank · Country-level";
              return (
                <Section title="Statistics">
                  <MetricRows data={merged} />
                  <div style={{ fontSize: 10, color: "#444", marginTop: 4 }}>{sourceLabel}</div>
                </Section>
              );
            })()}

            <Section title="AI Briefing">
              {!provinceBriefing ? (
                <div style={{ fontSize: 12, color: "#555" }}>Loading briefing…</div>
              ) : (
                <>
                  {provinceBriefing.risk_level != null && (
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                      Risk level:{" "}
                      <span style={{
                        color: provinceBriefing.risk_level <= 2 ? "#31a354" : provinceBriefing.risk_level <= 3 ? "#f0a500" : "#a50f15",
                        fontWeight: 600,
                      }}>
                        {["", "Low", "Low-Medium", "Medium", "Medium-High", "High"][provinceBriefing.risk_level] ?? provinceBriefing.risk_level}
                      </span>
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6, marginBottom: 10 }}>
                    {provinceBriefing.summary}
                  </div>
                  {provinceBriefing.key_factors?.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#777", lineHeight: 1.7 }}>
                      {provinceBriefing.key_factors.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  )}
                </>
              )}
            </Section>
          </>
        )}

        {/* country compare */}
        {isCountry && (
          <div style={{ marginBottom: 20 }}>
            {!alreadyInComp && canAddComp && (
              <button
                onClick={() =>
                  onAddCompare({ ...selected, data: selected.data })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                + Compare
              </button>
            )}
            {alreadyInComp && (
              <button
                onClick={() => onRemoveCompare(selected.id)}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,80,80,0.3)",
                  background: "rgba(255,60,60,0.06)",
                  color: "#f88",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Remove from compare
              </button>
            )}
          </div>
        )}

        {/* region compare */}
        {isSubregion && (
          <div style={{ marginBottom: 20 }}>
            {!alreadyInRComp && canAddRComp && (
              <button
                onClick={() =>
                  onAddRegionCompare({
                    ...selected,
                    data: selected.countryData,
                    parentName: selected.parentName,
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                + Compare region
              </button>
            )}
            {alreadyInRComp && (
              <button
                onClick={() => onRemoveRegionCompare(selected.id)}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,80,80,0.3)",
                  background: "rgba(255,60,60,0.06)",
                  color: "#f88",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Remove from compare
              </button>
            )}
          </div>
        )}

        {/* AI country briefing */}
        {isCountry && (
          <Section title="AI Briefing">
            {!briefing ? (
              <div style={{ fontSize: 12, color: "#555" }}>
                Loading briefing…
              </div>
            ) : (
              <>
                {briefing.risk_level != null && (
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                    Risk level:{" "}
                    <span
                      style={{
                        color:
                          briefing.risk_level <= 2
                            ? "#31a354"
                            : briefing.risk_level <= 3
                              ? "#f0a500"
                              : "#a50f15",
                        fontWeight: 600,
                      }}
                    >
                      {[
                        "",
                        "Low",
                        "Low-Medium",
                        "Medium",
                        "Medium-High",
                        "High",
                      ][briefing.risk_level] ?? briefing.risk_level}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    fontSize: 12,
                    color: "#aaa",
                    lineHeight: 1.6,
                    marginBottom: 10,
                  }}
                >
                  {briefing.summary}
                </div>
                {briefing.key_factors?.length > 0 && (
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 16,
                      fontSize: 12,
                      color: "#777",
                      lineHeight: 1.7,
                    }}
                  >
                    {briefing.key_factors.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Section>
        )}

        <CompareSection
          title="Comparing countries"
          compared={compared}
          onRemove={onRemoveCompare}
          referenceData={isCountry ? selected.data : null}
        />
        <CompareSection
          title="Comparing regions"
          compared={regionCompared}
          onRemove={onRemoveRegionCompare}
          referenceData={isSubregion ? selected.countryData : null}
        />
        <div style={{ fontSize: 10, color: "#333", marginTop: 16, textAlign: "right" }}>
          Sources: World Bank · BEA · UNDP
        </div>
      </div>
    </div>
  );
}

function SearchBar({ countryData, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setResults(
      Object.values(countryData.current)
        .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 6),
    );
  };

  const pick = (c) => {
    setQuery(c.name);
    setResults([]);
    onSelect(c);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        left: 20,
        zIndex: 10,
        width: 220,
      }}
    >
      <input
        value={query}
        onChange={handleChange}
        placeholder="Search country…"
        style={{
          width: "100%",
          padding: "7px 12px",
          borderRadius: 8,
          border: "none",
          background: "rgba(0,0,0,0.65)",
          color: "#fff",
          fontSize: 13,
          backdropFilter: "blur(6px)",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {results.length > 0 && (
        <div
          style={{
            marginTop: 4,
            background: "rgba(10,10,20,0.95)",
            borderRadius: 8,
            overflow: "hidden",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          }}
        >
          {results.map((c) => (
            <div
              key={c.iso_alpha3}
              onClick={() => pick(c)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 13,
                color: "#fff",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.08)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── app ──────────────────────────────────────────────────────────────────────

export default function App() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const countryDataRef = useRef({});
  const mapLoaded = useRef(false);
  const focusedCountryRef = useRef(null);
  const focusedProvinceRef = useRef(null);
  const briefingCacheRef = useRef({});
  const provinceBriefingCacheRef = useRef({});
  const provinceDataRef = useRef({});
  const countyDataRef = useRef({});

  const [metric, setMetric] = useState("gdp_per_capita");
  const metricRef = useRef("gdp_per_capita");
  const [countryDataMap, setCountryDataMap] = useState({});
  const [selectedStack, setSelectedStack] = useState([]);
  const [compared, setCompared] = useState([]);
  const [regionCompared, setRegionCompared] = useState([]);
  const [focusedCountry, setFocusedCountry] = useState(null);
  const [focusedProvince, setFocusedProvince] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [provinceBriefing, setProvinceBriefing] = useState(null);

  const selected = selectedStack[selectedStack.length - 1] ?? null;
  const pushSel = useCallback(
    (item) => setSelectedStack((p) => [...p, item]),
    [],
  );
  const popSel = useCallback(() => setSelectedStack((p) => p.slice(0, -1)), []);
  const clearSel = useCallback(() => setSelectedStack([]), []);
  const replaceSel = useCallback((item) => setSelectedStack([item]), []);

  const applyMetric = useCallback((m) => {
    if (!mapLoaded.current || !Object.keys(countryDataRef.current).length)
      return;
    const map = mapInstance.current;
    map.setPaintProperty("country-fills", "fill-color", buildMatchExpression(countryDataRef.current, m));
    map.setPaintProperty("admin1-fills", "fill-color", buildAdmin1MatchExpression(countryDataRef.current, provinceDataRef.current, m));
    if (Object.keys(countyDataRef.current).length)
      map.setPaintProperty("admin2-fills", "fill-color", buildAdmin2MatchExpression(countyDataRef.current, m));
  }, []);

  const clearFocus = useCallback(() => {
    clearSel();
    setFocusedCountry(null);
    setFocusedProvince(null);
  }, [clearSel]);

  const addCompare = (c) =>
    setCompared((p) => (p.length < MAX_COMPARE ? [...p, c] : p));
  const removeCompare = (id) =>
    setCompared((p) => p.filter((c) => c.id !== id));
  const addRComp = (c) =>
    setRegionCompared((p) => (p.length < MAX_COMPARE ? [...p, c] : p));
  const removeRComp = (id) =>
    setRegionCompared((p) => p.filter((c) => c.id !== id));

  // sync focusedCountry → Mapbox layers
  useEffect(() => {
    if (!mapLoaded.current) return;
    focusedCountryRef.current = focusedCountry;
    const map = mapInstance.current;

    if (focusedCountry) {
      map.setFilter("world-dim", [
        "all",
        ["!=", ["get", "iso_3166_1_alpha_3"], focusedCountry],
        ["!=", ["get", "iso_3166_1_alpha_3"], "ATA"],
      ]);
      map.setPaintProperty("world-dim", "fill-opacity", 0.55);
      map.setFilter("admin1-focus-lines", [
        "==",
        ["get", "adm0_a3"],
        focusedCountry,
      ]);
      // Province borders + hitbox visible at lower zoom for focused country
      map.setPaintProperty("admin1-lines", "line-opacity", [
        "case",
        ["==", ["get", "adm0_a3"], focusedCountry],
        [
          "interpolate",
          ["linear"],
          ["zoom"],
          FOCUSED_PROV_ZOOM,
          0,
          FOCUSED_PROV_ZOOM + 1,
          0.7,
        ],
        [
          "interpolate",
          ["linear"],
          ["zoom"],
          ADMIN1_ZOOM - 0.5,
          0,
          ADMIN1_ZOOM + 0.5,
          0.5,
        ],
      ]);
      map.setPaintProperty("admin1-fills", "fill-opacity", [
        "case",
        ["==", ["get", "adm0_a3"], focusedCountry],
        0.65, // focused country provinces colored + hittable
        0,    // hide other countries' provinces (world-dim handles visual dimming of country-fills)
      ]);
    } else {
      map.setPaintProperty("world-dim", "fill-opacity", 0);
      map.setFilter("world-dim", [
        "==",
        ["get", "iso_3166_1_alpha_3"],
        "__none__",
      ]);
      map.setFilter("admin1-focus-lines", [
        "==",
        ["get", "adm0_a3"],
        "__none__",
      ]);
      map.setPaintProperty("admin1-lines", "line-opacity", [
        "interpolate",
        ["linear"],
        ["zoom"],
        ADMIN1_ZOOM - 0.5,
        0,
        ADMIN1_ZOOM + 0.5,
        0.5,
      ]);
      map.setPaintProperty("admin1-fills", "fill-opacity", [
        "interpolate", ["linear"], ["zoom"], ADMIN1_ZOOM - 0.5, 0, ADMIN1_ZOOM + 0.5, 0.65,
      ]);
    }
  }, [focusedCountry]);

  // sync focusedProvince → admin1-dim layer
  useEffect(() => {
    if (!mapLoaded.current) return;
    focusedProvinceRef.current = focusedProvince;
    const map = mapInstance.current;
    if (focusedProvince) {
      map.setFilter("admin1-dim", [
        "all",
        ["==", ["get", "adm0_a3"], focusedProvince.adm0_a3],
        ["!=", ["get", "adm1_code"], focusedProvince.adm1_code],
      ]);
      map.setPaintProperty("admin1-dim", "fill-opacity", 0.6);
      // counties hittable at province-focus zoom
      map.setPaintProperty("admin2-fills", "fill-opacity", [
        "interpolate",
        ["linear"],
        ["zoom"],
        FOCUSED_PROV_ZOOM,
        0,
        FOCUSED_PROV_ZOOM + 1,
        0.7,
      ]);
    } else {
      map.setFilter("admin1-dim", ["==", ["get", "adm0_a3"], "__none__"]);
      map.setPaintProperty("admin1-dim", "fill-opacity", 0);
      map.setPaintProperty("admin2-fills", "fill-opacity", [
        "interpolate",
        ["linear"],
        ["zoom"],
        ADMIN2_ZOOM - 0.5,
        0,
        ADMIN2_ZOOM + 0.5,
        0.7,
      ]);
    }
  }, [focusedProvince]);

  // fetch AI briefing when country is selected (with cache)
  useEffect(() => {
    if (!focusedCountry) { setBriefing(null); return; }
    if (briefingCacheRef.current[focusedCountry]) {
      setBriefing(briefingCacheRef.current[focusedCountry]);
      return;
    }
    setBriefing(null);
    fetch(`${API}/countries/${focusedCountry}/briefing`)
      .then((r) => r.json())
      .then((b) => { briefingCacheRef.current[focusedCountry] = b; setBriefing(b); })
      .catch(() =>
        setBriefing({
          summary: "Briefing unavailable.",
          key_factors: [],
          risk_level: null,
        }),
      );
  }, [focusedCountry]);

  // fetch province briefing when a region is selected
  useEffect(() => {
    if (selected?.type !== "region" || !selected.adm1_code) { setProvinceBriefing(null); return; }
    const key = selected.adm1_code;
    if (provinceBriefingCacheRef.current[key]) { setProvinceBriefing(provinceBriefingCacheRef.current[key]); return; }
    setProvinceBriefing(null);
    fetch(`${API}/provinces/${selected.adm0_a3}/${encodeURIComponent(key)}/briefing?name=${encodeURIComponent(selected.name)}`)
      .then((r) => r.json())
      .then((b) => { provinceBriefingCacheRef.current[key] = b; setProvinceBriefing(b); })
      .catch(() => setProvinceBriefing({ summary: "Briefing unavailable.", key_factors: [], risk_level: null }));
  }, [selected?.adm1_code]); // eslint-disable-line react-hooks/exhaustive-deps

  // update risk overlay when briefing arrives
  useEffect(() => {
    if (!mapLoaded.current) return;
    const map = mapInstance.current;
    const RISK_COLORS = { 1: "#31a354", 2: "#78c679", 3: "#f0a500", 4: "#d94701", 5: "#a50f15" };
    if (briefing?.risk_level && focusedCountry) {
      map.setFilter("country-risk-overlay", ["==", ["get", "iso_3166_1_alpha_3"], focusedCountry]);
      map.setPaintProperty("country-risk-overlay", "fill-color", RISK_COLORS[briefing.risk_level] ?? "#888");
    } else {
      map.setFilter("country-risk-overlay", ["==", ["get", "iso_3166_1_alpha_3"], "__none__"]);
    }
  }, [briefing, focusedCountry]);

  // clear province focus when navigating back to country
  useEffect(() => {
    if (selected?.type !== "region" && selected?.type !== "municipality") {
      setFocusedProvince(null);
    }
  }, [selected]);

  // escape key
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") clearFocus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearFocus]);

  useEffect(() => {
    metricRef.current = metric;
    applyMetric(metric);
  }, [metric, applyMetric]);

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [0, 20],
      zoom: 1.8,
      projection: "globe",
      renderWorldCopies: false,
    });
    mapInstance.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    fetch(`${API}/countries`)
      .then((r) => r.json())
      .then((data) => {
        data.forEach((c) => (countryDataRef.current[c.iso_alpha3] = c));
        setCountryDataMap({ ...countryDataRef.current });
        applyMetric(metric);
      })
      .catch((err) => console.error("fetch failed:", err));

    fetch("/province-stats.json")
      .then((r) => r.json())
      .then((data) => {
        provinceDataRef.current = data;
        applyMetric(metric);
      })
      .catch(() => {});

    fetch("/county-stats.json")
      .then((r) => r.json())
      .then((data) => {
        countyDataRef.current = data;
        applyMetric(metric);
      })
      .catch(() => {});

    map.on("load", () => {
      // ── country ────────────────────────────────────────────────────────────
      map.addSource("countries", {
        type: "vector",
        url: "mapbox://mapbox.country-boundaries-v1",
      });

      map.addLayer({
        id: "country-fills",
        type: "fill",
        source: "countries",
        "source-layer": "country_boundaries",
        filter: ["!=", ["get", "iso_3166_1_alpha_3"], "ATA"],
        paint: {
          "fill-color": "#444",
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], ADMIN1_ZOOM - 0.5, 0.78, ADMIN1_ZOOM + 1, 0.2],
        },
      });

      map.addLayer({
        id: "world-dim",
        type: "fill",
        source: "countries",
        "source-layer": "country_boundaries",
        filter: ["==", ["get", "iso_3166_1_alpha_3"], "__none__"],
        paint: { "fill-color": "#000000", "fill-opacity": 0 },
      });

      // risk level colour overlay for focused country
      map.addLayer({
        id: "country-risk-overlay",
        type: "fill",
        source: "countries",
        "source-layer": "country_boundaries",
        filter: ["==", ["get", "iso_3166_1_alpha_3"], "__none__"],
        paint: { "fill-color": "#888888", "fill-opacity": 0.28 },
      });

      map.addLayer({
        id: "country-hover",
        type: "fill",
        source: "countries",
        "source-layer": "country_boundaries",
        filter: ["!=", ["get", "iso_3166_1_alpha_3"], "ATA"],
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.25, 0],
        },
      });

      map.addLayer({
        id: "country-borders",
        type: "line",
        source: "countries",
        "source-layer": "country_boundaries",
        filter: ["!=", ["get", "iso_3166_1_alpha_3"], "ATA"],
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 6, 1.5],
          "line-opacity": 0.5,
        },
      });

      // ── admin-1: provinces for all 251 countries ───────────────────────────
      map.addSource("admin1", {
        type: "geojson",
        data: "/admin1-global.geojson",
        generateId: true,
        tolerance: 0.1,
        buffer: 4,
      });

      map.addLayer({
        id: "admin1-fills",
        type: "fill",
        source: "admin1",
        paint: {
          "fill-color": NO_DATA_COLOR,
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], ADMIN1_ZOOM - 0.5, 0, ADMIN1_ZOOM + 0.5, 0.65],
        },
      });

      map.addLayer({
        id: "admin1-dim",
        type: "fill",
        source: "admin1",
        filter: ["==", ["get", "adm0_a3"], "__none__"],
        paint: { "fill-color": "#000000", "fill-opacity": 0 },
      });

      map.addLayer({
        id: "admin1-hover",
        type: "fill",
        source: "admin1",
        paint: {
          "fill-color": "#7ec8e3",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.35,
            0,
          ],
        },
      });

      map.addLayer({
        id: "admin1-lines",
        type: "line",
        source: "admin1",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "rgba(255,255,255,0.45)",
          "line-width": ["interpolate", ["linear"], ["zoom"], ADMIN1_ZOOM, 0.5, 8, 1.5, 12, 2],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], ADMIN1_ZOOM - 0.5, 0, ADMIN1_ZOOM + 0.5, 0.6],
          "line-blur": 1,
        },
      });

      // bright borders for focused country
      map.addLayer({
        id: "admin1-focus-lines",
        type: "line",
        source: "admin1",
        filter: ["==", ["get", "adm0_a3"], "__none__"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "rgba(255,255,255,0.85)", "line-width": 1.8, "line-blur": 0.3 },
      });

      // bright border on hovered province
      map.addLayer({
        id: "admin1-hover-border",
        type: "line",
        source: "admin1",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": 2.5,
          "line-blur": 0.2,
          "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0],
        },
      });

      // ── admin-2: US counties ───────────────────────────────────────────────
      map.addSource("admin2", {
        type: "geojson",
        data: "/admin2-us.geojson",
        generateId: true,
        tolerance: 0.1,
        buffer: 4,
      });

      map.addLayer({
        id: "admin2-fills",
        type: "fill",
        source: "admin2",
        paint: {
          "fill-color": NO_DATA_COLOR,
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            ADMIN2_ZOOM - 0.5,
            0,
            ADMIN2_ZOOM + 0.5,
            0.7,
          ],
        },
      });

      map.addLayer({
        id: "admin2-hover",
        type: "fill",
        source: "admin2",
        paint: {
          "fill-color": "#f0a500",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.3,
            0,
          ],
        },
      });

      map.addLayer({
        id: "admin2-lines",
        type: "line",
        source: "admin2",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "rgba(255,220,100,0.55)",
          "line-width": ["interpolate", ["linear"], ["zoom"], ADMIN2_ZOOM, 0.4, 10, 1.2],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], ADMIN2_ZOOM - 0.5, 0, ADMIN2_ZOOM + 0.5, 1],
          "line-blur": 0.3,
        },
      });

      map.addLayer({
        id: "admin2-hover-border",
        type: "line",
        source: "admin2",
        paint: {
          "line-color": "#f0a500",
          "line-width": 2,
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            1,
            0,
          ],
        },
      });

      // ── terrain + fog ──────────────────────────────────────────────────────
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 2.5 });

      map.getStyle().layers.forEach((layer) => {
        if (
          ["road", "bridge", "poi", "transit", "tunnel"].some((k) =>
            layer.id.includes(k),
          )
        )
          map.setLayoutProperty(layer.id, "visibility", "none");
      });
      [
        "admin-0-boundary",
        "admin-0-boundary-disputed",
        "admin-0-boundary-bg",
        "admin-1-boundary",
        "admin-1-boundary-bg",
      ].forEach((l) => {
        if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", "none");
      });

      map.setFog({
        color: "rgb(186, 210, 235)",
        "high-color": "rgb(36, 92, 223)",
        "horizon-blend": 0.02,
        "space-color": "rgb(11, 11, 25)",
        "star-intensity": 0.6,
      });

      mapLoaded.current = true;
      applyMetric(metric);

      // ── unified interaction ────────────────────────────────────────────────
      const tooltip = document.getElementById("tooltip");
      let hId1 = null,
        hId2 = null,
        hIdC = null; // hovered feature IDs

      function showTooltip(e, lines) {
        tooltip.style.display = "block";
        tooltip.style.left = e.originalEvent.pageX + 14 + "px";
        tooltip.style.top = e.originalEvent.pageY - 32 + "px";
        const nodes = [];
        lines.forEach((line, i) => {
          if (i > 0) nodes.push(document.createElement("br"));
          const s = Object.assign(document.createElement("span"), {
            textContent: line.text ?? line,
          });
          if (line.style) s.style.cssText = line.style;
          nodes.push(s);
        });
        tooltip.replaceChildren(...nodes);
      }
      const hideTooltip = () => {
        tooltip.style.display = "none";
      };

      const setHov = (src, layer, id, val) => {
        const target =
          layer === "countries"
            ? { source: src, sourceLayer: "country_boundaries", id }
            : { source: src, id };
        map.setFeatureState(target, { hover: val });
      };

      function clearHover() {
        if (hIdC != null) {
          setHov("countries", "countries", hIdC, false);
          hIdC = null;
        }
        if (hId1 != null) {
          setHov("admin1", null, hId1, false);
          hId1 = null;
        }
        if (hId2 != null) {
          setHov("admin2", null, hId2, false);
          hId2 = null;
        }
      }

      function clearHovCountry() {
        if (hIdC != null) {
          setHov("countries", "countries", hIdC, false);
          hIdC = null;
        }
      }
      function clearHovAdmin1() {
        if (hId1 != null) {
          setHov("admin1", null, hId1, false);
          hId1 = null;
        }
      }
      function clearHovAdmin2() {
        if (hId2 != null) {
          setHov("admin2", null, hId2, false);
          hId2 = null;
        }
      }

      // ── unified mousemove ──────────────────────────────────────────────────
      map.on("mousemove", (e) => {
        const zoom = map.getZoom();
        const focused = focusedCountryRef.current;

        // Tier 3: US county hover
        const a2Feats = map.queryRenderedFeatures(e.point, {
          layers: ["admin2-fills"],
        });
        const a2 = a2Feats[0];
        if (a2 && zoom >= ADMIN2_ZOOM) {
          const p = a2.properties;
          const cStat = countyDataRef.current[p.fips];
          const { label, format } = METRICS[metricRef.current];
          const val = cStat?.[metricRef.current];
          map.getCanvas().style.cursor = "pointer";
          showTooltip(e, [
            { text: p.name_en || p.name, style: "font-weight:700" },
            { text: (p.region || "") + " · County", style: "color:#aaa;font-size:11px" },
            { text: `${label}: ${val != null ? format(val) : "—"}`, style: "color:#ccc;font-size:11px" },
          ]);
          clearHovCountry();
          clearHovAdmin1();
          if (hId2 !== a2.id) {
            clearHovAdmin2();
            hId2 = a2.id;
            setHov("admin2", null, hId2, true);
          }
          return;
        }
        clearHovAdmin2();

        // Tier 2: Province hover
        const a1Feats = map.queryRenderedFeatures(e.point, {
          layers: ["admin1-fills"],
        });
        const a1 = a1Feats[0];
        if (a1) {
          const isFocused = focused === a1.properties.adm0_a3;
          const threshold = isFocused ? FOCUSED_PROV_ZOOM : ADMIN1_ZOOM;
          if (zoom >= threshold) {
            const p = a1.properties;
            const pStat = provinceDataRef.current[p.adm1_code];
            const { label, format } = METRICS[metricRef.current];
            const val = pStat?.[metricRef.current] ?? countryDataRef.current[p.adm0_a3]?.[metricRef.current];
            map.getCanvas().style.cursor = "pointer";
            showTooltip(e, [
              { text: p.name_en || p.name, style: "font-weight:700" },
              { text: p.admin || "", style: "color:#aaa;font-size:11px" },
              { text: `${label}: ${val != null ? format(val) : "—"}`, style: "color:#ccc;font-size:11px" },
            ]);
            clearHovCountry();
            if (hId1 !== a1.id) {
              clearHovAdmin1();
              hId1 = a1.id;
              setHov("admin1", null, hId1, true);
            }
            return;
          }
        }
        clearHovAdmin1();

        // Tier 1: Country hover
        const cFeats = map.queryRenderedFeatures(e.point, {
          layers: ["country-fills"],
        });
        const ct = cFeats[0];
        if (ct && zoom < ADMIN1_ZOOM) {
          const iso = ct.properties.iso_3166_1_alpha_3;
          const d = countryDataRef.current[iso];
          const { label, format } = METRICS[metricRef.current];
          const val = d?.[metricRef.current];
          map.getCanvas().style.cursor = "pointer";
          showTooltip(e, [
            { text: ct.properties.name_en, style: "font-weight:700" },
            { text: `${label}: ${val != null ? format(val) : "—"}`, style: "color:#ccc;font-size:11px" },
          ]);
          if (hIdC !== ct.id) {
            clearHovCountry();
            hIdC = ct.id;
            setHov("countries", "countries", hIdC, true);
          }
          return;
        }
        clearHovCountry();

        // Nothing
        map.getCanvas().style.cursor = "";
        hideTooltip();
      });

      map.on("mouseleave", () => {
        map.getCanvas().style.cursor = "";
        hideTooltip();
        clearHover();
      });

      map.on("zoom", () => {
        if (map.getZoom() >= ADMIN1_ZOOM) clearHovCountry();
        if (map.getZoom() < ADMIN2_ZOOM) clearHovAdmin2();
      });

      // ── unified click ──────────────────────────────────────────────────────
      map.on("click", (e) => {
        const zoom = map.getZoom();
        const focused = focusedCountryRef.current;

        // Tier 3: US county click
        const a2Feats = map.queryRenderedFeatures(e.point, {
          layers: ["admin2-fills"],
        });
        const a2 = a2Feats[0];
        if (a2 && zoom >= ADMIN2_ZOOM) {
          const p = a2.properties;
          // Check if county is in a different state than the currently focused one
          const stateF = map.queryRenderedFeatures(e.point, { layers: ["admin1-fills"] })[0];
          const currentProv = focusedProvinceRef.current;
          const sameState = stateF && currentProv && stateF.properties.adm1_code === currentProv.adm1_code;
          if (stateF && !sameState) {
            const sp = stateF.properties;
            setFocusedProvince({ adm1_code: sp.adm1_code, name: sp.name_en || sp.name, adm0_a3: sp.adm0_a3 });
            map.fitBounds(bboxFromGeometry(stateF.geometry), { padding: 60, duration: 900, maxZoom: 10 });
          } else {
            map.fitBounds(bboxFromGeometry(a2.geometry), { padding: 40, duration: 900, maxZoom: 12 });
          }
          pushSel({
            type: "municipality",
            id: p.ne_id || p.fips || p.name,
            name: p.name_en || p.name,
            typeLabel: p.type_en || "County",
            parentName: "United States",
            stateName: p.region || "",
            code: p.adm2_code || p.fips,
            countryData: countryDataRef.current["USA"],
            provinceData: countyDataRef.current[p.fips],
          });
          return;
        }

        // Tier 2: Province click (only when focused on that country, OR at province zoom globally)
        const a1Feats = map.queryRenderedFeatures(e.point, {
          layers: ["admin1-fills"],
        });
        const a1 = a1Feats[0];
        if (a1) {
          const isFocused = focused === a1.properties.adm0_a3;
          const threshold = isFocused ? FOCUSED_PROV_ZOOM : ADMIN1_ZOOM;
          if (zoom >= threshold && isFocused) {
            const p = a1.properties;
            setFocusedProvince({
              adm1_code: p.adm1_code,
              name: p.name_en || p.name,
              adm0_a3: p.adm0_a3,
            });
            map.fitBounds(bboxFromGeometry(a1.geometry), {
              padding: 60,
              duration: 900,
              maxZoom: 10,
            });
            pushSel({
              type: "region",
              id: p.ne_id || p.adm1_code || p.name,
              name: p.name_en || p.name,
              typeLabel: p.type_en || "Region",
              parentName: p.admin,
              code: p.iso_3166_2,
              adm1_code: p.adm1_code,
              adm0_a3: p.adm0_a3,
              countryData: countryDataRef.current[p.adm0_a3],
              provinceData: provinceDataRef.current[p.adm1_code],
            });
            return;
          }
        }

        // Tier 1: Country click (any zoom — Vatican fix: always reachable)
        const cFeats = map.queryRenderedFeatures(e.point, {
          layers: ["country-fills"],
        });
        const ct = cFeats[0];
        if (ct) {
          const iso = ct.properties.iso_3166_1_alpha_3;
          const name = ct.properties.name_en;
          const alreadyFocused = focused === iso;
          setFocusedCountry(iso);
          replaceSel({
            type: "country",
            id: iso,
            name,
            iso,
            data: countryDataRef.current[iso],
          });
          if (!alreadyFocused) fitToCountry(name, map);
        }
      });
    });

    return () => map.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchSelect = useCallback(
    (c) => {
      setFocusedCountry(c.iso_alpha3);
      replaceSel({
        type: "country",
        id: c.iso_alpha3,
        name: c.name,
        iso: c.iso_alpha3,
        data: countryDataRef.current[c.iso_alpha3],
      });
      if (mapInstance.current) fitToCountry(c.name, mapInstance.current);
    },
    [replaceSel],
  );

  return (
    <>
      <div ref={mapRef} style={{ width: "100vw", height: "100vh" }} />

      <SearchBar countryData={countryDataRef} onSelect={handleSearchSelect} />

      {/* metric selector */}
      <div style={{ position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 10 }}>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          style={{
            padding: "7px 14px",
            borderRadius: 20,
            border: "none",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            backdropFilter: "blur(6px)",
            cursor: "pointer",
            outline: "none",
            minWidth: 200,
          }}
        >
          {[...new Set(Object.values(METRICS).map((m) => m.group))].map((group) => (
            <optgroup key={group} label={group}>
              {Object.entries(METRICS)
                .filter(([, m]) => m.group === group)
                .map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* legend */}
      <div
        style={{
          position: "absolute",
          bottom: 32,
          left: 20,
          zIndex: 10,
          background: "rgba(0,0,0,0.6)",
          borderRadius: 8,
          padding: "10px 14px",
          color: "#fff",
          fontSize: 12,
          backdropFilter: "blur(4px)",
          minWidth: 180,
        }}
      >
        <div style={{ marginBottom: 6, fontWeight: 600 }}>
          {METRICS[metric].label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>{METRICS[metric].domain[0].toLocaleString()}</span>
          <div
            style={{
              flex: 1,
              height: 10,
              borderRadius: 4,
              background: `linear-gradient(to right, ${METRICS[metric].colors[0]}, ${METRICS[metric].colors[1]})`,
            }}
          />
          <span>{METRICS[metric].domain[1].toLocaleString()}</span>
        </div>
        <div
          style={{
            marginTop: 6,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              background: NO_DATA_COLOR,
              flexShrink: 0,
            }}
          />
          <span style={{ color: "#aaa" }}>No data</span>
        </div>
      </div>

      {/* tier legend (bottom center when focused) */}
      {focusedCountry && (
        <div
          style={{
            position: "absolute",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            background: "rgba(0,0,0,0.6)",
            borderRadius: 20,
            padding: "6px 16px",
            fontSize: 12,
            color: "#888",
            backdropFilter: "blur(4px)",
            display: "flex",
            gap: 16,
            pointerEvents: "none",
          }}
        >
          <span style={{ color: "#7ec8e3" }}>■ Province</span>
          <span style={{ color: "#f0a500" }}>■ County (US)</span>
          <span style={{ color: "#666" }}>· Esc to exit</span>
        </div>
      )}

      {/* tooltip */}
      <div
        id="tooltip"
        style={{
          position: "absolute",
          background: "rgba(0,0,0,0.78)",
          color: "#fff",
          padding: "8px 12px",
          borderRadius: 6,
          font: "13px sans-serif",
          pointerEvents: "none",
          display: "none",
          lineHeight: 1.7,
          width: "max-content",
          maxWidth: 220,
        }}
      />

      <Panel
        selectedStack={selectedStack}
        compared={compared}
        regionCompared={regionCompared}
        focusedCountry={focusedCountry}
        briefing={briefing}
        provinceBriefing={provinceBriefing}
        countryDataMap={countryDataMap}
        onClose={clearFocus}
        onPop={popSel}
        onAddCompare={addCompare}
        onRemoveCompare={removeCompare}
        onAddRegionCompare={addRComp}
        onRemoveRegionCompare={removeRComp}
      />
    </>
  );
}
