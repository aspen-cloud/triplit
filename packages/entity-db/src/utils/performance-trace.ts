export function performanceTrace(
  name: string,
  {
    track,
    color,
    properties,
  }: {
    track?: string;
    color?: string;
    properties?: Record<string, string | number>;
  } = {}
) {
  const randomId = Math.random().toString(36).substring(7);
  performance.mark(`${name}-start-${randomId}`);
  const end = () => {
    performance.measure(`${name}`, {
      start: `${name}-start-${randomId}`,
      detail: {
        devtools: {
          dataType: 'track-entry',
          track: name,
          trackGroup: track, // Group related tracks together
          color: color ?? 'tertiary-dark',
          properties: properties ? Object.entries(properties) : [],
        },
      },
    });
  };
  return {
    end,
    [Symbol.dispose]() {
      end();
    },
  };
}
