// Node-only helper: loads the config files from the project folder.
import { readFile } from 'node:fs/promises';
import { loadConfig } from '../config.js';

const projectRoot = new URL('../../', import.meta.url);

export function loadConfigFromDisk() {
  return loadConfig((path) => readFile(new URL(path, projectRoot), 'utf8'));
}
