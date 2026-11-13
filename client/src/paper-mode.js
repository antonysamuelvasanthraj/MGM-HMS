import {setting} from './store.js';
export const paperOnly=()=>setting('hospital_mode')==='paper'||(!['hybrid','paperless'].includes(setting('hospital_mode'))&&setting('workflow_doctor')==='manual');
const digitalScreens=new Set(['/vitals-queue','/doctor-queue','/follow-up','/display-queue','/visit-tracking','/consultation','/doctor-consultation','/consultation-history','/nursing','/icu','/partograph','/counselling']);
export const paperScreenBlocked=route=>paperOnly()&&digitalScreens.has(route);
