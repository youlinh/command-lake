import {cpSync,readFileSync,writeFileSync} from 'node:fs';

const web=new URL('../web/',import.meta.url);
const output=new URL('../dist/pages/',import.meta.url);
cpSync(web,output,{recursive:true});
const index=new URL('index.html',output);
const html=readFileSync(index,'utf8').replace('</head>','  <meta name="command-lake-mode" content="static">\n</head>');
writeFileSync(index,html);
writeFileSync(new URL('.nojekyll',output),'');
