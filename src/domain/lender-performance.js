import { ctcClock } from './ctc-clock.js';

export const lenderReportingPeriodDays=90;
export const lenderSampleLabel=count=>count===0?'NO ELIGIBLE DATA':count<=2?'LIMITED DATA':count<=4?'SMALL SAMPLE':'ESTABLISHED SAMPLE';
const terminalStages=new Set(['LOAN_FUNDED','COMMISSION_PAID','ADVERSE','SUSPENDED']);
const date=value=>{const result=new Date(value??'');return Number.isFinite(result.getTime())?result:null;};
const elapsedDays=(start,end)=>{const a=date(start),b=date(end);return a&&b&&b>=a?Math.floor((b-a)/86400000):null;};
const median=values=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return Number((sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2).toFixed(1));};
const metric=values=>({eligibleObservations:values.length,averageCalendarDays:values.length?Number((values.reduce((sum,value)=>sum+value,0)/values.length).toFixed(1)):null,medianCalendarDays:median(values),sampleLabel:lenderSampleLabel(values.length)});
const normalizedName=value=>{const display=String(value??'').trim().replace(/\s+/g,' ');return display?{key:display.toLocaleLowerCase('en-US'),display}:null;};
const firstAfter=(events,type,after)=>events.find(event=>event.eventType===type&&date(event.occurredAt)>=date(after));
const lastBefore=(events,type,before)=>[...events].reverse().find(event=>event.eventType===type&&date(event.occurredAt)<=date(before));
const isInPeriod=(timestamp,now)=>{const value=date(timestamp),end=date(now);return value&&end&&value<=end&&value>=new Date(end.getTime()-lenderReportingPeriodDays*86400000);};
const stageAge=(events,currentStage,now)=>{const entered=[...events].reverse().find(event=>event.eventType===currentStage)?.occurredAt??null;return elapsedDays(entered,now);};
const empty=()=>({approval:[],resubmission:[],uwToCtc:[],activeLoans:[],onTrack:0,atRisk:0,critical:0,waitingOnLenderUw:0});

/** Aggregates canonical events only; it is management intelligence, never an SLA. */
export function buildLenderPerformanceAnalytics(rows=[],tasks=[],{now=new Date()}={}){
  const loans=new Map();for(const row of rows){const key=row.loanId??row.displayLoanId;if(!key)continue;const loan=loans.get(key)??{loanId:row.loanId,displayLoanId:row.displayLoanId,currentStage:row.currentStage,lenderInvestorName:row.lenderInvestorName??null,processor:row.processor??null,assistant:row.assistant??null,events:[]};if(row.eventType&&row.occurredAt)loan.events.push({eventType:row.eventType,occurredAt:row.occurredAt});loans.set(key,loan);}
  const taskByLoan=new Map();for(const task of tasks){if(!task.displayLoanId)continue;(taskByLoan.get(task.displayLoanId)??taskByLoan.set(task.displayLoanId,[]).get(task.displayLoanId)).push(task);}
  const grouped=new Map(),unknown={activeLoans:0};
  for(const loan of loans.values()){
    loan.events.sort((a,b)=>date(a.occurredAt)-date(b.occurredAt));
    const lender=normalizedName(loan.lenderInvestorName),active=!terminalStages.has(loan.currentStage);
    if(!lender){if(active)unknown.activeLoans++;continue;}
    const group=grouped.get(lender.key)??{key:lender.key,displayName:lender.display,...empty()};grouped.set(lender.key,group);
    const uw=loan.events.find(event=>event.eventType==='UNDERWRITING_SUBMITTED'),approval=uw&&firstAfter(loan.events,'APPROVED_WITH_CONDITION',uw.occurredAt),ctc=uw&&firstAfter(loan.events,'CLEAR_TO_CLOSE',uw.occurredAt);
    if(approval&&isInPeriod(approval.occurredAt,now)){const duration=elapsedDays(uw.occurredAt,approval.occurredAt);if(duration!==null)group.approval.push(duration);}
    if(ctc&&isInPeriod(ctc.occurredAt,now)){
      const uwDuration=elapsedDays(uw.occurredAt,ctc.occurredAt);if(uwDuration!==null)group.uwToCtc.push(uwDuration);
      const resubmit=lastBefore(loan.events,'RE_SUBMITTAL',ctc.occurredAt);if(resubmit){const duration=elapsedDays(resubmit.occurredAt,ctc.occurredAt);if(duration!==null)group.resubmission.push(duration);}
    }
    if(active){const clock=ctcClock({uwSubmittedAt:uw?.occurredAt,clearToCloseAt:ctc?.occurredAt,now}),loanTasks=taskByLoan.get(loan.displayLoanId)??[];group.activeLoans.push({...loan,stageEnteredAt:[...loan.events].reverse().find(event=>event.eventType===loan.currentStage)?.occurredAt??null,elapsedStageCalendarDays:stageAge(loan.events,loan.currentStage,now),ctcClock:clock});if(clock.status==='ON_TRACK')group.onTrack++;if(clock.status==='AT_RISK')group.atRisk++;if(clock.status==='CRITICAL')group.critical++;if(loanTasks.some(task=>task.taskType==='ctc_follow_up'&&task.state==='waiting'))group.waitingOnLenderUw++;}
  }
  const lenders=[...grouped.values()].map(group=>{const uwToCtc=metric(group.uwToCtc),hitCount=group.uwToCtc.filter(days=>days<=20).length;return {key:group.key,displayName:group.displayName,activeLoans:group.activeLoans.length,onTrack:group.onTrack,ctcAtRisk:group.atRisk,ctcCritical:group.critical,currentlyWaitingOnLenderUw:group.waitingOnLenderUw,initialApproval:metric(group.approval),resubmissionToCtc:metric(group.resubmission),uwToCtc:{...uwToCtc,goalHits:hitCount,goalMisses:uwToCtc.eligibleObservations-hitCount,hitRate:uwToCtc.eligibleObservations?Number((hitCount/uwToCtc.eligibleObservations*100).toFixed(1)):null},activeLoanDetails:group.activeLoans.sort((a,b)=>(b.elapsedStageCalendarDays??-1)-(a.elapsedStageCalendarDays??-1)).slice(0,10)};}).sort((a,b)=>b.uwToCtc.eligibleObservations-a.uwToCtc.eligibleObservations||b.activeLoans-a.activeLoans||a.displayName.localeCompare(b.displayName));
  const established=lenders.filter(lender=>lender.uwToCtc.eligibleObservations>=5),bestHit=[...established].sort((a,b)=>b.uwToCtc.hitRate-a.uwToCtc.hitRate||a.uwToCtc.averageCalendarDays-b.uwToCtc.averageCalendarDays)[0]??null,fastest=[...established].sort((a,b)=>a.uwToCtc.averageCalendarDays-b.uwToCtc.averageCalendarDays||b.uwToCtc.hitRate-a.uwToCtc.hitRate)[0]??null;
  return {reportingPeriod:{label:'Last 90 Days',days:lenderReportingPeriodDays},sampleRules:{limitedData:'1–2 observations',smallSample:'3–4 observations',establishedSample:'5+ observations'},summary:{knownLendersInActivePipeline:lenders.filter(lender=>lender.activeLoans>0).length,loansMissingLenderInvestor:unknown.activeLoans,bestTwentyDayHitRate:bestHit?{lenderInvestorName:bestHit.displayName,hitRate:bestHit.uwToCtc.hitRate,eligibleObservations:bestHit.uwToCtc.eligibleObservations}:null,fastestUwToCtc:fastest?{lenderInvestorName:fastest.displayName,averageCalendarDays:fastest.uwToCtc.averageCalendarDays,eligibleObservations:fastest.uwToCtc.eligibleObservations}:null},lenders};
}
