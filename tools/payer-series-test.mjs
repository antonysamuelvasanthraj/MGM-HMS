import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hms-payer-series-'));
process.env.SURELY_DATA=dir;
const {db,nextNo}=await import('../server/db.js');
try {
 const self=nextNo('bill_SELF'),tpa=nextNo('bill_TPA');
 assert.equal(self,tpa,'Each payer category starts its own counter');
 assert.ok(self.endsWith('00001'));
 assert.ok(nextNo('bill_SELF').endsWith('00002'));
 assert.ok(nextNo('bill_TPA').endsWith('00002'));
 assert.ok(nextNo('bill_AAR').endsWith('00001'));
 assert.ok(nextNo('bill_TRUST').endsWith('00001'));
 console.log('PASS: independent SELF, TPA, Aarogyasri and trust numbering counters');
}finally{
 db.close();const actual=fs.realpathSync(dir);
 if(path.dirname(actual)===fs.realpathSync(os.tmpdir())&&path.basename(actual).startsWith('hms-payer-series-'))fs.rmSync(actual,{recursive:true,force:true});
}
