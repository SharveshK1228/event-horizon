import { useState } from 'react';
import { useVenueStore, isDemo } from '../../store/useVenueStore';
import { Panel, ProvenanceTag } from './primitives';
import { NEO, MONO } from '../../theme';

const SUGGESTIONS = ['What changed?', 'What should I check now?', 'What information is missing?'];

/**
 * Operator assistant. Answers are grounded in the supplied evidence and SOP;
 * the response origin is always shown so a scripted fallback is never mistaken
 * for a model answer. No API keys belong in this frontend.
 */
export default function AssistantPanel() {
  const demo = useVenueStore(isDemo);
  const busy = useVenueStore((state) => state.assistantBusy);
  const answer = useVenueStore((state) => state.answer);
  const error = useVenueStore((state) => state.error);
  const ask = useVenueStore((state) => state.ask);

  const [question, setQuestion] = useState('');

  const submit = (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    ask(question.trim());
  };

  return (
    <Panel
      title="Event Horizon assistant"
      tag={demo ? 'SCRIPTED DEMO' : 'SERVER-SIDE'}
      tone={demo ? 'simulated' : 'observed'}
    >
      <p style={{ fontFamily: MONO, fontSize: 10, color: NEO.grey, margin: '0 0 10px', lineHeight: 1.6 }}>
        Ask about the current evidence and the selected procedure.
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {SUGGESTIONS.map((text) => (
          <button key={text} type="button" onClick={() => setQuestion(text)} style={chipStyle}>
            {text}
          </button>
        ))}
      </div>

      {answer && (
        <div style={answerStyle} role="status">
          <ProvenanceTag tone={answer.response_origin === 'llm' ? 'observed' : 'simulated'}>
            {(answer.response_origin || 'backend response').toUpperCase()}
          </ProvenanceTag>
          <p style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.7, color: NEO.ink, margin: '8px 0 6px' }}>
            {answer.text || 'No explanation supplied.'}
          </p>
          <small style={{ fontFamily: MONO, fontSize: 8, color: NEO.grey }}>
            Incident: {answer.incident_id || '—'} · SOP version: {answer.sop_version || '—'}
          </small>
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'flex', gap: 8, margin: '12px 0 8px' }}>
        <input
          aria-label="Ask the assistant"
          placeholder="Ask about this situation…"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          style={inputStyle}
        />
        <button type="submit" disabled={busy || (!demo && Boolean(error))} style={submitStyle}>
          {busy ? 'Waiting…' : 'Ask →'}
        </button>
      </form>

      <small style={{ fontFamily: MONO, fontSize: 8, color: NEO.grey, lineHeight: 1.6 }}>
        The checklist remains usable without the assistant. No API keys belong in this frontend.
      </small>
    </Panel>
  );
}

const chipStyle = {
  border: `2px solid ${NEO.ink}`,
  background: NEO.surface,
  color: NEO.ink,
  fontFamily: MONO,
  fontSize: 9,
  fontWeight: 'bold',
  padding: '4px 8px',
  cursor: 'pointer',
  borderRadius: 2,
  boxShadow: `1px 1px 0px 0px ${NEO.ink}`,
};

const answerStyle = {
  border: `2px solid ${NEO.ink}`,
  borderLeft: `5px solid ${NEO.orange}`,
  background: '#FFFBF6',
  padding: 12,
  whiteSpace: 'pre-wrap',
};

const inputStyle = {
  minWidth: 0,
  flex: 1,
  border: `2px solid ${NEO.ink}`,
  background: NEO.surface,
  color: NEO.ink,
  fontFamily: MONO,
  fontSize: 11,
  padding: '9px 10px',
};

const submitStyle = {
  border: `2px solid ${NEO.ink}`,
  background: NEO.orange,
  color: NEO.surface,
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.08em',
  padding: '9px 12px',
  cursor: 'pointer',
  boxShadow: `2px 2px 0px 0px ${NEO.ink}`,
};
