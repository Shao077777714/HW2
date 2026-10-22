import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {execFile} from 'node:child_process';
const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.png':'image/png', '.json':'application/json' };
const server = http.createServer(async (req,res) => {
  try {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (route === '/' ? '/index.html' : route));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (!(await stat(file)).isFile()) throw new Error('not found');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end('Not found'); }
});
const port=Number(process.env.PORT || 4173),url=`http://127.0.0.1:${port}`;
function openBrowser(){if(process.argv.includes('--open')&&process.platform==='win32')execFile('cmd.exe',['/c','start','',url],{windowsHide:true},()=>{});}
server.on('error',error=>{if(error.code==='EADDRINUSE'){console.log(`本機 ${port} 已在使用，請查看 ${url}`);openBrowser();}else {console.error(error.message);process.exitCode=1;}});
server.listen(port, '127.0.0.1', () => {console.log(`天空島已啟動：${url}\n關閉這個視窗可停止本機預覽。`);openBrowser();});
