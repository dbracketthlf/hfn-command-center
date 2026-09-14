const trackerKeys=Object.freeze(['appraisalStatus','appraisalTrackerDate','titleStatus','titleTrackerDate','hoiStatus','hoiTrackerDate']);
const milestoneKeys=Object.freeze(['appraisalOrderedDate','appraisalReceivedDate','titleOrderedDate','titleReceivedDate','hoiOrderedDate','hoiReceivedDate','initialCDSentDate']);
const field=(record,key)=>!Object.hasOwn(record??{},key)?{state:'ABSENT'}:record[key]===null?{state:'NULL'}:{state:'VALUE',value:record[key]};
const fields=(record,keys)=>Object.fromEntries(keys.map(key=>[key,field(record,key)]));
const historicalUnavailable='UNAVAILABLE_FOR_HISTORICAL_EVENT';
const requestShape=event=>Object.hasOwn(event,'incomingFieldPresence')?{
  incomingFieldPresence:event.incomingFieldPresence,
  topLevelKeys:Array.isArray(event.topLevelKeys)?event.topLevelKeys:[],
  payloadStructure:event.payloadStructure??null
}:{incomingFieldPresence:historicalUnavailable,topLevelKeys:historicalUnavailable,payloadStructure:historicalUnavailable};
export const safeInboundEventHistory=events=>events.map(event=>({receivedAt:event.receivedAt,eventId:event.id,source:event.source,sourceEventId:event.sourceEventId??null,triggerSource:event.triggerSource??null,suppliedEventId:event.suppliedEventId??null,processingStatus:event.processingStatus,currentLoanStatus:event.currentLoanStatus??null,...requestShape(event),trackerContext:fields(event.trackerContext,trackerKeys),milestoneDates:fields(event.milestoneDates,milestoneKeys)}));
