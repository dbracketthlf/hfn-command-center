import { isTerminalWorkTask, workPriorityKey, workPriorityTime } from './work-priority.js';
import { defaultCalendar, dueAt } from './hfn-business-time.js';

const externalWaiting=new Set(['borrower','underwriter','lender','title_escrow','appraiser','insurance_agent','payoff_provider','hoa_management','vendor']);
const internalWaiting=new Set(['processor_review_issue','internal']);
const urgency=Object.freeze({past_due:0,escalated:1,blocked:2,action_required:3,follow_up_due:4,due_soon:5,waiting:6});

const validTimestamp=value=>Number.isFinite(new Date(value??'').getTime());
const positiveCadence=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
const waitingKindFor=value=>externalWaiting.has(value)?'external':internalWaiting.has(value)?'internal':null;

export function workflowAgingForTask(task,{now=new Date(),calendar=defaultCalendar}={}){
  const priority=workPriorityKey(task,{now}),waitingOn=String(task?.waitingOn??'').trim().toLowerCase(),waitingKind=waitingKindFor(waitingOn),state=String(task?.state??'').trim().toLowerCase();
  if(isTerminalWorkTask(task))return {kind:'terminal',priority,waitingKind:null,stalled:false};
  const externalFollowUp=waitingKind==='external'&&(state==='waiting'||state==='follow_up_due'||priority==='follow_up_due'),cadence=positiveCadence(task?.followUpCadenceBusinessDays);
  const stalledAfter=externalFollowUp&&cadence&&validTimestamp(task?.nextFollowUpAt)?dueAt(task.nextFollowUpAt,{kind:'businessHours',value:cadence*8.5},calendar):null;
  const externalFollowUpStalled=Boolean(stalledAfter)&&now.getTime()>stalledAfter.getTime();
  if(state==='escalated'||task?.priority==='escalated'||priority==='escalated')return {kind:'escalated',priority,waitingKind,stalled:true};
  // A waiting external task is managed by its scheduled follow-up. Its original
  // action deadline must not convert it to a stalled loan when no schedule exists.
  if(priority==='past_due')return {kind:'overdue',priority,waitingKind,stalled:state!=='waiting'&&state!=='blocked'};
  if(priority==='follow_up_due')return {kind:'follow_up_due',priority,waitingKind,stalled:externalFollowUpStalled};
  if(priority==='waiting')return {kind:waitingKind==='external'?'waiting_external':waitingKind==='internal'?'waiting_internal':'waiting',priority,waitingKind,stalled:false};
  return {kind:'actionable',priority,waitingKind,stalled:false};
}

/**
 * A loan is stalled only when an internal required action is overdue, an
 * external follow-up has remained unresolved for a full additional configured
 * cadence, or the task is explicitly escalated. It deliberately does not use
 * webhook age or treat a newly due follow-up as a stalled loan.
 */
export function stalledLoanSignals(tasks=[],{now=new Date(),calendar=defaultCalendar}={}){
  const byLoan=new Map();
  for(const task of tasks){
    if(isTerminalWorkTask(task))continue;
    const aging=workflowAgingForTask(task,{now,calendar});
    if(!aging.stalled)continue;
    const key=task.displayLoanId||task.id;
    const candidate={displayLoanId:key,task,aging};
    const current=byLoan.get(key);
    if(!current||(urgency[candidate.aging.priority]??99)<(urgency[current.aging.priority]??99)||workPriorityTime(candidate.task.dueAt)<workPriorityTime(current.task.dueAt))byLoan.set(key,candidate);
  }
  return [...byLoan.values()].sort((left,right)=>(urgency[left.aging.priority]??99)-(urgency[right.aging.priority]??99)||workPriorityTime(left.task.dueAt)-workPriorityTime(right.task.dueAt));
}
