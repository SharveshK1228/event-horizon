import { useEffect } from 'react';
import { useVenueStore, selectProcedure, isDemo } from '../../store/useVenueStore';
import { useIncidents, useIncident } from '../../store/derived';
import { Panel, Callout, ActionButton, ProvenanceTag } from './primitives';
import { NEO, MONO } from '../../theme';

const SOP_GROUPS = ['reactive', 'proactive', 'escalation', 'recovery'];

const SEVERITY_COLOR = { high: NEO.red, medium: NEO.amber, caution: NEO.amber };

/** Incident list, evidence and the response procedure checklist. */
export default function ResponsePanel() {
  const demo = useVenueStore(isDemo);
  const incidents = useIncidents();
  const incident = useIncident();
  const procedure = useVenueStore(selectProcedure);
  const checks = useVenueStore((state) => state.checks);
  const acknowledged = useVenueStore((state) => state.acknowledged);
  const setIncidentId = useVenueStore((state) => state.setIncidentId);
  const toggleCheck = useVenueStore((state) => state.toggleCheck);
  const acknowledge = useVenueStore((state) => state.acknowledge);
  const loadSop = useVenueStore((state) => state.loadSop);

  const sopId = incident?.sop_id;

  useEffect(() => {
    if (demo) return;
    loadSop(sopId);
  }, [demo, sopId, loadSop]);

  const done = acknowledged || incident?.status === 'acknowledged';

  return (
    <div>
      <Panel
        title="Incident centre"
        tag={`${incidents.length} LISTED`}
        tone={demo ? 'simulated' : incidents.length ? 'observed' : 'missing'}
        dense
      >
        {incidents.length === 0 ? (
          <p style={mutedStyle}>No incidents supplied. This does not establish crowd safety.</p>
        ) : (
          incidents.map((entry) => {
            const chosen = incident?.incident_id === entry.incident_id;
            return (
              <button
                key={entry.incident_id}
                type="button"
                onClick={() => setIncidentId(entry.incident_id)}
                style={{
                  ...incidentStyle,
                  borderColor: chosen ? NEO.orange : NEO.ink,
                  background: chosen ? '#FFF7ED' : NEO.surface,
                }}
              >
                <span
                  style={{
                    ...severityStyle,
                    background: SEVERITY_COLOR[entry.severity] || NEO.grey,
                  }}
                >
                  {(entry.severity || 'REVIEW').toUpperCase()}
                </span>
                <strong style={{ display: 'block', margin: '8px 0 4px', fontSize: 13 }}>{entry.title}</strong>
                <small style={{ fontFamily: MONO, fontSize: 9, color: NEO.grey }}>
                  {entry.incident_id} · {done && chosen ? 'acknowledged' : entry.status}
                </small>
              </button>
            );
          })
        )}
      </Panel>

      <Panel title="Incident evidence" tag="REVIEW REQUIRED" tone={demo ? 'simulated' : 'observed'}>
        <h3 style={{ fontSize: 14, margin: '0 0 10px', lineHeight: 1.5 }}>
          {incident?.title || 'No selected incident'}
        </h3>
        {(incident?.evidence || ['Evidence unavailable']).map((line, index) => (
          <p key={index} style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.7, color: '#374151', margin: '0 0 8px' }}>
            {line}
          </p>
        ))}
        <Callout>
          Agreement between tracking and optical flow is not surge-detection accuracy. Camera motion may affect
          both signals.
        </Callout>
      </Panel>

      <Panel
        title="Response procedure"
        tag={procedure?.sop_id || 'UNAVAILABLE'}
        tone={procedure ? (demo ? 'simulated' : 'observed') : 'missing'}
      >
        {procedure ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <ProvenanceTag tone="simulated">{procedure.approval_status}</ProvenanceTag>
              <span style={{ fontFamily: MONO, fontSize: 9, color: NEO.grey }}>VERSION {procedure.version}</span>
            </div>
            <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>{procedure.title}</h3>

            {SOP_GROUPS.map((group) => (
              <div key={group} style={{ marginBottom: 12 }}>
                <h4 style={groupHeadStyle}>{group}</h4>
                {(procedure[group] || []).map((text, index) => {
                  const key = `${group}${index}`;
                  return (
                    <label key={key} style={checkStyle}>
                      <input
                        type="checkbox"
                        checked={Boolean(checks[key])}
                        onChange={() => toggleCheck(key)}
                        style={{ marginTop: 3, accentColor: NEO.orange }}
                      />
                      <span>{text}</span>
                    </label>
                  );
                })}
              </div>
            ))}

            <ActionButton
              onClick={acknowledge}
              disabled={done}
              tone={done ? NEO.green : NEO.orange}
              style={{ marginTop: 6 }}
            >
              {done ? '✓ Acknowledged' : demo ? 'Acknowledge locally' : 'Acknowledge incident'}
            </ActionButton>
            <p style={{ fontFamily: MONO, fontSize: 9, color: NEO.grey, marginTop: 8 }}>
              Checklist selections are local session notes. {demo && 'Demo acknowledgement is not persisted.'}
            </p>
          </>
        ) : (
          <p style={mutedStyle}>Select an incident with an available procedure.</p>
        )}
      </Panel>
    </div>
  );
}

const mutedStyle = {
  fontFamily: MONO,
  fontSize: 10,
  color: NEO.grey,
  lineHeight: 1.7,
  margin: 0,
};

const incidentStyle = {
  display: 'block',
  textAlign: 'left',
  width: '100%',
  marginBottom: 8,
  padding: 12,
  border: `2px solid ${NEO.ink}`,
  cursor: 'pointer',
  borderRadius: 2,
  boxShadow: `2px 2px 0px 0px ${NEO.ink}`,
  color: NEO.ink,
};

const severityStyle = {
  fontFamily: MONO,
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: '0.08em',
  color: NEO.surface,
  padding: '2px 6px',
};

const groupHeadStyle = {
  fontFamily: MONO,
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: NEO.grey,
  margin: '0 0 6px',
};

const checkStyle = {
  display: 'flex',
  gap: 8,
  fontSize: 11,
  lineHeight: 1.6,
  color: '#374151',
  margin: '6px 0',
  cursor: 'pointer',
};
