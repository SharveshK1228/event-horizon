import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVenueStore, selectStale, isDemo } from './store/useVenueStore';
import { useForecast, useSelectedZone } from './store/derived';
import VenueScene from './components/digitalTwin/VenueScene';
import ForecastPanel from './components/dashboard/ForecastPanel';
import ScenarioControls from './components/dashboard/ScenarioControls';
import ZoneTelemetry from './components/dashboard/ZoneTelemetry';
import CameraPanel from './components/dashboard/CameraPanel';
import ResponsePanel from './components/dashboard/ResponsePanel';
import AssistantPanel from './components/dashboard/AssistantPanel';
import { NEO, MONO } from './theme';

const MODES = ['demo', 'backend'];

export default function App() {
  const mode = useVenueStore((state) => state.mode);
  const setMode = useVenueStore((state) => state.setMode);
  const error = useVenueStore((state) => state.error);
  const updatedAt = useVenueStore((state) => state.updatedAt);
  const stale = useVenueStore(selectStale);
  const zone = useSelectedZone();
  const forecast = useForecast();
  const demo = useVenueStore(isDemo);
  const replayDemoSignals = useVenueStore((state) => state.replayDemoSignals);
  const stopPolling = useVenueStore((state) => state.stopPolling);

  // Seed the demo signal feed once, and tear down timers on unmount.
  useEffect(() => {
    replayDemoSignals();
    return () => stopPolling();
  }, [replayDemoSignals, stopPolling]);

  const degraded = !demo && (Boolean(error) || stale);
  const statusTone = demo ? 'amber' : error ? 'red' : stale ? 'amber' : '';
  const statusText = demo ? 'DEMO DATA' : error ? 'DISCONNECTED' : stale ? 'STALE' : 'BACKEND LIVE';

  return (
    <div className="shell">
      <div className="twin-pane">
        <VenueScene />
      </div>

      <div className="console-pane">
        <header className="console-head">
          <div>
            <div className="console-eyebrow">EVENT HORIZON / CROWD INTELLIGENCE</div>
            <div className="console-title">
              {zone ? `ZONE ${zone.id} TELEMETRY` : 'VENUE RESILIENCE TWIN'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="segmented">
              {MODES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={mode === option ? 'selected' : ''}
                  onClick={() => setMode(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className={`status-pill ${statusTone}`}>
              <span className="status-dot" />
              {statusText}
            </div>
          </div>
        </header>

        <div className="console-body">
          {degraded && (
            <div className="warning-bar" role="status">
              {error
                ? `Backend disconnected. ${error}`
                : 'Observation stale or timestamp unavailable.'}{' '}
              No demo fallback is being used.
            </div>
          )}

          <ForecastPanel />
          <ScenarioControls />

          <AnimatePresence mode="wait">
            <motion.div
              key={zone?.id || 'no-zone'}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.16 }}
            >
              <ZoneTelemetry />
            </motion.div>
          </AnimatePresence>

          <CameraPanel />
          <ResponsePanel />
          <AssistantPanel />

          <p style={disclaimerStyle}>
            Observed, missing and simulated evidence are kept distinct throughout this console. Nothing here
            establishes crowd safety, and no public announcement or physical operation is triggered from this
            interface.
          </p>
        </div>

        <footer className="console-foot">
          <span style={{ color: NEO.grey }}>EVENT HORIZON OPERATOR CONSOLE v0.2.0</span>
          <span style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: forecast.origin === 'observed' ? NEO.green : NEO.amber }}>
              {forecast.origin === 'observed' ? '● GRID FROM BACKEND' : '○ GRID SIMULATED'}
            </span>
            <span style={{ color: demo ? NEO.amber : error ? NEO.red : NEO.green }}>
              {demo ? '○ DEMO MODE' : updatedAt ? `● ${updatedAt.toLocaleTimeString()}` : '○ NO UPDATE'}
            </span>
          </span>
        </footer>
      </div>
    </div>
  );
}

const disclaimerStyle = {
  fontFamily: MONO,
  fontSize: 9,
  lineHeight: 1.8,
  color: NEO.grey,
  border: `2px dashed ${NEO.line}`,
  padding: '10px 12px',
  marginBottom: 4,
};
