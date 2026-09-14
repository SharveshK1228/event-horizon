import { useState } from 'react';
import { useVenueStore } from '../../store/useVenueStore';
import { useTimeline } from '../../store/derived';
import OverlayPanel from './OverlayPanel';
import { NEO, MONO } from '../../theme';

/**
 * A guided walk through the console for a live presentation.
 *
 * Each step drives the same store actions the operator would click, then
 * shows the talking points for what is now on screen. It changes nothing
 * about the evidence or how it is labelled — it only sequences the existing
 * views so a presenter never has to hunt for the next button.
 */
const STEPS = [
  {
    id: 'problem',
    title: 'The problem',
    run: (store) => {
      store.setMode('demo');
      store.setScenario('clear');
    },
    say: [
      'A concert ends. Twenty thousand people head for the exits. One operator watches a screen.',
      'A lens gets sprayed, or the tracker loses everyone. Most dashboards keep showing a confident number.',
      'The operator reads a calm screen. The concourse is not calm.',
    ],
  },
  {
    id: 'crush',
    title: 'Crush conditions',
    run: (store) => store.setScenario('crush'),
    say: [
      'End-of-event egress. Watch the exit funnel, R3C2, fill up.',
      'People slow from walking to shuffling as it packs — that is the real crowd-flow relationship.',
      'At T-01:30 two of six gates stop. Then read the warning number in the timeline panel.',
    ],
  },
  {
    id: 'zone',
    title: 'Zone evidence',
    run: (store) => {
      if (store.selectedZone !== 'R3C2') store.setSelectedZone('R3C2');
    },
    say: [
      'Five people per square metre. That is the band where crowd-collapse incidents are documented.',
      'Track coverage falls as the crowd packs — heads block each other. A crush is the worst moment to trust a count, and we show that.',
    ],
  },
  {
    id: 'footage',
    title: 'Real footage',
    run: () => scrollTo('camera-panel'),
    say: [
      'Pick the sample clip and press play.',
      'The green checks are genuinely measured from these frames, live in the browser.',
      'No detector is running. The counts stay labelled SIMULATED. We refuse to draw boxes we did not compute.',
    ],
  },
  {
    id: 'assistant',
    title: 'The assistant',
    run: (store) => {
      store.setMode('backend');
      scrollTo('assistant-panel');
    },
    say: [
      'Now on the real API. Ask the assistant what to do first.',
      'It is a live LLM, allowed to use only the incident and the written procedure. It cannot invent a step.',
      'If the model fails, a scripted answer takes over. The operator always gets the procedure.',
    ],
  },
  {
    id: 'missing',
    title: 'Missing evidence',
    run: (store) => store.setScenario('tracking'),
    say: [
      'Tracking lost. Everything goes grey. The forecast stops. The console says so in words.',
      'Any dashboard can show a red alert. Ours shows a grey one — that is the harder problem.',
      'Nothing in this system is ever labelled safe.',
    ],
  },
];

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function PitchGuide() {
  const [index, setIndex] = useState(-1);
  const timeline = useTimeline();

  const go = (next) => {
    const step = STEPS[next];
    if (!step) return;
    step.run(useVenueStore.getState());
    setIndex(next);
  };

  const current = index >= 0 ? STEPS[index] : null;
  const lead = timeline?.lead;

  return (
    <OverlayPanel
      title="Pitch walkthrough"
      width={290}
      badge={
        <span style={{ fontFamily: MONO, fontSize: 9, color: NEO.grey }}>
          {current ? `${index + 1}/${STEPS.length}` : 'START'}
        </span>
      }
    >
      <div style={bodyStyle}>
        <div style={stepRowStyle}>
          {STEPS.map((step, i) => (
            <button
              key={step.id}
              type="button"
              onClick={() => go(i)}
              style={{
                ...stepButtonStyle,
                background: i === index ? NEO.orange : NEO.surface,
                color: i === index ? NEO.surface : NEO.ink,
                borderColor: i === index ? NEO.orange : NEO.ink,
              }}
              title={step.title}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={index >= STEPS.length - 1}
            style={{ ...nextButtonStyle, opacity: index >= STEPS.length - 1 ? 0.4 : 1 }}
          >
            {index < 0 ? 'START ▸' : 'NEXT ▸'}
          </button>
        </div>

        {current ? (
          <>
            <div style={titleStyle}>
              {index + 1} · {current.title.toUpperCase()}
            </div>
            <ul style={listStyle}>
              {current.say.map((line) => (
                <li key={line} style={lineStyle}>
                  {line}
                </li>
              ))}
            </ul>
            {current.id === 'crush' && lead?.leadSeconds > 0 && (
              <div style={calloutStyle}>
                <strong style={{ fontSize: 18 }}>{lead.leadSeconds}s</strong> of warning on this timeline —
                projection crosses the threshold before the crowd reaches crush density.
              </div>
            )}
          </>
        ) : (
          <div style={{ ...lineStyle, color: NEO.grey }}>
            Six steps, one click each. Every step runs the same controls an operator would use;
            nothing here changes the evidence or how it is labelled.
          </div>
        )}
      </div>
    </OverlayPanel>
  );
}

const bodyStyle = { padding: 10, fontFamily: MONO };

const stepRowStyle = { display: 'flex', gap: 4, alignItems: 'center', marginBottom: 10 };

const stepButtonStyle = {
  width: 26,
  height: 26,
  border: '2px solid',
  borderRadius: 2,
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 900,
  cursor: 'pointer',
  padding: 0,
};

const nextButtonStyle = {
  marginLeft: 'auto',
  border: `2px solid ${NEO.ink}`,
  background: NEO.ink,
  color: NEO.surface,
  fontFamily: MONO,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.08em',
  padding: '6px 10px',
  cursor: 'pointer',
  borderRadius: 2,
};

const titleStyle = {
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.1em',
  color: NEO.orange,
  marginBottom: 6,
};

const listStyle = { margin: 0, padding: '0 0 0 14px', display: 'grid', gap: 5 };

const lineStyle = { fontSize: 10, lineHeight: 1.55, color: NEO.ink };

const calloutStyle = {
  marginTop: 10,
  padding: '8px 10px',
  background: '#FEF3C7',
  border: `2px solid ${NEO.amber}`,
  borderRadius: 2,
  fontSize: 9,
  lineHeight: 1.5,
  color: NEO.ink,
};
