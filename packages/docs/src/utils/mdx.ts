import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { globby } from 'globby';

// Path to our MDX files
const MDX_PATH = path.join(process.cwd(), 'src', 'pages');

// Get all MDX files recursively
export async function getFiles() {
  const files = await globby(['**/*.mdx', '!_*.mdx'], {
    cwd: MDX_PATH,
  });
  return files;
}

// Get a specific MDX file by slug
export async function getFileBySlug(slug: string) {
  const mdxPath = path.join(MDX_PATH, `${slug}.mdx`);
  const source = fs.existsSync(mdxPath)
    ? fs.readFileSync(mdxPath, 'utf8')
    : fs.readFileSync(path.join(MDX_PATH, `${slug}/index.mdx`), 'utf8');

  const { data, content } = matter(source);

  return {
    content,
    frontMatter: {
      slug: slug || null,
      ...data,
    },
  };
}

// Get all MDX files with their frontmatter
export async function getAllFilesWithFrontMatter() {
  const files = await getFiles();

  return Promise.all(
    files.map(async (file) => {
      const slug = file.replace(/\.mdx?$/, '');
      const { frontMatter } = await getFileBySlug(slug);

      return {
        ...frontMatter,
        slug,
      };
    })
  );
}

export function mdxToPlainMd(mdxContent: string) {
  return mdxContent
    .replace(/<([a-z][a-z0-9]*)[^>]*>(.*?)<\/\1>/gis, '$2') // Replace JSX components with their children
    .replace(/<([a-z][a-z0-9]*)[^>]*\/>/gi, '') // Remove self-closing JSX components
    .replace(/import\s+.*?from\s+['"].*?['"];?/g, '') // Remove import statements
    .replace(/export\s+.*?;/g, '') // Remove export statements
    .replace(/{\/\*.*?\*\/}/gs, '') // Remove JSX comments
    .replace(/{`(.*?)`}/g, '$1') // Replace template literals
    .replace(/{(.*?)}/g, '') // Remove remaining JSX expressions
    .trim();
}
