// Node-only: an event-log sink that writes JSONL to disk, buffered and synchronous (so output order
// always matches event order and a crash loses at most one buffer).
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { toJsonLine } from '../chronicle/eventLog.js';

/**
 * @param {string} filePath  e.g. output/<runId>/events.jsonl. Parent folders are created; an existing file is replaced.
 * @param {{ bufferLines?: number }} [options]
 * @returns {{ sink: import('../chronicle/eventLog.js').EventSink, flush: () => void, close: () => void }}
 */
export function createJsonlFileSink(filePath, { bufferLines = 2000 } = {}) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, '');
  /** @type {string[]} */
  let buffer = [];
  let closed = false;

  const flush = () => {
    if (buffer.length === 0) return;
    appendFileSync(filePath, buffer.join(''));
    buffer = [];
  };

  return {
    sink: (event) => {
      if (closed) throw new Error(`Event written after ${filePath} was closed`);
      buffer.push(toJsonLine(event));
      if (buffer.length >= bufferLines) flush();
    },
    flush,
    close: () => {
      flush();
      closed = true;
    },
  };
}
