import {
  getAllFilesWithFrontMatter,
  getFileBySlug,
  mdxToPlainMd,
} from '../utils/mdx';

export async function getStaticProps() {
  const allDocs = await getAllFilesWithFrontMatter();

  // Group docs by section (first part of the slug)
  const docsBySection = allDocs.reduce((acc, doc) => {
    const slugParts = doc.slug.split('/');
    const section = slugParts.length > 1 ? slugParts[0] : 'root';

    if (!acc[section]) {
      acc[section] = [];
    }

    acc[section].push(doc);
    return acc;
  }, {});

  // Generate the llms-full.txt content
  let content = `# Triplit Documentation\n\n`;
  content += `> Triplit is an open-source database that syncs data between server and browser in real-time.\n\n`;
  content += `This documentation covers all aspects of using Triplit, from installation to advanced usage.\n\n`;

  // Function to get and append the full content of a document
  async function appendDocContent(doc) {
    const { content: docContent } = await getFileBySlug(doc.slug);
    const plainMd = mdxToPlainMd(docContent);

    // Add document title and separator
    let fullContent = `\n\n## ${doc.title || doc.slug}\n\n`;

    // Add the document content
    fullContent += plainMd;

    // Add a separator
    fullContent += '\n\n---\n\n';

    return fullContent;
  }

  // Add root level docs first
  if (docsBySection.root) {
    content += `# Core Documentation\n\n`;

    // Process each root document
    for (const doc of docsBySection.root) {
      if (doc.slug === 'index') continue; // Skip the main index page
      content += await appendDocContent(doc);
    }
  }

  // Add each section
  for (const section of Object.keys(docsBySection)) {
    if (section === 'root') continue; // Skip root as we've already processed it

    // Capitalize section name and replace hyphens with spaces
    const sectionTitle = section
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    content += `# ${sectionTitle}\n\n`;

    // Add section index page first if it exists
    const indexPage = docsBySection[section].find(
      (doc) => doc.slug === `${section}/index`
    );

    if (indexPage) {
      content += await appendDocContent(indexPage);
    }

    // Add other pages in the section
    const otherPages = docsBySection[section].filter(
      (doc) => doc.slug !== `${section}/index`
    );

    for (const doc of otherPages) {
      content += await appendDocContent(doc);
    }
  }

  return {
    props: {
      content,
    },
  };
}

export default function LLMsFullPage({ content }) {
  // Return the content as plain text
  return <pre style={{ whiteSpace: 'pre-wrap' }}>{content}</pre>;
}
