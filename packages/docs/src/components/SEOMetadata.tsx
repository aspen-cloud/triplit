import Head from 'next/head';

const TITLE = 'Triplit | The Fullstack Database';
const DESCRIPTION =
  'Triplit is a complete solution to data persistence, state management, and realtime synchronization for web applications that want to go fast.';
const URL = 'https://triplit.dev';
const TWITTER_HANDLE = '@triplit_dev';
const TWITTER_CARD_TYPE = 'summary_large_image';

export const METADATA = {
  TITLE,
  DESCRIPTION,
  URL,
  TWITTER_HANDLE,
  TWITTER_CARD_TYPE,
};

function SEOMetadata() {
  return (
    <Head>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} key="desc" />

      {/* Open Graph tags */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={TITLE} />
      <meta property="og:url" content={URL} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:image" content={URL + '/opengraph-image.png'} />
      <meta property="og:image:alt" content="Triplit Logo" />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      {/* Twitter card tags */}
      <meta name="twitter:card" content={TWITTER_CARD_TYPE} />
      <meta name="twitter:site" content={TWITTER_HANDLE} />
    </Head>
  );
}

export default SEOMetadata;
