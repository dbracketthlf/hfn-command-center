export const submissionPackageItemTypes=Object.freeze(['appraisal','title','insurance','payoff','borrower_conditions']);

const reviewItemType=Object.freeze({review_appraisal:'appraisal',review_title:'title',review_insurance:'insurance',review_payoff:'payoff'});
const outstandingItemType=Object.freeze({
  borrower_conditions_follow_up:'borrower_conditions',
  review_appraisal:'appraisal', review_title:'title', review_insurance:'insurance', review_payoff:'payoff',
  order_appraisal:'appraisal', appraisal_follow_up:'appraisal',
  order_title_escrow:'title', title_follow_up:'title',
  request_insurance_eoi:'insurance', insurance_follow_up:'insurance',
  order_payoff:'payoff', payoff_follow_up:'payoff'
});
const labels=Object.freeze({appraisal:'Appraisal',title:'Title / Escrow',insurance:'Insurance / EOI',payoff:'Payoff',borrower_conditions:'Borrower Conditions'});

export const submissionItemTypeForTask=taskType=>reviewItemType[taskType]??(taskType==='borrower_conditions_follow_up'?'borrower_conditions':null);
export const submissionItemLabel=itemType=>labels[itemType]??itemType;
export function legitimateSubmissionOutstanding(tasks=[],readyItems=[]){
  const ready=new Set(readyItems.map(item=>item.itemType));
  const byType=new Map();
  for(const task of tasks){
    if(['completed','cancelled','not_applicable'].includes(task.state))continue;
    const itemType=outstandingItemType[task.taskType];
    if(!itemType||ready.has(itemType)||byType.has(itemType))continue;
    byType.set(itemType,{itemType,label:submissionItemLabel(itemType),taskType:task.taskType,taskId:task.id,waitingOn:task.waitingOn??null});
  }
  return [...byType.values()];
}
