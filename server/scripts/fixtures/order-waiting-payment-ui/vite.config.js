import path from 'node:path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({root:dir,publicDir:false,plugins:[react()],server:{host:'127.0.0.1',port:5208,strictPort:true,fs:{allow:[path.resolve(dir,'../../../..')]}},resolve:{dedupe:['react','react-dom']}});
