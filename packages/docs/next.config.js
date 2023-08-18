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
  ],
});
