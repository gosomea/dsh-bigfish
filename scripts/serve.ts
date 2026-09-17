import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const port = Number(process.env.BIGFISH_PREVIEW_PORT ?? 4178);
const server = createServer(async (req, res) => {
  if (req.url !== '/' && req.url !== '/preview.html') { res.writeHead(404); res.end(); return; }
  try { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await readFile(resolve('dist/preview.html'))); }
  catch { res.writeHead(503); res.end('Run pnpm build first'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Bigfish preview: http://127.0.0.1:${port}`));
