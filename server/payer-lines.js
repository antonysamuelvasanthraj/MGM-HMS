import {all} from './db.js';
import {itemMoney} from './accounting.js';
export function patientLineAmount(line){
 if(!line.patient_pays)return 0;
 const total=Math.max(0,itemMoney(line).total);
 return Math.round(Math.min(total,line.patient_pay_amount==null?total:Math.max(0,Number(line.patient_pay_amount)||0))*100)/100;
}
export function billExclusions(id){
 return Math.round(all(`SELECT i.* FROM bill_items i WHERE i.bill_id=? AND i.amount>0 AND i.waiver_of IS NULL
 AND NOT EXISTS(SELECT 1 FROM bill_items w WHERE w.waiver_of=i.id)`,id).reduce((sum,line)=>sum+patientLineAmount(line),0)*100)/100;
}
