import { createHash } from 'node:crypto';
import { mergeOperationalSnapshot } from './operational-snapshot.js';

const stable=value=>JSON.stringify(value,Object.keys(value??{}).sort());
export const operationalSnapshotHash=snapshot=>createHash('sha256').update(stable(snapshot)).digest('hex');
export function recoverOperationalSnapshot(events=[]){return events.reduce((snapshot,event)=>mergeOperationalSnapshot(snapshot,{milestoneDates:event.milestoneDates??{},trackerContext:event.trackerContext??{}}),{});}
export function snapshotChanges(current={},recovered={}){const changed=[];for(const section of ['milestoneDates','trackerContext'])for(const [key,value] of Object.entries(recovered[section]??{}))if(current[section]?.[key]!==value)changed.push(`${section}.${key}`);return changed;}
