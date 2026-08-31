import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, colorize, splat } = format;

const myFormat = printf(({ timestamp, level, message, label, lineNumber }) => {
  const timestampValue =
    typeof timestamp === 'string' || typeof timestamp === 'number' || timestamp instanceof Date
      ? timestamp
      : Date.now();
  const formattedTimestamp = new Date(timestampValue).toISOString().replace('T', ' ').slice(0, 19);
  const fileLineInfo = label && lineNumber ? `(${label}:${lineNumber})` : '';
  return `[${formattedTimestamp}] ${level}: ${message} ${fileLineInfo}`;
});

export const logger = createLogger({
  level: 'info',
  format: combine(splat(), colorize(), timestamp(), myFormat),
  transports: [new transports.Console()],
});
