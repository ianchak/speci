import { describe, it, expect } from 'vitest';
import { log as barrelLog } from '../lib/utils/logger.js';
import { log as infraLog } from '../lib/utils/infrastructure/logger.js';
import { preflight as barrelPreflight } from '../lib/utils/preflight.js';
import { preflight as helperPreflight } from '../lib/utils/helpers/preflight.js';

describe('utils organization wiring', () => {
  it('wires logger barrel to infrastructure module', () => {
    expect(barrelLog).toBe(infraLog);
  });

  it('wires preflight barrel to helper module', () => {
    expect(barrelPreflight).toBe(helperPreflight);
  });
});
