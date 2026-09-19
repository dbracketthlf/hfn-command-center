import { reconciliationEvidence, receivedWithoutOrderedSupersessionEvidence } from './workflow-reconciliation.js';

const terminalTaskStates=new Set(['completed','cancelled','not_applicable']);
const open=task=>task&&!terminalTaskStates.has(task.state);
const validAt=value=>Boolean(value)&&!Number.isNaN(new Date(value).getTime());

export function staleVendorTaskCandidates({milestoneDates={},trackerContext={},tasks=[]}){
  const byType=new Map(tasks.map(task=>[task.taskType,task]));
  const initial=receivedWithoutOrderedSupersessionEvidence(milestoneDates,trackerContext).flatMap(item=>{
    const task=byType.get(item.initialTaskType);
    if(!open(task)||byType.has(item.followUpTaskType))return [];
    return [{category:'initial_task_superseded',taskType:item.initialTaskType,taskState:task.state,finalMilestone:item.finalMilestone,finalMilestoneAt:item.authoritativeAt,evidence:item.evidence,orderedTimestamp:'unknown',proposedAction:'cancel_initial_task_as_superseded'}];
  });
  const followUps=reconciliationEvidence(milestoneDates,trackerContext).flatMap(item=>{
    if(!item.taskType.endsWith('_follow_up')||!validAt(item.completedAt))return [];
    const task=byType.get(item.taskType);
    if(!open(task))return [];
    return [{category:'follow_up_should_complete',taskType:item.taskType,taskState:task.state,finalMilestone:item.milestone,finalMilestoneAt:item.completedAt,evidence:item.evidence,orderedTimestamp:null,proposedAction:'complete_follow_up_from_authoritative_final_evidence'}];
  });
  return [...initial,...followUps];
}
