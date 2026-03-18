var http = require('http');
var fs = require('fs');
var path = require('path');
var MIME = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
var BASE = __dirname;

http.createServer(function(req, res) {
  var urlPath = req.url.split('?')[0];
  var p = path.join(BASE, urlPath === '/' ? 'daw.html' : urlPath);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(p)] || 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
  });
  fs.createReadStream(p).pipe(res);
}).listen(3000, function() {
  console.log('DAW server: http://localhost:3000/daw.html (COEP+COOP enabled)');
});
