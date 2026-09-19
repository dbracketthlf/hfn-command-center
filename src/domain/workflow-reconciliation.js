import { randomUUID } from 'node:crypto';

export const ariveMilestoneTaskMap=Object.freeze([
  ['appraisalOrderedDate','order_appraisal','appraisal_ordered','appraisalStatus','appraisalTrackerDate'],
  ['titleOrderedDate','order_title_escrow','title_ordered','titleStatus','titleTrackerDate'],
  ['hoiOrderedDate','request_insurance_eoi','hoi_ordered','hoiStatus','hoiTrackerDate'],
  ['appraisalReceivedDate','appraisal_follow_up','appraisal_received',null,null],
  ['titleReceivedDate','title_follow_up','title_received',null,null],
  ['hoiReceivedDate','insurance_follow_up','hoi_received',null,null],
  ['initialCDSentDate','closing_disclosure_sent','initial_cd_sent',null,null]
]);
const receivedWithoutOrderedMappings=Object.freeze([
  {initialTaskType:'order_appraisal',followUpTaskType:'appraisal_follow_up',receivedTaskType:'appraisal_follow_up',finalMilestone:'appraisal_received'},
  {initialTaskType:'order_title_escrow',followUpTaskType:'title_follow_up',receivedTaskType:'title_follow_up',finalMilestone:'title_received'},
  {initialTaskType:'request_insurance_eoi',followUpTaskType:'insurance_follow_up',receivedTaskType:'insurance_follow_up',finalMilestone:'hoi_received'}
]);
const trackerStatus=(value,expected)=>String(value??'').trim().toUpperCase()===expected;
const ordered=value=>trackerStatus(value,'ORDERED');
const received=value=>trackerStatus(value,'RECEIVED');
export function reconciliationEvidence(milestoneDates={},trackerContext={}){return ariveMilestoneTaskMap.map(([keyDate,taskType,milestone,statusKey,dateKey])=>{const keyAt=milestoneDates[keyDate];const fallbackAt=!keyAt&&statusKey&&ordered(trackerContext[statusKey])?trackerContext[dateKey]??null:null;const titleReceivedFallback=!keyAt&&taskType==='title_follow_up'&&received(trackerContext.titleStatus)?trackerContext.titleTrackerDate??null:null;const completedAt=keyAt??fallbackAt??titleReceivedFallback;return {taskType,milestone,completedAt,evidence:keyAt?'key_date':fallbackAt?'tracker_ordered_date':titleReceivedFallback?'tracker_received_date':null};});}
export function receivedWithoutOrderedSupersessionEvidence(milestoneDates={},trackerContext={}){
  const evidence=reconciliationEvidence(milestoneDates,trackerContext);
  return receivedWithoutOrderedMappings.flatMap(mapping=>{
    const receivedEvidence=evidence.find(item=>item.taskType===mapping.receivedTaskType);
    const orderedEvidence=evidence.find(item=>item.taskType===mapping.initialTaskType);
    if(orderedEvidence?.completedAt||!receivedEvidence?.completedAt||Number.isNaN(new Date(receivedEvidence.completedAt).getTime()))return [];
    return [{...mapping,authoritativeAt:receivedEvidence.completedAt,evidence:receivedEvidence.evidence,orderedTimestamp:'unknown'}];
  });
}
export async function reconcileAriveMilestones(executor,{loanId,milestoneDates={},trackerContext={},dryRun=false}){
  const reconciled=[];
  for(const evidence of reconciliationEvidence(milestoneDates,trackerContext)){
    if(!evidence.completedAt||Number.isNaN(new Date(evidence.completedAt).getTime()))continue;
    const task=await executor.query(`select id,state,kpi_eligible from workflow_tasks where loan_id=$1 and task_type=$2 and state not in ('completed','cancelled','not_applicable')`,[loanId,evidence.taskType]);
    for(const row of task.rows){reconciled.push({taskId:row.id,taskType:evidence.taskType,completedAt:evidence.completedAt,evidence:evidence.evidence});if(dryRun)continue;await executor.query("update workflow_tasks set state='completed',completed_at=$2,updated_at=now() where id=$1 and state not in ('completed','cancelled','not_applicable')",[row.id,evidence.completedAt]);await executor.query('insert into workflow_task_history(id,task_id,occurred_at,action,to_state,metadata) values($1,$2,$3,$4,$5,$6)',[randomUUID(),row.id,evidence.completedAt,'arive_milestone_reconciled','completed',{milestone:evidence.milestone,authoritativeAt:evidence.completedAt,evidence:evidence.evidence,source:'arive'}]);}
  } return reconciled;
}
