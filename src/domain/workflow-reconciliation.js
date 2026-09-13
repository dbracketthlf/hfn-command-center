import { randomUUID } from 'node:crypto';

export const ariveMilestoneTaskMap=Object.freeze([
  ['appraisalOrderedDate','order_appraisal','appraisal_ordered'],
  ['titleOrderedDate','order_title_escrow','title_ordered'],
  ['hoiOrderedDate','request_insurance_eoi','hoi_ordered'],
  ['initialCDSentDate','closing_disclosure_sent','initial_cd_sent']
]);

export async function reconcileAriveMilestones(executor,{loanId,milestoneDates={},dryRun=false}){
  const reconciled=[];
  for(const [field,taskType,milestone] of ariveMilestoneTaskMap){
    const completedAt=milestoneDates[field];if(!completedAt||Number.isNaN(new Date(completedAt).getTime()))continue;
    const task=await executor.query(`select id,state,kpi_eligible from workflow_tasks where loan_id=$1 and task_type=$2 and state not in ('completed','cancelled','not_applicable')`,[loanId,taskType]);
    for(const row of task.rows){reconciled.push({taskId:row.id,taskType,completedAt});if(dryRun)continue;await executor.query("update workflow_tasks set state='completed',completed_at=$2,updated_at=now() where id=$1 and state not in ('completed','cancelled','not_applicable')",[row.id,completedAt]);await executor.query('insert into workflow_task_history(id,task_id,occurred_at,action,to_state,metadata) values($1,$2,$3,$4,$5,$6)',[randomUUID(),row.id,completedAt,'arive_milestone_reconciled','completed',{milestone,authoritativeAt:completedAt,source:'arive'}]);}
  }
  return reconciled;
}
