import { ctcClock } from './ctc-clock.js';

/**
 * Read-only operational stage-aging analytics. These benchmarks are pipeline
 * health defaults, not employee SLA rules or performance grades.
 */
export const stageAgingBenchmarks=Object.freeze({
  LOAN_SETUP:{basis:'businessDays',target:1,agingAt:2,stalledAt:3,label:'1 business-day operational target'},
  DISCLOSURE_SENT:{basis:'businessDays',target:3,agingAt:4,stalledAt:6,label:'Phase 1 disclosure-stage default'},
  UNDERWRITING_SUBMITTED:{basis:'businessDays',target:9,agingAt:10,stalledAt:13,label:'72 business-hour approval target'},
  APPROVED_WITH_CONDITION:{basis:'calendarDays',target:null,agingAt:7,stalledAt:14,label:'Phase 1 conditions-stage default'},
  RE_SUBMITTAL:{basis:'businessDays',target:1,agingAt:2,stalledAt:3,label:'Same-business-day re-submission action target'},
  CLEAR_TO_CLOSE:{basis:'businessDays',target:2,agingAt:3,stalledAt:5,label:'Phase 1 closing-stage default'},
  DOCS_OUT:{basis:'businessDays',target:3,agingAt:5,stalledAt:7,label:'Phase 1 documents-out default'},
  DOCS_SIGNED:{basis:'businessDays',target:2,agingAt:3,stalledAt:5,label:'Phase 1 signed-documents default'}
});
export const bottleneckCategories=Object.freeze(['INTERNAL ACTION','BORROWER / CONDITIONS','LENDER / UNDERWRITING','APPRAISAL','TITLE','INSURANCE','PAYOFF','ESCROW / SETTLEMENT','OTHER / UNKNOWN']);
const terminal=new Set(['completed','cancelled','not_applicable']);
const parts=value=>{const date=new Date(value??'');if(!Number.isFinite(date.getTime()))return null;const values=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),get=type=>Number(values.find(item=>item.type===type)?.value);return {year:get('year'),month:get('month'),day:get('day')};};
const stamp=value=>{const local=value&&typeof value==='object'&&Number.isInteger(value.year)?value:parts(value);return local?Date.UTC(local.year,local.month-1,local.day):null;};
const key=local=>`${local.year}-${String(local.month).padStart(2,'0')}-${String(local.day).padStart(2,'0')}`;
const next=local=>{const date=new Date(Date.UTC(local.year,local.month-1,local.day+1));return {year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate()};};
const weekday=local=>new Date(Date.UTC(local.year,local.month-1,local.day)).getUTCDay();
const days=(start,end)=>{const a=stamp(start),b=stamp(end);return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?Math.floor((b-a)/86400000):null;};
const businessDays=(start,end,calendar={})=>{let cursor=parts(start),finish=parts(end);if(!cursor||!finish||stamp(finish)<stamp(cursor))return null;const holidays=new Set(calendar.holidays??[]),workdays=calendar.workdays??[1,2,3,4,5];let total=0;while(stamp(cursor)<stamp(finish)){cursor=next(cursor);if(workdays.includes(weekday(cursor))&&!holidays.has(key(cursor)))total++;}return total;};
const statusFor=(benchmark,calendarDays,businessDayCount)=>{if(!benchmark||calendarDays===null)return 'TIMING_UNAVAILABLE';const value=benchmark.basis==='businessDays'?businessDayCount:calendarDays;if(value===null)return 'TIMING_UNAVAILABLE';return value>=benchmark.stalledAt?'STALLED':value>=benchmark.agingAt?'AGING':'NORMAL';};
const asTime=value=>{const result=new Date(value??'').getTime();return Number.isFinite(result)?result:Infinity;};
const isOverdue=(task,now=new Date())=>task.state==='past_due'||task.priority==='past_due'||(task.dueAt&&asTime(task.dueAt)<new Date(now).getTime());
const titleFor=task=>task?.title??task?.taskType?.replaceAll('_',' ')??null;
const categoryFor=(tasks,now)=>{
  const open=tasks.filter(task=>!terminal.has(task.state));
  // Precedence is deliberately deterministic and describes only the current open work.
  if(open.some(task=>task.state!=='waiting'&&isOverdue(task,now)))return 'INTERNAL ACTION';
  if(open.some(task=>task.taskType==='borrower_conditions_follow_up'&&task.state==='waiting'))return 'BORROWER / CONDITIONS';
  if(open.some(task=>task.taskType==='ctc_follow_up'&&task.state==='waiting'))return 'LENDER / UNDERWRITING';
  if(open.some(task=>/appraisal/.test(task.taskType??'')&&task.state==='waiting'))return 'APPRAISAL';
  if(open.some(task=>/title/.test(task.taskType??'')&&task.state==='waiting'))return 'TITLE';
  if(open.some(task=>/insurance|eoi|hoi/.test(task.taskType??'')&&task.state==='waiting'))return 'INSURANCE';
  if(open.some(task=>/payoff/.test(task.taskType??'')&&task.state==='waiting'))return 'PAYOFF';
  if(open.some(task=>/settlement|escrow/.test(task.taskType??'')&&task.state==='waiting'))return 'ESCROW / SETTLEMENT';
  return 'OTHER / UNKNOWN';
};
const urgentTask=(tasks,now)=>[...tasks].sort((left,right)=>(isOverdue(right,now)?1:0)-(isOverdue(left,now)?1:0)||asTime(left.dueAt)-asTime(right.dueAt)||asTime(left.nextFollowUpAt)-asTime(right.nextFollowUpAt))[0]??null;
const median=values=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return Number((sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2).toFixed(1));};

export function buildStageAgingAnalytics(rows=[],tasks=[],{now=new Date(),calendar={}}={}){
  const byLoan=new Map();for(const task of tasks){if(!task.displayLoanId)continue;(byLoan.get(task.displayLoanId)??byLoan.set(task.displayLoanId,[]).get(task.displayLoanId)).push(task);}
  const loans=rows.map(row=>{const benchmark=stageAgingBenchmarks[row.currentStage]??null,elapsedCalendarDays=days(row.stageEnteredAt,now),elapsedBusinessDays=businessDays(row.stageEnteredAt,now,calendar),agingStatus=statusFor(benchmark,elapsedCalendarDays,elapsedBusinessDays),loanTasks=byLoan.get(row.displayLoanId)??[],urgent=urgentTask(loanTasks,now);return {...row,stageEnteredAt:row.stageEnteredAt??null,elapsedCalendarDays,elapsedBusinessDays,agingStatus,ctcClock:ctcClock({...row,now}),benchmark:benchmark?{basis:benchmark.basis,target:benchmark.target,label:benchmark.label}:null,currentBottleneckCategory:categoryFor(loanTasks,now),mostUrgentTask:urgent?{id:urgent.id,title:titleFor(urgent),state:urgent.state,dueAt:urgent.dueAt??null,nextFollowUpAt:urgent.nextFollowUpAt??null}:null};});
  const byStage=new Map();for(const loan of loans){const entry=byStage.get(loan.currentStage)??{stage:loan.currentStage,activeLoans:0,known:[],agingLoans:0,stalledLoans:0,benchmark:loan.benchmark};entry.activeLoans++;if(loan.elapsedCalendarDays!==null)entry.known.push(loan.elapsedCalendarDays);if(loan.agingStatus==='AGING')entry.agingLoans++;if(loan.agingStatus==='STALLED')entry.stalledLoans++;byStage.set(loan.currentStage,entry);}
  const pipelineBottlenecks=[...byStage.values()].map(item=>({stage:item.stage,activeLoans:item.activeLoans,averageCalendarDays:item.known.length?Number((item.known.reduce((sum,value)=>sum+value,0)/item.known.length).toFixed(1)):null,medianCalendarDays:median(item.known),timingAvailableLoans:item.known.length,agingLoans:item.agingLoans,stalledLoans:item.stalledLoans,benchmark:item.benchmark})).sort((a,b)=>b.stalledLoans-a.stalledLoans||b.agingLoans-a.agingLoans||b.activeLoans-a.activeLoans||a.stage.localeCompare(b.stage));
  const longestAgingLoans=loans.filter(loan=>loan.elapsedCalendarDays!==null).sort((a,b)=>({STALLED:0,AGING:1,NORMAL:2}[a.agingStatus]??3)-({STALLED:0,AGING:1,NORMAL:2}[b.agingStatus]??3)||b.elapsedCalendarDays-a.elapsedCalendarDays||String(a.displayLoanId).localeCompare(String(b.displayLoanId))).slice(0,25);
  const counts=new Map(bottleneckCategories.map(category=>[category,0]));for(const loan of loans)counts.set(loan.currentBottleneckCategory,(counts.get(loan.currentBottleneckCategory)??0)+1);
  return {pipelineBottlenecks,longestAgingLoans,currentBottlenecks:bottleneckCategories.map(category=>({category,activeLoans:counts.get(category)??0})).filter(item=>item.activeLoans>0),timingUnavailableLoans:loans.filter(loan=>loan.agingStatus==='TIMING_UNAVAILABLE').length};
}
