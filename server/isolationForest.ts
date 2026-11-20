/**
 * Unsupervised Isolation Forest (Liu, Ting & Zhou, 2008)
 * Pure TypeScript implementation with deterministic Mulberry32 PRNG for reproducible
 * behavioral anomaly scoring across third-party API activity records.
 */

interface IsolationNode {
  leaf: boolean;
  size: number;
  featureIndex?: number;
  splitValue?: number;
  left?: IsolationNode;
  right?: IsolationNode;
}

export interface IsolationForestResult {
  scores: number[];
  atypicalFlags: boolean[];
  thresholdScore: number;
  treesBuilt: number;
  sampleSize: number;
}

const EULER_MASCHERONI = 0.5772156649;

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function averagePathLength(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + EULER_MASCHERONI) - (2 * (n - 1)) / n;
}

function buildTree(
  rows: number[][],
  currentDepth: number,
  maxDepth: number,
  rng: () => number
): IsolationNode {
  const n = rows.length;
  if (currentDepth >= maxDepth || n <= 1) {
    return { leaf: true, size: n };
  }

  const featureCount = rows[0].length;
  // Find features that have variation in this subset
  const candidateFeatures: number[] = [];
  for (let f = 0; f < featureCount; f++) {
    let minVal = rows[0][f];
    let maxVal = rows[0][f];
    for (let i = 1; i < n; i++) {
      const v = rows[i][f];
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
    if (maxVal - minVal > 1e-9) {
      candidateFeatures.push(f);
    }
  }

  if (candidateFeatures.length === 0) {
    return { leaf: true, size: n };
  }

  const featureIndex =
    candidateFeatures[Math.floor(rng() * candidateFeatures.length)];

  let minVal = rows[0][featureIndex];
  let maxVal = rows[0][featureIndex];
  for (let i = 1; i < n; i++) {
    const v = rows[i][featureIndex];
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }

  const splitValue = minVal + rng() * (maxVal - minVal);
  const leftRows: number[][] = [];
  const rightRows: number[][] = [];

  for (let i = 0; i < n; i++) {
    if (rows[i][featureIndex] < splitValue) {
      leftRows.push(rows[i]);
    } else {
      rightRows.push(rows[i]);
    }
  }

  if (leftRows.length === 0 || rightRows.length === 0) {
    return { leaf: true, size: n };
  }

  return {
    leaf: false,
    size: n,
    featureIndex,
    splitValue,
    left: buildTree(leftRows, currentDepth + 1, maxDepth, rng),
    right: buildTree(rightRows, currentDepth + 1, maxDepth, rng),
  };
}

function pathLength(
  point: number[],
  node: IsolationNode,
  currentDepth: number
): number {
  if (node.leaf || node.featureIndex === undefined || node.splitValue === undefined) {
    return currentDepth + averagePathLength(node.size);
  }
  if (point[node.featureIndex] < node.splitValue) {
    return pathLength(point, node.left!, currentDepth + 1);
  }
  return pathLength(point, node.right!, currentDepth + 1);
}

function sampleWithoutReplacement(
  matrix: number[][],
  sampleSize: number,
  rng: () => number
): number[][] {
  const n = matrix.length;
  if (sampleSize >= n) {
    return matrix.slice();
  }
  const indices = Array.from({ length: n }, (_, i) => i);
  const selected: number[][] = [];
  for (let i = 0; i < sampleSize; i++) {
    const j = i + Math.floor(rng() * (n - i));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
    selected.push(matrix[indices[i]]);
  }
  return selected;
}

export function runIsolationForest(
  features: number[][],
  options: {
    numTrees?: number;
    maxSamples?: number;
    contamination?: number;
    seed?: number;
  } = {}
): IsolationForestResult {
  const n = features.length;
  const numTrees = options.numTrees ?? 100;
  const contamination = options.contamination ?? 0.08;
  const seed = options.seed ?? 42071;

  if (n < 5) {
    return {
      scores: features.map(() => 0),
      atypicalFlags: features.map(() => false),
      thresholdScore: 0.65,
      treesBuilt: 0,
      sampleSize: n,
    };
  }

  const sampleSize = Math.min(options.maxSamples ?? 256, n);
  const maxDepth = Math.max(1, Math.ceil(Math.log2(sampleSize)));
  const rng = createSeededRng(seed);

  // Min-max normalize features per column so large record volumes do not drown out hour/frequency features
  const dims = features[0].length;
  const mins = new Array<number>(dims).fill(Infinity);
  const maxs = new Array<number>(dims).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < dims; d++) {
      if (features[i][d] < mins[d]) mins[d] = features[i][d];
      if (features[i][d] > maxs[d]) maxs[d] = features[i][d];
    }
  }
  const normalized = features.map((row) =>
    row.map((val, d) => {
      const span = maxs[d] - mins[d];
      return span > 1e-9 ? (val - mins[d]) / span : 0;
    })
  );

  const trees: IsolationNode[] = [];
  for (let t = 0; t < numTrees; t++) {
    const subsample = sampleWithoutReplacement(normalized, sampleSize, rng);
    trees.push(buildTree(subsample, 0, maxDepth, rng));
  }

  const cNorm = averagePathLength(sampleSize) || 1;
  const scores = normalized.map((point) => {
    let totalPath = 0;
    for (let t = 0; t < trees.length; t++) {
      totalPath += pathLength(point, trees[t], 0);
    }
    const avgPath = totalPath / trees.length;
    const score = Math.pow(2, -avgPath / cNorm);
    return Number(Math.max(0, Math.min(1, score)).toFixed(4));
  });

  const sortedDesc = [...scores].sort((a, b) => b - a);
  const cutoffIndex = Math.max(0, Math.min(n - 1, Math.floor(n * contamination)));
  const quantileCutoff = sortedDesc[cutoffIndex];
  const thresholdScore = Math.max(0.58, quantileCutoff);

  const atypicalFlags = scores.map((score) => score >= thresholdScore);

  return {
    scores,
    atypicalFlags,
    thresholdScore: Number(thresholdScore.toFixed(4)),
    treesBuilt: trees.length,
    sampleSize,
  };
}
