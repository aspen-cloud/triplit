import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function createServer(_assetPath, consoleParams) {
  const basePath = path.resolve(fileURLToPath(import.meta.url), '../public');
  return http.createServer((req, res) => {
    // Default to index.html
    const [urlPath] = req.url.split('?');
    const isFileRoute =
      urlPath.endsWith('.css') ||
      urlPath.endsWith('.js') ||
      urlPath.endsWith('.jpeg') ||
      urlPath.endsWith('.jpg');
    const filePath = path.join(basePath, isFileRoute ? urlPath : 'index.html');
    const extname = path.extname(filePath);

    if (consoleParams && req.url === '/') {
      const id = consoleParams.server.split('://')[1];
      res.writeHead(302, {
        Location: `/${id}?` + new URLSearchParams(consoleParams).toString(),
      });
      res.end();
      return;
    }
    // Set content type based on the file's extension
    let contentType = 'text/html';
    switch (extname) {
      case '.js':
        contentType = 'text/javascript';
        break;
      case '.css':
        contentType = 'text/css';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      default:
        break;
    }

    // Read and serve the file
    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code == 'ENOENT') {
          // File not found
          res.writeHead(404);
          res.end('Page not found');
        } else {
          // Server error
          res.writeHead(500);
          // @ts-ignore
          res.end('Server Error:', err.code);
        }
      } else {
        // Success
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf8');
      }
    });
  });
}
