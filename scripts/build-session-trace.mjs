import { build } from 'vite';
import { mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const version='0.1.0', destination=path.resolve('extension-dist'), staging=path.join(destination,'build');
await rm(staging,{recursive:true,force:true});await mkdir(staging,{recursive:true});
await build({configFile:false,root:path.resolve('extensions/session-trace/ui'),base:'./',esbuild:{jsx:'automatic'},build:{outDir:path.join(staging,'ui'),emptyOutDir:true,minify:'esbuild',rollupOptions:{output:{entryFileNames:'app.js',assetFileNames:'[name][extname]'}}}});
await build({configFile:false,build:{outDir:path.join(staging,'runtime'),emptyOutDir:true,target:'node22',minify:false,lib:{entry:path.resolve('extensions/session-trace/runtime/index.ts'),formats:['cjs'],fileName:()=> 'index.cjs'},rollupOptions:{external:/^node:/}}});
const files={};
async function collect(directory,prefix='') {for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const name=prefix+entry.name;if(entry.isDirectory())await collect(path.join(directory,entry.name),name+'/');else files[name]=await readFile(path.join(directory,entry.name),'utf8');}}
await collect(staging);
const manifest={id:'session-trace',version,apiVersion:1,hostMajor:1,ui:'ui/index.html',runtime:'runtime/index.cjs'};
const bytes=Buffer.from(JSON.stringify({manifest,files}));
const filename=`session-trace-${version}.navo-extension`;
await writeFile(path.join(destination,filename),bytes);
const release={version,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,url:`https://github.com/leezhian/navo/releases/download/session-trace-v${version}/${filename}`};
if(process.argv.includes('--update-catalog'))await writeFile('src/main-process/services/extensions/sessionTraceRelease.json',JSON.stringify(release,null,2)+'\n');
else {const expected=JSON.parse(await readFile('src/main-process/services/extensions/sessionTraceRelease.json','utf8'));if(expected.sha256!==release.sha256)throw Error('Package differs from pinned catalog. Review changes, then rebuild with --update-catalog.');}
console.log(JSON.stringify({artifact:path.join(destination,filename),...release},null,2));
