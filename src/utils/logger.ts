import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';

const logsDir = path.join(process.cwd(), 'logs');

// Define log level based on environment or configuration
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Custom format for console and file output
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    const logOutput = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
    if (stack) {
      return `${logOutput}\n${stack}${metaString ? `\nMeta: ${metaString}` : ''}`;
    }
    return `${logOutput}${metaString ? `\n${metaString}` : ''}`;
  })
);

// Configure daily rotation file transport for errors
const errorRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxFiles: '14d',
  maxSize: '20m',
  zippedArchive: true,
});

// Configure daily rotation file transport for combined logs
const combinedRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: logLevel,
  maxFiles: '14d',
  maxSize: '20m',
  zippedArchive: true,
});

export const logger = winston.createLogger({
  level: logLevel,
  format: customFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        customFormat
      ),
    }),
    errorRotateTransport,
    combinedRotateTransport,
  ],
  exitOnError: false,
});
