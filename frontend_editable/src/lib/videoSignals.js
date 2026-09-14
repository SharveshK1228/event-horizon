// Per-tile image-quality signals, computed in the browser from a video frame.
//
// This is a direct port of what the Python pipeline already does: the feature
// triple matches `dashboard_worker.py` (tile standard deviation, variance of
// the Laplacian, fraction of clipped pixels) and the reference check matches
// `QualityReference` in `crowd_signals.py` — same 0.3 ratio, same two-tile
// rule, same three-second / ten-sample median warm-up.
//
// What this is: a *relative* check that the view still looks like the one the
// reference was built from. What it is not: an occlusion detector, a crowd
// measurement, or anything that involves a model. No detector or tracker runs
// here, so nothing this file produces is ever a person count.

/** Tiles per axis — the same 3×3 region the forecast grid uses. */
export const GRID = 3;

/** Matches QualityReference(ratio=.3, changed_tiles=2) in crowd_signals.py. */
export const QUALITY_RATIO = 0.3;
export const CHANGED_TILES = 2;
const WARMUP_SECONDS = 3;
const WARMUP_SAMPLES = 10;

/**
 * Per-tile features for one frame.
 *
 * @param {Uint8ClampedArray} data RGBA pixels, row-major
 * @param {number} width
 * @param {number} height
 * @returns {{contrast:number, sharpness:number, exposure:number, luma:number}[]}
 *   nine tiles in reading order, matching ZONE_IDS
 */
export function tileFeatures(data, width, height) {
  const gray = toGrayscale(data, width * height);
  const tiles = [];

  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const x0 = Math.floor((col * width) / GRID);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * width) / GRID));
      const y0 = Math.floor((row * height) / GRID);
      const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * height) / GRID));
      tiles.push(measureTile(gray, width, x0, x1, y0, y1));
    }
  }
  return tiles;
}

/** BT.601 luma, the same conversion cv2.COLOR_BGR2GRAY applies. */
function toGrayscale(data, pixels) {
  const gray = new Float32Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    const p = i * 4;
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return gray;
}

/**
 * Standard deviation, variance of the 4-neighbour Laplacian, and the fraction
 * of pixels clipped at either end — `[tile.std(), Laplacian(tile).var(), mean((tile<8)|(tile>247))]`.
 */
function measureTile(gray, width, x0, x1, y0, y1) {
  let sum = 0;
  let sumSquares = 0;
  let clipped = 0;
  let count = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const value = gray[y * width + x];
      sum += value;
      sumSquares += value * value;
      if (value < 8 || value > 247) clipped += 1;
      count += 1;
    }
  }

  const mean = sum / count;
  const variance = Math.max(0, sumSquares / count - mean * mean);

  // Laplacian over the tile interior; the border is skipped rather than padded,
  // which is what cv2's default BORDER_REFLECT approximates closely enough here.
  let laplacianSum = 0;
  let laplacianSquares = 0;
  let laplacianCount = 0;
  for (let y = Math.max(1, y0); y < Math.min(y1, y1 - 1); y += 1) {
    for (let x = Math.max(1, x0); x < Math.min(x1, x1 - 1); x += 1) {
      const i = y * width + x;
      const value =
        gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      laplacianSum += value;
      laplacianSquares += value * value;
      laplacianCount += 1;
    }
  }
  const laplacianMean = laplacianCount ? laplacianSum / laplacianCount : 0;

  return {
    contrast: Math.sqrt(variance),
    sharpness: laplacianCount
      ? Math.max(0, laplacianSquares / laplacianCount - laplacianMean * laplacianMean)
      : 0,
    exposure: clipped / count,
    luma: mean,
  };
}

/**
 * Mean absolute per-tile difference between two frames, scaled to 0–255.
 *
 * This is a frame difference, not optical flow: it says pixels changed, not
 * that people moved. Camera shake, lighting changes and compression noise all
 * register here, which is exactly why it is never reported as person motion.
 */
export function tileMotion(current, previous, width, height) {
  const gray = toGrayscale(current, width * height);
  const before = toGrayscale(previous, width * height);
  const motion = [];

  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const x0 = Math.floor((col * width) / GRID);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * width) / GRID));
      const y0 = Math.floor((row * height) / GRID);
      const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * height) / GRID));

      let total = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          total += Math.abs(gray[y * width + x] - before[y * width + x]);
          count += 1;
        }
      }
      motion.push(total / count);
    }
  }
  return motion;
}

/**
 * The reference check from `crowd_signals.QualityReference`.
 *
 * Builds a median reference from the opening seconds of a clip, then reports
 * how many tiles have fallen away from it. A tile is `changed` when its
 * contrast or sharpness drops below `ratio` of the reference, or its clipped
 * fraction rises well above it — the same predicate the Python uses.
 */
export class QualityReference {
  constructor(ratio = QUALITY_RATIO, changedTiles = CHANGED_TILES) {
    this.ratio = ratio;
    this.changedTiles = changedTiles;
    this.samples = [];
    this.reference = null;
    this.start = null;
  }

  reset() {
    this.samples = [];
    this.reference = null;
    this.start = null;
  }

  /**
   * @param {number} timestamp seconds, monotonic within one clip
   * @param {ReturnType<typeof tileFeatures>} features
   * @returns {{status:'WARMING UP'|'REFERENCE-LIKE'|'DEGRADED', changed:number,
   *   progress:number, perTile:boolean[]}}
   */
  update(timestamp, features) {
    if (this.start === null) this.start = timestamp;

    if (this.reference === null) {
      this.samples.push(features);
      const elapsed = timestamp - this.start;
      if (elapsed >= WARMUP_SECONDS && this.samples.length >= WARMUP_SAMPLES) {
        this.reference = features.map((_, index) => ({
          contrast: median(this.samples.map((sample) => sample[index].contrast)),
          sharpness: median(this.samples.map((sample) => sample[index].sharpness)),
          exposure: median(this.samples.map((sample) => sample[index].exposure)),
        }));
        this.samples = [];
      } else {
        return {
          status: 'WARMING UP',
          changed: 0,
          progress: Math.min(
            1,
            Math.min(elapsed / WARMUP_SECONDS, this.samples.length / WARMUP_SAMPLES),
          ),
          perTile: features.map(() => false),
        };
      }
    }

    const perTile = features.map((tile, index) => {
      const base = this.reference[index];
      return (
        tile.contrast < Math.max(base.contrast * this.ratio, 3) ||
        tile.sharpness < Math.max(base.sharpness * this.ratio, 2) ||
        tile.exposure > Math.max(base.exposure + 0.35, 0.8)
      );
    });
    const changed = perTile.filter(Boolean).length;

    return {
      status: changed >= this.changedTiles ? 'DEGRADED' : 'REFERENCE-LIKE',
      changed,
      progress: 1,
      perTile,
    };
  }
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
