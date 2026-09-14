const time=value=>{const parsed=new Date(value??'').getTime();return Number.isFinite(parsed)?parsed:Infinity;};
const pacificDay=value=>{const date=new Date(value??'');if(!Number.isFinite(date.getTime()))return null;return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);};
const ctcRank=clock=>clock?.status==='CRITICAL'?0:clock?.status==='AT_RISK'?1:clock?.status==='ON_TRACK'?2:3;
const labels={past_due:'Past Due',escalated:'Escalated',blocked:'Blocked',action_due_today:'Due Today',follow_up_due:'Follow-Up Due',due_soon:'Due Soon',waiting:'Waiting'};

export function priorityForTask(task,{now=new Date()}={}){
  const nowTime=now.getTime(),due=time(task.dueAt),followUp=time(task.nextFollowUpAt),today=pacificDay(now);
  if(task.priority==='past_due'||due<nowTime)return {tier:0,key:'past_due',label:labels.past_due};
  if(task.state==='escalated'||task.priority==='escalated')return {tier:1,key:'escalated',label:labels.escalated};
  if(task.state==='blocked'||task.priority==='blocked')return {tier:2,key:'blocked',label:labels.blocked};
  if((task.state==='action_required'||task.priority==='action_required')&&pacificDay(task.dueAt)===today)return {tier:3,key:'action_due_today',label:labels.action_due_today};
  if(task.priority==='follow_up_due'||task.state==='follow_up_due'||followUp<=nowTime)return {tier:4,key:'follow_up_due',label:labels.follow_up_due};
  if(task.priority==='due_soon'||task.state==='due_soon'||task.state==='action_required')return {tier:5,key:'due_soon',label:labels.due_soon};
  return {tier:6,key:'waiting',label:labels.waiting};
}

const compare=(left,right)=>left.priority.tier-right.priority.tier||ctcRank(left.task.ctcClock)-ctcRank(right.task.ctcClock)||time(left.task.dueAt)-time(right.task.dueAt)||time(left.task.nextFollowUpAt)-time(right.task.nextFollowUpAt)||String(left.displayLoanId??'').localeCompare(String(right.displayLoanId??''));

/** Builds one explainable priority item per authorized loan. */
export function buildTodaysPriorities(tasks=[],{now=new Date(),limit=5}={}){
  const loans=new Map();
  for(const task of tasks){const displayLoanId=task.displayLoanId??task.id,entry={task,displayLoanId,priority:priorityForTask(task,{now})};const existing=loans.get(displayLoanId);if(!existing||compare(entry,existing)<0)loans.set(displayLoanId,entry);}
  const all=[...loans.values()].sort(compare).map(item=>({...item,reason:[item.priority.label,...(['CRITICAL','AT_RISK'].includes(item.task.ctcClock?.status)?[`CTC ${item.task.ctcClock.status==='AT_RISK'?'At Risk':'Critical'}`]:[])].join(' · ')}));
  return {all,top:all.slice(0,limit)};
}
