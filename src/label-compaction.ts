/**
 * Suffix-preserving sibling label compaction.
 */

export interface LabelEntry {
  readonly id: string;
  readonly label: string;
}

function longestCommonSegmentPrefix(labels: readonly string[]): string {
  const longLabels = labels.filter((label) => label.length > 20);
  if (longLabels.length < 3) {
    return "";
  }
  const first = longLabels[0];
  if (first === undefined) {
    return "";
  }
  let prefix = first;
  for (let i = 1; i < longLabels.length; i++) {
    const candidate = longLabels[i];
    if (candidate === undefined) {
      continue;
    }
    const limit = Math.min(prefix.length, candidate.length);
    let idx = 0;
    while (idx < limit && prefix[idx] === candidate[idx]) {
      idx++;
    }
    prefix = prefix.slice(0, idx);
    if (prefix.length < 10) {
      return "";
    }
  }
  const sepIdx = Math.max(prefix.lastIndexOf("-"), prefix.lastIndexOf("_"), prefix.lastIndexOf("."));
  if (sepIdx >= 9) {
    return prefix.slice(0, sepIdx + 1);
  }
  return "";
}

/**
 * Compacts a single label while preserving its distinguishing tail characters.
 */
export function compactSingleLabel(label: string, maxChars = 22): string {
  if (typeof label !== "string") {
    throw new TypeError("compactSingleLabel label must be a string");
  }
  if (typeof maxChars !== "number" || !Number.isFinite(maxChars) || maxChars <= 0) {
    throw new TypeError("compactSingleLabel maxChars must be a positive finite number");
  }
  const limit = Math.floor(maxChars);
  if (label.length <= limit) {
    return label;
  }
  if (limit <= 6) {
    return label.slice(0, limit);
  }
  const headLen = Math.max(4, Math.floor((limit - 2) * 0.35));
  const tailLen = limit - 2 - headLen;
  return `${label.slice(0, headLen)}..${label.slice(label.length - tailLen)}`;
}

/**
 * Computes compacted labels across a sibling set, stripping shared multi-item prefixes
 * when doing so yields clearer distinct suffixes without losing identity.
 */
export function buildCompactLabelMap(
  entries: readonly LabelEntry[],
  maxChars = 22,
): ReadonlyMap<string, string> {
  if (!Array.isArray(entries)) {
    throw new TypeError("buildCompactLabelMap entries must be an array");
  }
  if (typeof maxChars !== "number" || !Number.isFinite(maxChars) || maxChars <= 0) {
    throw new TypeError("buildCompactLabelMap maxChars must be a positive finite number");
  }
  const limit = Math.floor(maxChars);
  const result = new Map<string, string>();
  const labels: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry === undefined || typeof entry !== "object" || entry === null) {
      throw new TypeError(`buildCompactLabelMap entries[${i}] must be a non-null object`);
    }
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      throw new TypeError(`buildCompactLabelMap entries[${i}].id must be a non-empty string`);
    }
    if (typeof entry.label !== "string") {
      throw new TypeError(`buildCompactLabelMap entries[${i}].label must be a string`);
    }
    labels.push(entry.label);
  }

  const sharedPrefix = longestCommonSegmentPrefix(labels);
  for (const entry of entries) {
    if (entry.label.length <= limit) {
      result.set(entry.id, entry.label);
      continue;
    }
    if (sharedPrefix.length > 0 && entry.label.startsWith(sharedPrefix)) {
      const stripped = entry.label.slice(sharedPrefix.length);
      if (stripped.length >= 4 && stripped.length + 2 <= limit) {
        result.set(entry.id, `..${stripped}`);
        continue;
      }
      if (stripped.length > limit - 2) {
        result.set(entry.id, `..${compactSingleLabel(stripped, limit - 2)}`);
        continue;
      }
    }
    result.set(entry.id, compactSingleLabel(entry.label, limit));
  }
  return result;
}
