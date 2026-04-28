type LogLevel = 'silent' | 'info' | 'debug';

const level: LogLevel = (process.env.SWISSGROCERIES_LOG_LEVEL ?? 'info') as LogLevel;

const order: Record<LogLevel, number> = { silent: 0, info: 1, debug: 2 };

function log(lvl: LogLevel, args: unknown[]): void {
  if (order[lvl] > order[level]) return;
  console.error(`[${lvl}]`, ...args);
}

export const logger = {
  info: (...args: unknown[]) => log('info', args),
  debug: (...args: unknown[]) => log('debug', args),
};
