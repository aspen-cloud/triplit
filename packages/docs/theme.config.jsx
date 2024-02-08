import { useRouter } from 'next/router';
import { METADATA } from '@/components/SEOMetadata';

const { DESCRIPTION, URL, TWITTER_HANDLE, TWITTER_CARD_TYPE } = METADATA;

export default {
  logo: <span>Triplit</span>,
  project: {
    link: 'https://github.com/aspen-cloud/triplit',
  },
  chat: {
    link: 'https://discord.gg/q89sGWHqQ5',
  },
  sidebar: {
    defaultMenuCollapseLevel: 1,
  },
  docsRepositoryBase:
    'https://github.com/aspen-cloud/triplit/tree/main/packages/docs',
  editLink: {
    text: 'Edit this page on GitHub',
  },
  feedback: {
    content: null,
  },
  // TODO: would like to do everthing in the 'head()' prop but omitting useNextSeoProps will cause some
  // unwanted default behavior where the default nextra docs og:title will be added to the <head> in
  // addition to whatever og:title we define in head().
  useNextSeoProps() {
    return {
      titleTemplate: '%s | Triplit Documentation',
    };
  },
  head: () => {
    const { asPath } = useRouter();
    return (
      <>
        <meta name="description" content={DESCRIPTION} />
        <meta property="og:url" content={URL + asPath} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content={URL + '/opengraph-image.png'} />
        <meta property="og:image:alt" content="Triplit Logo" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content={TWITTER_CARD_TYPE} />
        <meta name="twitter:site" content={TWITTER_HANDLE} />
      </>
    );
  },

  // project: {
  //   link: 'https://github.com/shuding/nextra',
  // },
  // ...
};
