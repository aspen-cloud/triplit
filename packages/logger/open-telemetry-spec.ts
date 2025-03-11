type AnyType =
  | string
  | boolean
  | number
  | Uint8Array
  | AnyType[]
  | { [key: string]: AnyType }
  | null;

type MapType = { [key: string]: AnyType };

export enum SeverityNumber {
  TRACE = 1,
  TRACE2,
  TRACE3,
  TRACE4,
  DEBUG,
  DEBUG2,
  DEBUG3,
  DEBUG4,
  INFO,
  INFO2,
  INFO3,
  INFO4,
  WARN,
  WARN2,
  WARN3,
  WARN4,
  ERROR,
  ERROR2,
  ERROR3,
  ERROR4,
  FATAL,
  FATAL2,
  FATAL3,
  FATAL4,
}

export interface LogRecord {
  timestamp?: number; // uint64 nanoseconds since Unix epoch
  observedTimestamp?: number; // uint64 nanoseconds since Unix epoch
  traceId?: Uint8Array; // W3C trace id
  spanId?: Uint8Array; // Span ID
  traceFlags?: number; // Trace flags (byte)
  severityText?: string; // Severity as text
  severityNumber?: SeverityNumber; // Severity as number
  body?: AnyType; // Log body
  resource?: MapType; // Describes the source of the log
  instrumentationScope?: MapType; // Instrumentation scope
  attributes?: MapType; // Additional information
  eventName?: string; // Event name
}
