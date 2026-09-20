import { isTerminalWorkTask, workPriorityKey, workPriorityTime } from './work-priority.js';

const externalWaiting=new Set(['borrower','underwriter','lender','title_escrow','appraiser','insurance_agent','payoff_provider','hoa_management','vendor']);
const internalWaiting=new Set(['processor_review_issue','internal']);
const urgency=Object.freeze({past_due:0,escalated:1,blocked:2,action_required:3,follow_up_due:4,due_soon:5,waiting:6});

export function workflowAgingForTask(task,{now=new Date()}={}){
  const priority=workPriorityKey(task,{now}),waitingOn=String(task?.waitingOn??'').trim().toLowerCase();
  if(isTerminalWorkTask(task))return {kind:'terminal',priority,waitingKind:null,stalled:false};
  if(priority==='past_due')return {kind:'overdue',priority,waitingKind:null,stalled:true};
  if(priority==='follow_up_due')return {kind:'follow_up_due',priority,waitingKind:externalWaiting.has(waitingOn)?'external':internalWaiting.has(waitingOn)?'internal':null,stalled:true};
  if(priority==='escalated')return {kind:'escalated',priority,waitingKind:null,stalled:true};
  if(priority==='waiting')return {kind:externalWaiting.has(waitingOn)?'waiting_external':internalWaiting.has(waitingOn)?'waiting_internal':'waiting',priority,waitingKind:externalWaiting.has(waitingOn)?'external':internalWaiting.has(waitingOn)?'internal':null,stalled:false};
  return {kind:'actionable',priority,waitingKind:null,stalled:false};
}

/**
 * A loan is stalled only when established workflow timing says its current
 * meaningful action is overdue or an external follow-up is now due. This
 * intentionally avoids an arbitrary "days since webhook" clock.
 */
export function stalledLoanSignals(tasks=[],{now=new Date()}={}){
  const byLoan=new Map();
  for(const task of tasks){
    if(isTerminalWorkTask(task))continue;
    const aging=workflowAgingForTask(task,{now});
    if(!aging.stalled)continue;
    const key=task.displayLoanId??task.id;
    const candidate={displayLoanId:key,task,aging};
    const current=byLoan.get(key);
    if(!current||(urgency[candidate.aging.priority]??99)<(urgency[current.aging.priority]??99)||workPriorityTime(candidate.task.dueAt)<workPriorityTime(current.task.dueAt))byLoan.set(key,candidate);
  }
  return [...byLoan.values()].sort((left,right)=>(urgency[left.aging.priority]??99)-(urgency[right.aging.priority]??99)||workPriorityTime(left.task.dueAt)-workPriorityTime(right.task.dueAt));
}
