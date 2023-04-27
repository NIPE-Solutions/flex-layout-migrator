import { format as dateFormat } from "date-fns";

import { createLogger, format, transports } from "winston";

const { combine, timestamp, printf, colorize, splat } = format;

const myFormat = printf(({ timestamp, level, message, label, lineNumber }) => {
    const formattedTimestamp = dateFormat(new Date(timestamp), "yyyy-MM-dd HH:mm:ss");
    const fileLineInfo = label && lineNumber ? `(${label}:${lineNumber})` : "";
    return `[${formattedTimestamp}] ${level}: ${message} ${fileLineInfo}`;
  });

export const logger = createLogger({
  level: "info",
  format: combine(splat(), colorize(), timestamp(), myFormat),
  transports: [new transports.Console()],
});

export function handleError(message: string, error?: Error): void {
  logger.error(message);
  if (error) {
    logger.error(`Details: ${error.stack}`);
  }
  process.exit(1);
}
