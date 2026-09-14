import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { NEO, MONO, HARD } from '../../theme';

/**
 * Chooses which clip plays in the camera panel.
 *
 * Three routes, in the order a demo wants them:
 *   1. clips the backend has on disk, including the bundled sample
 *   2. a file uploaded now, which the backend stores and serves back
 *   3. a purely local file, which never leaves the browser
 *
 * The backend routes need the API running; the local route always works. None
 * of them starts crowd analysis, and the panel says so next to every one.
 */
export default function SourcePicker({ selected, onSelect }) {
  const [sources, setSources] = useState([]);
  const [backendUp, setBackendUp] = useState(null); // null = not yet checked
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (signal) => {
    try {
      const payload = await api.sources(signal);
      setSources(payload.sources || []);
      setBackendUp(true);
      setError('');
      return;
    } catch {
      if (signal?.aborted) return;
    }
    // The backend owns the library; without it the dev server still serves the
    // bundled clips read-only, so a demo runs with only `npm run dev`.
    try {
      const response = await fetch('/samples/index.json', { signal });
      const payload = await response.json();
      setSources(payload.sources || []);
    } catch {
      if (!signal?.aborted) setSources([]);
    }
    if (!signal?.aborted) setBackendUp(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const handleUpload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { source } = await api.uploadSource(file);
      await refresh();
      onSelect({ id: source.source_id, name: source.name, url: source.url, origin: 'uploaded' });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLocal = (file) => {
    if (!file) return;
    setError('');
    onSelect({ id: `local:${file.name}`, name: file.name, url: URL.createObjectURL(file), origin: 'local' });
  };

  const handleDelete = async (id) => {
    setBusy(true);
    try {
      await api.deleteSource(id);
      if (selected?.id === id) onSelect(null);
      await refresh();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={shellStyle}>
      <div style={headRowStyle}>
        <span style={captionStyle}>▸ VIDEO SOURCE</span>
        <span style={{ fontSize: 8, color: backendUp ? NEO.green : NEO.grey }}>
          {backendUp === null ? 'CHECKING…' : backendUp ? '● LIBRARY ONLINE' : '○ LIBRARY OFFLINE'}
        </span>
      </div>

      {sources.length > 0 && (
        <ul style={listStyle}>
          {sources.map((source) => {
            const active = selected?.id === source.source_id;
            return (
              <li key={source.source_id} style={{ ...rowStyle, borderColor: active ? NEO.orange : NEO.line }}>
                <button
                  type="button"
                  onClick={() =>
                    onSelect({
                      id: source.source_id,
                      name: source.name,
                      url: source.url,
                      origin: source.origin,
                    })
                  }
                  style={{ ...rowButtonStyle, color: active ? NEO.orange : NEO.ink }}
                >
                  <span style={{ fontWeight: 900 }}>{active ? '▸ ' : '  '}{source.name}</span>
                  <span style={{ color: NEO.grey }}>
                    {source.origin.toUpperCase()} · {formatBytes(source.size_bytes)}
                  </span>
                </button>
                {source.origin === 'uploaded' && (
                  <button
                    type="button"
                    onClick={() => handleDelete(source.source_id)}
                    disabled={busy}
                    title="Delete this uploaded clip"
                    style={deleteStyle}
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {backendUp === false && (
        <p style={noteStyle}>
          {sources.length
            ? 'Bundled clips served by the dev server, read-only. Start the API to upload and store clips.'
            : 'No clips found. Start the API, or drop a video into the sample folder, or open a local file.'}
        </p>
      )}

      <div style={buttonRowStyle}>
        <label style={{ ...buttonStyle, opacity: backendUp && !busy ? 1 : 0.5 }}>
          {busy ? 'UPLOADING…' : 'UPLOAD TO LIBRARY'}
          <input
            type="file"
            accept="video/*"
            disabled={!backendUp || busy}
            style={{ display: 'none' }}
            onChange={(event) => {
              handleUpload(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>

        <label style={{ ...buttonStyle, boxShadow: 'none' }}>
          OPEN LOCAL FILE
          <input
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={(event) => {
              handleLocal(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>

        {selected && (
          <button type="button" onClick={() => onSelect(null)} style={{ ...buttonStyle, boxShadow: 'none' }}>
            CLEAR
          </button>
        )}
      </div>

      {error && <p style={{ ...noteStyle, color: NEO.red }}>{error}</p>}
    </div>
  );
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

const shellStyle = {
  border: `1px solid ${NEO.line}`,
  borderRadius: 3,
  padding: 10,
  marginBottom: 12,
  fontFamily: MONO,
};

const headRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
};

const captionStyle = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.1em',
  color: NEO.grey,
};

const listStyle = { listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'grid', gap: 4 };

const rowStyle = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 4,
  border: '1px solid',
  borderRadius: 2,
};

const rowButtonStyle = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  background: 'transparent',
  border: 'none',
  fontFamily: MONO,
  fontSize: 9,
  padding: '6px 7px',
  cursor: 'pointer',
  textAlign: 'left',
  overflowWrap: 'anywhere',
};

const deleteStyle = {
  border: 'none',
  borderLeft: `1px solid ${NEO.line}`,
  background: 'transparent',
  color: NEO.grey,
  fontFamily: MONO,
  fontSize: 10,
  padding: '0 8px',
  cursor: 'pointer',
};

const buttonRowStyle = { display: 'flex', gap: 6, flexWrap: 'wrap' };

const buttonStyle = {
  border: HARD.border,
  background: NEO.surface,
  color: NEO.ink,
  fontFamily: MONO,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.05em',
  padding: '6px 9px',
  cursor: 'pointer',
  borderRadius: 2,
  boxShadow: HARD.shadowSm,
};

const noteStyle = {
  fontSize: 8,
  lineHeight: 1.7,
  color: NEO.grey,
  margin: '6px 0 0',
};
