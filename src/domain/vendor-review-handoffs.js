import { reconciliationEvidence } from './workflow-reconciliation.js';

/**
 * Processor review work begins only from authoritative vendor receipt evidence.
 * These are operational tasks, deliberately distinct from employee SLA scoring.
 */
const handoffs=Object.freeze([
  {receivedTaskType:'appraisal_follow_up',taskType:'review_appraisal',title:'Review Appraisal',milestone:'appraisal_received'},
  {receivedTaskType:'title_follow_up',taskType:'review_title',title:'Review Title',milestone:'title_received'},
  {receivedTaskType:'insurance_follow_up',taskType:'review_insurance',title:'Review Insurance',milestone:'hoi_received'}
]);

export function vendorReviewHandoffEvidence(milestoneDates={},trackerContext={}) {
  const evidence=reconciliationEvidence(milestoneDates,trackerContext);
  return handoffs.flatMap(handoff=>{
    const receipt=evidence.find(item=>item.taskType===handoff.receivedTaskType);
    if(!receipt?.completedAt||Number.isNaN(new Date(receipt.completedAt).getTime()))return [];
    return [{...handoff,authoritativeAt:receipt.completedAt,evidence:receipt.evidence}];
  });
}

export const manualPayoffReviewEvidence=completedAt=>{
  if(!completedAt||Number.isNaN(new Date(completedAt).getTime()))return null;
  return {taskType:'review_payoff',title:'Review Payoff',milestone:'payoff_received',authoritativeAt:completedAt,evidence:'authenticated_manual_payoff_received'};
};
