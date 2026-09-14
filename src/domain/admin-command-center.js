import { isPastDueTask, workPriorityKey, workPriorityTime } from '../../public/work-priority.js';
export const capacityWeights=Object.freeze({activeLoan:1,followUpDue:2,actionRequired:3,blocked:3,pastDue:4,escalated:5,ctcAtRisk:2,ctcCritical:4});
export const capacityThresholds=Object.freeze({normalMax:20,elevatedMax:35,highMax:50});
export const blockedEscalationAgeHours=24;
const terminal=new Set(['completed','cancelled','not_applicable']);
const ctcWeight=clock=>clock?.status==='CRITICAL'?capacityWeights.ctcCritical:clock?.status==='AT_RISK'?capacityWeights.ctcAtRisk:0;
const isPastDue=(task,now)=>isPastDueTask(task,{now});
const taskWeight=(task,now)=>{const priority=workPriorityKey(task,{now});return priority==='past_due'?capacityWeights.pastDue:priority==='escalated'?capacityWeights.escalated:priority==='blocked'?capacityWeights.blocked:priority==='follow_up_due'?capacityWeights.followUpDue:['action_required','due_soon'].includes(priority)?capacityWeights.actionRequired:0;};
const statusFor=score=>score<=capacityThresholds.normalMax?'NORMAL':score<=capacityThresholds.elevatedMax?'ELEVATED':score<=capacityThresholds.highMax?'HIGH':'OVERLOADED';
const urgency=(task,now)=>({past_due:0,escalated:1,blocked:2,action_required:3,follow_up_due:4,due_soon:5,waiting:6}[workPriorityKey(task,{now})]);
const internalAction=task=>task.state!=='waiting';

export function capacityForEmployee(tasks=[],{now=new Date(),activeLoanIds=[]}={}){
  const open=tasks.filter(task=>!terminal.has(task.state)),loans=new Set([...activeLoanIds,...open.map(task=>task.displayLoanId).filter(Boolean)]),taskCounts={open:open.length,pastDue:open.filter(task=>isPastDue(task,now)).length,actionRequired:open.filter(task=>workPriorityKey(task,{now})==='action_required').length,followUpDue:open.filter(task=>workPriorityKey(task,{now})==='follow_up_due').length,blocked:open.filter(task=>workPriorityKey(task,{now})==='blocked').length,escalated:open.filter(task=>workPriorityKey(task,{now})==='escalated').length};
  const ctcByLoan=new Map();for(const task of open){const key=task.displayLoanId;if(key&&!ctcByLoan.has(key))ctcByLoan.set(key,task.ctcClock?.status??null);}
  const ctcAtRisk=[...ctcByLoan.values()].filter(status=>status==='AT_RISK').length,ctcCritical=[...ctcByLoan.values()].filter(status=>status==='CRITICAL').length;
  const score=loans.size*capacityWeights.activeLoan+open.reduce((total,task)=>total+taskWeight(task,now),0)+ctcAtRisk*capacityWeights.ctcAtRisk+ctcCritical*capacityWeights.ctcCritical;
  return {activeLoans:loans.size,taskCounts,ctcAtRisk,ctcCritical,score,status:statusFor(score)};
}

export function buildManagementEscalations(tasks=[],{now=new Date()}={}){
  const loans=new Map();for(const task of tasks.filter(task=>!terminal.has(task.state))){const key=task.displayLoanId??task.id;if(!loans.has(key))loans.set(key,[]);loans.get(key).push(task);}
  const escalations=[];
  for(const [displayLoanId,items] of loans){const past=items.filter(task=>isPastDue(task,now)),actionable=items.filter(internalAction),blocked=items.filter(task=>(task.state==='blocked'||task.priority==='blocked')&&now.getTime()-workPriorityTime(task.blockedAt)>=blockedEscalationAgeHours*3600000),escalated=items.filter(task=>task.state==='escalated'||task.priority==='escalated'),resubmitPast=past.filter(task=>task.taskType==='resubmit_to_underwriting'),approvalPast=past.filter(task=>task.taskType==='review_approval_conditions'),assistantSevere=past.filter(task=>task.ownerRole==='processor_assistant'&&internalAction(task)&&now.getTime()-workPriorityTime(task.dueAt)>=24*3600000),ctc=items.find(task=>task.ctcClock?.status==='CRITICAL')?.ctcClock??items.find(task=>task.ctcClock?.status==='AT_RISK')?.ctcClock??null,critical=ctc?.status==='CRITICAL',atRisk=ctc?.status==='AT_RISK',reasons=[];
    let severity=null;
    if(escalated.length){severity='CRITICAL';reasons.push('Escalated task');}
    if(resubmitPast.length){severity='CRITICAL';reasons.push('Re-Submit to Underwriting past due');}
    if(critical&&actionable.length){severity='CRITICAL';reasons.push('CTC Critical with actionable internal work');}
    if(!severity&&(past.length>=2||blocked.length||atRisk&&past.some(internalAction)||past.some(task=>task.taskType==='ctc_follow_up')||approvalPast.length||assistantSevere.length)){severity='HIGH';if(past.length>=2)reasons.push('Multiple past-due tasks');if(blocked.length)reasons.push('Blocked more than 24 hours');if(atRisk&&past.some(internalAction))reasons.push('CTC At Risk with past-due internal work');if(past.some(task=>task.taskType==='ctc_follow_up'))reasons.push('Processor follow-up overdue');if(approvalPast.length)reasons.push('Approval review past due');if(assistantSevere.length)reasons.push('Assistant task significantly overdue');}
    if(!severity&&past.some(internalAction)){severity='WATCH';reasons.push('Due employee action is past due');}
    if(!severity)continue;
    const mostUrgent=[...items].sort((a,b)=>urgency(a,now)-urgency(b,now)||workPriorityTime(a.dueAt)-workPriorityTime(b.dueAt)||workPriorityTime(a.nextFollowUpAt)-workPriorityTime(b.nextFollowUpAt))[0];escalations.push({displayLoanId,currentStage:mostUrgent.currentStage,processor:mostUrgent.processor,assistant:mostUrgent.assistant,lenderInvestorName:mostUrgent.lenderInvestorName??null,ctcStatus:ctc?.status??null,severity,reasons,mostUrgentTask:mostUrgent.title,taskId:mostUrgent.id,dueAt:mostUrgent.dueAt??null,blockedAt:blocked[0]?.blockedAt??null});
  }
  const severityOrder={CRITICAL:0,HIGH:1,WATCH:2};return escalations.sort((a,b)=>severityOrder[a.severity]-severityOrder[b.severity]||workPriorityTime(a.dueAt)-workPriorityTime(b.dueAt)||String(a.displayLoanId).localeCompare(String(b.displayLoanId)));
}

export function buildAdminCommandCenter(tasks=[],{now=new Date(),activeLoanIds=[],activeLoanIdsByEmployee={}}={}){
  const open=tasks.filter(task=>!terminal.has(task.state)),byEmployee=new Map();for(const task of open){if(!['processor','processor_assistant'].includes(task.ownerRole))continue;const key=`${task.ownerRole}:${task.ownerEmail??task.ownerName??'unassigned'}`;if(!byEmployee.has(key))byEmployee.set(key,{name:task.ownerName??task.ownerEmail??'Unassigned',email:task.ownerEmail??null,role:task.ownerRole,tasks:[]});byEmployee.get(key).tasks.push(task);}
  const employees=[...byEmployee.values()].map(item=>({name:item.name,email:item.email,role:item.role,...capacityForEmployee(item.tasks,{now,activeLoanIds:activeLoanIdsByEmployee[`${item.role}:${item.email??item.name}`]??[]})})).sort((a,b)=>a.role.localeCompare(b.role)||a.name.localeCompare(b.name));const escalations=buildManagementEscalations(open,{now}),loanClocks=new Map();for(const task of open)if(task.displayLoanId&&!loanClocks.has(task.displayLoanId))loanClocks.set(task.displayLoanId,task.ctcClock?.status??null);
  return {summary:{activeLoans:new Set([...activeLoanIds,...open.map(task=>task.displayLoanId).filter(Boolean)]).size,pastDueLoans:new Set(open.filter(task=>isPastDue(task,now)).map(task=>task.displayLoanId)).size,ctcAtRisk:[...loanClocks.values()].filter(status=>status==='AT_RISK').length,ctcCritical:[...loanClocks.values()].filter(status=>status==='CRITICAL').length,managementEscalations:escalations.length},processors:employees.filter(item=>item.role==='processor'),assistants:employees.filter(item=>item.role==='processor_assistant'),escalations};
}

/** A presentation summary composed exclusively from established management aggregates. */
export function buildMorningCommandBrief(center={},dashboard=null,health=null){
  const summary=center.summary??{},employees=[...(center.processors??[]),...(center.assistants??[])],sum=key=>employees.reduce((total,employee)=>total+Number(employee.taskCounts?.[key]??0),0),focus=[
    {key:'past_due_actions',label:'Employee actions past due',count:sum('pastDue')},
    {key:'follow_up_due',label:'Follow-ups due',count:sum('followUpDue')},
    {key:'ctc_critical',label:'CTC Critical',count:Number(summary.ctcCritical??0)},
    {key:'ctc_at_risk',label:'CTC At Risk',count:Number(summary.ctcAtRisk??0)},
    {key:'management_escalations',label:'Management escalations',count:Number(summary.managementEscalations??0)},
    {key:'capacity',label:'Elevated employee capacity',count:employees.filter(employee=>['ELEVATED','HIGH','OVERLOADED'].includes(employee.status)).length}
  ].filter(item=>item.count>0),funding=dashboard?.fundingGoal,executive=dashboard?.executiveProgress?.currentMonth,ctc=center.ctcPerformance??{},lenders=center.lenderPerformance?.lenders,lenderWaiting=Array.isArray(lenders)?lenders.reduce((total,lender)=>total+Number(lender.currentlyWaitingOnLenderUw??0),0):null;
  return {
    headline:{activeLoans:summary.activeLoans??null,managementAttention:summary.managementEscalations??null,ctcAtRisk:summary.ctcAtRisk??null,ctcCritical:summary.ctcCritical??null},
    focus,
    monthProgress:{fundedLoans:funding?.fundedCount?.actual??null,fundedVolume:funding?.fundedVolume?.actual??null,loanGoalPercent:funding?.fundedCount?.percent??null,volumeGoalPercent:funding?.fundedVolume?.percent??null,averageUwToCtcDays:executive?.uwToCtc?.averageCalendarDays??null,twentyDayHitRate:executive?.uwToCtc?.hitRate??null},
    processingPulse:{waitingOnLenderUw:lenderWaiting,ctcOnTrack:ctc.onTrack??null,ctcAtRisk:ctc.atRisk??null,ctcCritical:ctc.critical??null,setupDisclosureStalled:center.setupDisclosure?.current?.stalled??null,bottleneckCategories:center.stageAging?.currentBottlenecks?.length??null},
    systemStatus:health?.connectionStatus&&health?.lastEventReceived?{connectionStatus:health.connectionStatus,lastEventReceived:health.lastEventReceived}:null
  };
}
