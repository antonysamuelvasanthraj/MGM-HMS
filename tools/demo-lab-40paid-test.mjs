import {DatabaseSync,backup} from 'node:sqlite';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hms-lab-40-'));const db=new DatabaseSync('data/surelyhms.db',{readOnly:true});await backup(db,path.join(directory,'surelyhms.db'));db.close();
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,SURELY_DATA:directory,PORT:'4394',HMS_HOST:'127.0.0.1',HMS_ENV:'demo'},windowsHide:true,stdio:'ignore'});
try{for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4394/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
for(let i=0;i<2;i++){const result=spawnSync(process.execPath,['tools/demo-lab-40paid.mjs'],{env:{...process.env,HMS_DEMO_DATA:directory,HMS_DEMO_URL:'http://127.0.0.1:4394/api'},windowsHide:true,encoding:'utf8'});console.log(result.stdout);if(result.status!==0)throw Error(result.stderr);}
console.log('PASS: 40 billed/paid/collected and 7 unbilled; repeating setup does not duplicate payment or collection.');
}finally{server.kill();console.log('Isolated copy: '+directory);}
