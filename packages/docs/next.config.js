const withNextra = require('nextra')({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.jsx',
});

module.exports = withNextra({
  basePath: '/docs',
  redirects: () => [
    {
      source: '/frameworks',
      destination: '/frameworks/react',
      permanent: false,
    },
    {
      source: '/fetching-data/queries',
      destination: '/query',
      permanent: true,
    },
    {
      source: '/fetching-data/fetch',
      destination: '/client/fetch',
      permanent: true,
    },
    {
      source: '/fetching-data/subscriptions',
      destination: '/client/subscribe',
      permanent: true,
    },
    {
      source: '/migrations',
      destination: '/schemas',
      permanent: true,
    },
    {
      source: '/access-control',
      destination: '/schemas/rules',
      permanent: true,
    },
    {
      source: '/syncing-data/:path*',
      destination: '/client',
      permanent: true,
    },
    {
      source: '/updating-data',
      destination: '/client/insert',
      permanent: true,
    },
    {
      source: '/schema-management',
      destination: '/schemas/updating',
      permanent: true,
    },
    {
      source: '/database/schemas',
      destination: '/schemas',
      permanent: true,
    },
    {
      source: '/database/storage',
      destination: '/client/storage',
      permanent: true,
    },
    {
      source: '/database',
      destination: '/client',
      permanent: true,
    },
  ],
});
