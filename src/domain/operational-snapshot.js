const milestoneKeys=Object.freeze(['initialLESentDate','initialLESignedDate','intentToProceedDate','initialCDSentDate','mostRecentCDSentDate','initialCDSignedDate','mostRecentCDSignedDate','appraisalOrderedDate','appraisalReceivedDate','titleOrderedDate','titleReceivedDate','hoiOrderedDate','hoiReceivedDate']);
const trackerKeys=Object.freeze(['appraisalStatus','appraisalTrackerDate','titleStatus','titleTrackerDate','hoiStatus','hoiTrackerDate']);
const present=value=>value!==undefined&&value!==null&&value!=='';
const mergeFields=(previous={},incoming={},keys)=>Object.fromEntries(keys.flatMap(key=>present(incoming[key])?[[key,incoming[key]]]:present(previous[key])?[[key,previous[key]]]:[]));

/** Safe allowlisted PATCH semantics: omitted/null values never clear prior ARIVE facts. */
export function mergeOperationalSnapshot(previous={},incoming={}){
  return {milestoneDates:mergeFields(previous.milestoneDates,incoming.milestoneDates,milestoneKeys),trackerContext:mergeFields(previous.trackerContext,incoming.trackerContext,trackerKeys)};
}
