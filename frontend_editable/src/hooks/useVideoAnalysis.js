import { useCallback, useEffect, useRef, useState } from 'react';
import { GRID, QualityReference, tileFeatures, tileMotion } from '../lib/videoSignals';

/** Analysis resolution. Small on purpose: these are relative checks, not measurements. */
const SAMPLE_WIDTH = 192;
const SAMPLE_HEIGHT = 144;
/** Samples per second. Matches the ten-samples-in-three-seconds warm-up rule. */
const SAMPLE_HZ = 6;

/**
 * Runs the per-tile visibility and frame-difference checks over a playing
 * `<video>` element, entirely in the browser.
 *
 * These readings are genuinely **observed** from the supplied file — that is
 * the whole point of separating them from the simulated crowd counts. What
 * they are not is a crowd measurement: no detector or tracker exists in this
 * application, so this hook reports image quality and pixel change, and never
 * a number of people.
 *
 * @param {{current: HTMLVideoElement|null}} videoRef
 * @param {string|null} sourceId identifies the clip; changing it rebuilds the
 *   reference, because the previous one described a different scene
 * @returns {{status:string, changed:number, progress:number, perTile:boolean[],
 *   motion:number[], features:object[], sampleCount:number, sampledAt:number|null,
 *   reset:() => void}}
 */
export default function useVideoAnalysis(videoRef, sourceId) {
  const canvasRef = useRef(null);
  const referenceRef = useRef(new QualityReference());
  const previousFrameRef = useRef(null);
  const samplesRef = useRef(0);

  const [reading, setReading] = useState(emptyReading);

  const reset = useCallback(() => {
    referenceRef.current.reset();
    previousFrameRef.current = null;
    samplesRef.current = 0;
    setReading(emptyReading());
  }, []);

  useEffect(() => {
    reset();
    if (!sourceId) return undefined;

    if (!canvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = SAMPLE_WIDTH;
      canvas.height = SAMPLE_HEIGHT;
      canvasRef.current = canvas;
    }
    // `willReadFrequently` keeps getImageData on the CPU path; without it
    // browsers round-trip the GPU on every sample and the loop stutters.
    const context = canvasRef.current.getContext('2d', { willReadFrequently: true });

    const timer = setInterval(() => {
      const video = videoRef.current;
      // readyState < 2 means there is no current frame to read yet.
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      let frame;
      try {
        context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        frame = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      } catch {
        // A cross-origin video taints the canvas. Report no analysis rather
        // than a wrong one, and stop trying.
        setReading({ ...emptyReading(), status: 'UNAVAILABLE' });
        return;
      }

      const features = tileFeatures(frame.data, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const quality = referenceRef.current.update(video.currentTime, features);

      const previous = previousFrameRef.current;
      const motion =
        previous && previous.length === frame.data.length
          ? tileMotion(frame.data, previous, SAMPLE_WIDTH, SAMPLE_HEIGHT)
          : new Array(GRID * GRID).fill(0);
      previousFrameRef.current = new Uint8ClampedArray(frame.data);
      samplesRef.current += 1;

      setReading({
        status: quality.status,
        changed: quality.changed,
        progress: quality.progress,
        perTile: quality.perTile,
        motion,
        features,
        sampleCount: samplesRef.current,
        sampledAt: video.currentTime,
      });
    }, 1000 / SAMPLE_HZ);

    return () => clearInterval(timer);
  }, [sourceId, videoRef, reset]);

  return { ...reading, reset };
}

function emptyReading() {
  return {
    status: 'NO VIDEO',
    changed: 0,
    progress: 0,
    perTile: new Array(GRID * GRID).fill(false),
    motion: new Array(GRID * GRID).fill(0),
    features: [],
    sampleCount: 0,
    sampledAt: null,
  };
}
