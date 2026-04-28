import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger respects SWISSGROCERIES_LOG_LEVEL', () => {
  let originalLevel: string | undefined;

  beforeEach(() => {
    originalLevel = process.env.SWISSGROCERIES_LOG_LEVEL;
    // Clear module cache so the logger re-reads the env var
    vi.resetModules();
  });

  afterEach(() => {
    if (originalLevel === undefined) {
      delete process.env.SWISSGROCERIES_LOG_LEVEL;
    } else {
      process.env.SWISSGROCERIES_LOG_LEVEL = originalLevel;
    }
    vi.restoreAllMocks();
  });

  it('suppresses all output when level is silent', async () => {
    process.env.SWISSGROCERIES_LOG_LEVEL = 'silent';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logger } = await import('../../src/util/log.js');
    logger.info('should be suppressed');
    logger.debug('should also be suppressed');
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits info messages at default level', async () => {
    process.env.SWISSGROCERIES_LOG_LEVEL = 'info';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logger } = await import('../../src/util/log.js');
    logger.info('hello info');
    expect(spy).toHaveBeenCalledWith('[info]', 'hello info');
  });

  it('suppresses debug messages at info level', async () => {
    process.env.SWISSGROCERIES_LOG_LEVEL = 'info';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logger } = await import('../../src/util/log.js');
    logger.debug('debug noise');
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits debug messages at debug level', async () => {
    process.env.SWISSGROCERIES_LOG_LEVEL = 'debug';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logger } = await import('../../src/util/log.js');
    logger.debug('verbose detail');
    expect(spy).toHaveBeenCalledWith('[debug]', 'verbose detail');
  });
});
