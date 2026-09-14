import { workPriorityKey, workPriorityTime } from './work-priority.js';
const pacificDay=value=>{const date=new Date(value??'');if(!Number.isFinite(date.getTime()))return null;return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);};
const ctcRank=clock=>clock?.status==='CRITICAL'?0:clock?.status==='AT_RISK'?1:clock?.status==='ON_TRACK'?2:3;
const labels={past_due:'Past Due',escalated:'Escalated',blocked:'Blocked',action_due_today:'Due Today',follow_up_due:'Follow-Up Due',due_soon:'Due Soon',waiting:'Waiting'};

export function priorityForTask(task,{now=new Date()}={}){
  const key=workPriorityKey(task,{now});
  if(key==='past_due')return {tier:0,key,label:labels.past_due};
  if(key==='escalated')return {tier:1,key,label:labels.escalated};
  if(key==='blocked')return {tier:2,key,label:labels.blocked};
  if(key==='action_required'&&pacificDay(task.dueAt)===pacificDay(now))return {tier:3,key:'action_due_today',label:labels.action_due_today};
  if(key==='follow_up_due')return {tier:4,key,label:labels.follow_up_due};
  if(key==='due_soon'||key==='action_required')return {tier:5,key:'due_soon',label:labels.due_soon};
  return {tier:6,key:'waiting',label:labels.waiting};
}

const compare=(left,right)=>left.priority.tier-right.priority.tier||ctcRank(left.task.ctcClock)-ctcRank(right.task.ctcClock)||workPriorityTime(left.task.dueAt)-workPriorityTime(right.task.dueAt)||workPriorityTime(left.task.nextFollowUpAt)-workPriorityTime(right.task.nextFollowUpAt)||String(left.displayLoanId??'').localeCompare(String(right.displayLoanId??''));

/** Builds one explainable priority item per authorized loan. */
export function buildTodaysPriorities(tasks=[],{now=new Date(),limit=5}={}){
  const loans=new Map();
  for(const task of tasks){const displayLoanId=task.displayLoanId??task.id,entry={task,displayLoanId,priority:priorityForTask(task,{now})};const existing=loans.get(displayLoanId);if(!existing||compare(entry,existing)<0)loans.set(displayLoanId,entry);}
  const all=[...loans.values()].sort(compare).map(item=>({...item,reason:[item.priority.label,...(['CRITICAL','AT_RISK'].includes(item.task.ctcClock?.status)?[`CTC ${item.task.ctcClock.status==='AT_RISK'?'At Risk':'Critical'}`]:[])].join(' · ')}));
  return {all,top:all.slice(0,limit)};
}
