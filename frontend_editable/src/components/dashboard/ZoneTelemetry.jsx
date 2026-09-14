import { useMemo } from 'react';
import {
  Area,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useVenueStore, isDemo } from '../../store/useVenueStore';
import { useForecast, useZones, useSelectedZone } from '../../store/derived';
import { ZONE_AREA_M2, ZONE_LABELS } from '../../data/venueModel';
import { Panel, StatCard, Callout, ProvenanceTag } from './primitives';
import { NEO, MONO, densityStep, densityBand } from '../../theme';

/** Per-zone telemetry for the cell selected in the twin. */
export default function ZoneTelemetry() {
  const zone = useSelectedZone();
  const zones = useZones();
  const forecast = useForecast();
  const horizon = useVenueStore((state) => state.horizon);
  const threshold = useVenueStore((state) => state.threshold);
  const demo = useVenueStore(isDemo);
  const setSelectedZone = useVenueStore((state) => state.setSelectedZone);

  const tone = forecast.origin === 'observed' ? 'observed' : demo ? 'simulated' : 'simulated';

  const series = useMemo(() => {
    if (!zone) return [];
    const byHorizon = new Map();
    for (const cell of forecast.cells || []) {
      if (cell.cell === zone.id) byHorizon.set(cell.horizon_s, cell.projected_tracks);
    }
    return [
      { point: 'now', projected: zone.current, threshold },
      ...[1, 2, 3].map((step) => ({
        point: `+${step}s`,
        projected: byHorizon.get(step) ?? null,
        threshold,
      })),
    ];
  }, [zone, forecast, threshold]);

  if (!zone) {
    return <EmptyState count={zones.filter((entry) => entry.ratio != null).length} />;
  }

  const known = zone.ratio != null;
  const { color, label } = densityStep(zone.ratio);
  const regionTotal = zones.reduce((sum, entry) => sum + (entry.projected || 0), 0);
  const share = known && regionTotal > 0 ? (zone.projected / regionTotal) * 100 : null;

  return (
    <div>
      <Panel
        title={`ZONE ${zone.id} — ${ZONE_LABELS[zone.id] || 'Zone'}`}
        tag={known ? label : 'NO PROJECTION'}
        tone={known ? tone : 'missing'}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 'bold', color: NEO.grey }}>
            ROW {zone.row} · COLUMN {zone.col} · HORIZON +{horizon}s
          </span>
          <button type="button" onClick={() => setSelectedZone(zone.id)} style={clearButtonStyle}>
            CLEAR
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatCard
            label="Current eligible tracks"
            value={zone.current}
            color={NEO.violet}
            max={threshold * 2}
            note="CONTINUOUS TRACKS ONLY"
          />
          <StatCard
            label={`Projected @ +${horizon}s`}
            value={zone.projected}
            color={color}
            max={threshold * 2}
            note="CONSTANT-VELOCITY BASELINE"
          />
          <StatCard
            label="Change"
            value={zone.change == null ? null : `${zone.change > 0 ? '+' : ''}${zone.change}`}
            color={zone.change > 0 ? NEO.red : NEO.green}
            max={threshold}
            note="PROJECTED MINUS CURRENT"
          />
          <StatCard
            label="Slow fraction"
            value={zone.slowFraction == null ? null : `${Math.round(zone.slowFraction * 100)}%`}
            color={NEO.amber}
            max={100}
            note="OBSERVED SPEED, NOT A PREDICTION"
          />
        </div>

        {/* Area density exists only for simulated grids, where the zone's
            floor area is defined. A backend forecast counts tracks in image
            cells and supplies no area, so the row disappears entirely. */}
        {zone.density != null && (
          <div style={{ ...densityRowStyle, borderLeft: `3px solid ${densityBand(zone.density).color}` }}>
            <div>
              <div style={captionStyle}>SIMULATED AREA DENSITY @ +{horizon}s</div>
              <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: NEO.ink }}>
                {zone.density.toFixed(2)}
                <span style={{ fontSize: 10, color: NEO.grey }}> persons/m²</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: 900,
                  color: densityBand(zone.density).color,
                }}
              >
                {densityBand(zone.density).label}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 8, color: NEO.grey, marginTop: 3 }}>
                OVER A SIMULATED {ZONE_AREA_M2} m² ZONE
              </div>
            </div>
          </div>
        )}

        {/* Share of region occupancy */}
        <div style={{ marginTop: 14 }}>
          <div style={captionStyle}>SHARE OF PROJECTED REGION OCCUPANCY</div>
          <div style={barStyle}>
            {share == null ? (
              <div style={{ width: '100%', background: NEO.bg }} />
            ) : (
              <>
                <div style={{ width: `${share}%`, background: color, transition: 'width 0.4s ease' }} />
                <div style={{ flex: 1, background: NEO.bg }} />
              </>
            )}
          </div>
          <div style={barLegendStyle}>
            <span>{zone.id}</span>
            <span style={{ color, fontWeight: 'bold' }}>
              {share == null ? 'Unavailable' : `${share.toFixed(1)}%`}
            </span>
          </div>
        </div>

        {zone.flagged && (
          <div style={{ marginTop: 12 }}>
            <Callout>
              ⚠ Projected tracks reach the configured threshold of {threshold}. This flags the cell for operator
              review; it is not a probability of a dangerous event.
            </Callout>
          </div>
        )}
      </Panel>

      <Panel
        title={`PROJECTION CURVE — ${zone.id}`}
        tag={known ? 'BASELINE MODEL' : 'SUSPENDED'}
        tone={known ? tone : 'missing'}
        dense
      >
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="zoneGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={NEO.bg} strokeDasharray="4 4" />
              <XAxis dataKey="point" stroke={NEO.ink} tick={tickStyle} />
              <YAxis stroke={NEO.ink} tick={tickStyle} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="projected"
                stroke={color}
                strokeWidth={2}
                fill="url(#zoneGrad)"
                dot={{ r: 3, fill: color }}
                connectNulls={false}
                name="Eligible tracks"
              />
              <Line
                type="monotone"
                dataKey="threshold"
                stroke={NEO.red}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                name="Threshold"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 9, color: NEO.grey, lineHeight: 1.6, marginTop: 8 }}>
          Equal image cells cover unequal physical areas. Any persons-per-square-metre figure above belongs
          to the simulated venue, where the zone area is defined by construction; the backend makes no such
          claim. The displayed population is visible eligible tracks rather than total occupancy.
        </div>
      </Panel>
    </div>
  );
}

/** Shown until the operator selects a zone in the twin. */
function EmptyState({ count }) {
  return (
    <div style={emptyStyle}>
      <svg
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        stroke={NEO.grey}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginBottom: 20, opacity: 0.8 }}
      >
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
        <circle cx="15" cy="15" r="2.6" strokeDasharray="3 3" />
      </svg>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 'bold', color: NEO.ink, lineHeight: 1.6, maxWidth: 320 }}>
        Select a zone in the 3D digital twin to inspect its concentration evidence.
      </div>
      <div style={{ marginTop: 14 }}>
        <ProvenanceTag tone={count ? 'observed' : 'missing'}>
          {count ? `${count}/9 ZONES WITH A PROJECTION` : 'NO ZONE PROJECTION THIS INTERVAL'}
        </ProvenanceTag>
      </div>
    </div>
  );
}

const captionStyle = {
  fontFamily: MONO,
  fontSize: 8,
  color: NEO.grey,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: 6,
};

const densityRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  gap: 10,
  marginTop: 12,
  padding: '9px 11px',
  background: NEO.bg,
  borderRadius: 2,
};

const barStyle = {
  height: 12,
  border: `2px solid ${NEO.ink}`,
  display: 'flex',
  overflow: 'hidden',
};

const barLegendStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  fontFamily: MONO,
  fontSize: 9,
  color: NEO.grey,
  marginTop: 4,
};

const clearButtonStyle = {
  border: `2px solid ${NEO.ink}`,
  background: NEO.surface,
  color: NEO.ink,
  fontFamily: MONO,
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: '0.08em',
  padding: '3px 8px',
  cursor: 'pointer',
  borderRadius: 2,
};

const emptyStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '44px 24px',
  textAlign: 'center',
  background: NEO.surface,
  border: `2px solid ${NEO.ink}`,
  boxShadow: `4px 4px 0px 0px ${NEO.ink}`,
  borderRadius: 4,
  marginBottom: 14,
};

const tickStyle = { fontFamily: MONO, fontSize: 9, fill: NEO.ink };

const tooltipStyle = {
  background: NEO.surface,
  border: `2px solid ${NEO.ink}`,
  fontFamily: MONO,
  fontSize: 11,
  color: NEO.ink,
  borderRadius: 0,
};
