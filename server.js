const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf',
};

const server = http.createServer((req, res) => {
  // Remove query strings (like ?v=2) for file lookup
  let filePath = req.url.split('?')[0];

  if (filePath === '/' || filePath === '') {
    filePath = '/index.html';
  }

  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(fullPath).toLowerCase();

  // No caching for JS files to always serve fresh versions
  const noCacheExts = ['.js', '.html'];

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 - Not Found</h1>');
      return;
    }

    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    };

    if (noCacheExts.includes(ext)) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }

    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`AP Fondos server running on port ${PORT}`);
});
