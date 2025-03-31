import { LogLevelName, LogRecord } from '@triplit/logger';
import { ConsoleHandler } from '@triplit/logger/console';

export function clientLogHandler() {
  return new ConsoleHandler({
    formatter: (record: LogRecord) => {
      const { level, message, timestamp, context, attributes } = record;
      const prefix = context ? [`%c${context}`, 'color: #888'] : []; // Prefix context
      // Format sync debug messages
      if (level === 'DEBUG' && context === 'sync') {
        if (message === 'sent') {
          return [
            '%c OUT ',
            'background: #228; color: #51acff',
            attributes?.type,
            attributes?.payload,
          ];
        }
        if (message === 'received') {
          return [
            '%c IN ',
            'background: #ccc; color: #333',
            attributes?.type,
            attributes?.payload,
          ];
        }
      }
      return [...prefix, message, attributes || ''];
    },
  });
}
