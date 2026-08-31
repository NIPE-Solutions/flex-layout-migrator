import { Writable } from 'node:stream';
import { transports } from 'winston';
import { logger } from './logger';

describe('logger', () => {
  test('marks formatted timestamps as UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T19:20:21.456Z'));
    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });

    logger.clear();
    logger.add(new transports.Stream({ stream }));

    try {
      logger.warn('UTC contract');
      await Promise.resolve();

      expect(output).toContain('[2026-08-31 19:20:21Z]');
    } finally {
      logger.clear();
      logger.add(new transports.Console());
      vi.useRealTimers();
    }
  });
});
