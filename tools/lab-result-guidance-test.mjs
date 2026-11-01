import assert from 'node:assert/strict';import {resultGuidance} from '../server/lab-result-guidance.js';
const high={name:'Glucose (random)',value:'250',unit:'mg/dL',ref_range:'70 - 140 mg/dL',flag:'high'};
const notes=resultGuidance([{name:'Random Blood Sugar',value:'140',flag:''},high],'LAB-RBS');
assert.equal(notes.length,1);assert.match(notes[0].finding,/250 mg\/dL is above/);assert.match(notes[0].note,/not an automatic diagnosis/);
assert.match(resultGuidance([{...high,value:'50',flag:'low'}],'LAB-RBS')[0].note,/low glucose/);
assert.match(resultGuidance([{...high,flag:'critical'}],'LAB-RBS')[0].note,/critical-result procedure/);
assert.equal(resultGuidance([{...high,flag:''}],'LAB-RBS').length,0);
assert.match(resultGuidance([{...high,name:'Haemoglobin',flag:'low'}],'LAB-HB')[0].note,/test-specific instructions/);
console.log('PASS: high, low and critical guidance follows the recorded parameter flag; unflagged results receive no abnormal guidance.');
