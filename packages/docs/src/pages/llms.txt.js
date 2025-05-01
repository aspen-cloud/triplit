import { getAllFilesWithFrontMatter } from '../utils/mdx';

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

  // Generate the llms.txt content
  let content = `# Triplit Documentation\n\n`;
  content += `> Triplit is an open-source database that syncs data between server and browser in real-time.\n\n`;
  content += `This documentation covers all aspects of using Triplit, from installation to advanced usage.\n\n`;

  // Add root level docs first
  if (docsBySection.root) {
    content += `## Core Documentation\n\n`;
    docsBySection.root.forEach((doc) => {
      if (doc.slug === 'index') return; // Skip the main index page

      const title = doc.title || doc.slug;
      const description = doc.description || '';
      content += `- [${title}](https://triplit.dev/docs/${doc.slug}.md): ${description}\n`;
    });
    content += `\n`;
  }

  // Add each section
  Object.keys(docsBySection).forEach((section) => {
    if (section === 'root') return; // Skip root as we've already processed it

    // Capitalize section name and replace hyphens with spaces
    const sectionTitle = section
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    content += `## ${sectionTitle}\n\n`;

    // Add section index page first if it exists
    const indexPage = docsBySection[section].find(
      (doc) => doc.slug === `${section}/index`
    );
    if (indexPage) {
      const title = indexPage.title || section;
      const description = indexPage.description || '';
      content += `- [${title}](https://triplit.dev/docs/${section}/index.md): ${description}\n`;
    }

    // Add other pages in the section
    docsBySection[section]
      .filter((doc) => doc.slug !== `${section}/index`)
      .forEach((doc) => {
        const slugParts = doc.slug.split('/');
        const pageName = slugParts[slugParts.length - 1];

        const title = doc.title || pageName;
        const description = doc.description || '';
        content += `- [${title}](https://triplit.dev/docs/${doc.slug}.md): ${description}\n`;
      });

    content += `\n`;
  });

  return {
    props: {
      content,
    },
  };
}

export default function LLMsPage({ content }) {
  // Return the content as plain text
  return <pre style={{ whiteSpace: 'pre-wrap' }}>{content}</pre>;
}
