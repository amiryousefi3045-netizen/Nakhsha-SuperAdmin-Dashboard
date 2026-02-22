const winston = require("winston");

/**
 * Winston Logger Configuration
 * سطوح log: error, warn, info, http, debug
 */

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const level = () => {
  const env = process.env.NODE_ENV || "development";
  const isDevelopment = env === "development";
  return isDevelopment ? "debug" : "warn";
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

winston.addColors(colors);

// فرمت برای محیط Development (خوانا برای انسان)
// When the log metadata includes a `reqId`, it is prepended to the message
// so that individual requests can be traced through the log stream.
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const reqTag = info.reqId ? `[${info.reqId}] ` : "";
    return `${info.timestamp} ${info.level}: ${reqTag}${info.message}`;
  })
);

// فرمت برای محیط Production (JSON structured)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const transports = [
  // Console output برای development
  new winston.transports.Console({
    format: consoleFormat,
  }),
  // فایل برای همه لاگ‌ها
  new winston.transports.File({
    filename: "logs/all.log",
    format: fileFormat,
  }),
  // فایل جداگانه برای خطاها
  new winston.transports.File({
    filename: "logs/error.log",
    level: "error",
    format: fileFormat,
  }),
];

const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
  // در صورت exception متوقف نشود
  exitOnError: false,
});

// Handle uncaught exceptions
logger.exceptions.handle(
  new winston.transports.File({ filename: "logs/exceptions.log" })
);

// Handle unhandled promise rejections
logger.rejections.handle(
  new winston.transports.File({ filename: "logs/rejections.log" })
);

module.exports = logger;
