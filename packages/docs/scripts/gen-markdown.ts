#!/usr/bin/env bun

import { getFiles, getFileBySlug, mdxToPlainMd } from '../src/utils/mdx.js';

const BLOG_URI = 'https://www.triplit.dev/blog/';

async function generate() {
  const postFiles = await getFiles();
  const posts = await Promise.all(
    postFiles.map(async (path) => {
      const { content } = await getFileBySlug(path.replace(/\.mdx?$/, ''));
      return { content, path };
    })
  );
  for (const post of posts) {
    // await fs.writeFile(`./public/${post.path}`, post.content, 'utf8');
    await Bun.write('./public/' + post.path, mdxToPlainMd(post.content), {
      createPath: true,
    });
  }
}

generate();
