import { randomUUID } from 'node:crypto';

export const ariveMilestoneTaskMap=Object.freeze([
  ['appraisalOrderedDate','order_appraisal','appraisal_ordered','appraisalStatus','appraisalTrackerDate'],
  ['titleOrderedDate','order_title_escrow','title_ordered','titleStatus','titleTrackerDate'],
  ['hoiOrderedDate','request_insurance_eoi','hoi_ordered','hoiStatus','hoiTrackerDate'],
  ['initialCDSentDate','closing_disclosure_sent','initial_cd_sent',null,null]
]);
const ordered=value=>String(value??'').trim().toUpperCase()==='ORDERED';
export function reconciliationEvidence(milestoneDates={},trackerContext={}){return ariveMilestoneTaskMap.map(([keyDate,taskType,milestone,statusKey,dateKey])=>{const keyAt=milestoneDates[keyDate];const fallbackAt=!keyAt&&statusKey&&ordered(trackerContext[statusKey])?trackerContext[dateKey]??null:null;return {taskType,milestone,completedAt:keyAt??fallbackAt,evidence:keyAt?'key_date':fallbackAt?'tracker_ordered_date':null};});}
export async function reconcileAriveMilestones(executor,{loanId,milestoneDates={},trackerContext={},dryRun=false}){
  const reconciled=[];
  for(const evidence of reconciliationEvidence(milestoneDates,trackerContext)){
    if(!evidence.completedAt||Number.isNaN(new Date(evidence.completedAt).getTime()))continue;
    const task=await executor.query(`select id,state,kpi_eligible from workflow_tasks where loan_id=$1 and task_type=$2 and state not in ('completed','cancelled','not_applicable')`,[loanId,evidence.taskType]);
    for(const row of task.rows){reconciled.push({taskId:row.id,taskType:evidence.taskType,completedAt:evidence.completedAt,evidence:evidence.evidence});if(dryRun)continue;await executor.query("update workflow_tasks set state='completed',completed_at=$2,updated_at=now() where id=$1 and state not in ('completed','cancelled','not_applicable')",[row.id,evidence.completedAt]);await executor.query('insert into workflow_task_history(id,task_id,occurred_at,action,to_state,metadata) values($1,$2,$3,$4,$5,$6)',[randomUUID(),row.id,evidence.completedAt,'arive_milestone_reconciled','completed',{milestone:evidence.milestone,authoritativeAt:evidence.completedAt,evidence:evidence.evidence,source:'arive'}]);}
  } return reconciled;
}
