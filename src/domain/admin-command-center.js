export const capacityWeights=Object.freeze({activeLoan:1,followUpDue:2,actionRequired:3,blocked:3,pastDue:4,escalated:5,ctcAtRisk:2,ctcCritical:4});
export const capacityThresholds=Object.freeze({normalMax:20,elevatedMax:35,highMax:50});
export const blockedEscalationAgeHours=24;
const terminal=new Set(['completed','cancelled','not_applicable']);
const time=value=>{const parsed=new Date(value??'').getTime();return Number.isFinite(parsed)?parsed:Infinity;};
const ctcWeight=clock=>clock?.status==='CRITICAL'?capacityWeights.ctcCritical:clock?.status==='AT_RISK'?capacityWeights.ctcAtRisk:0;
const isPastDue=(task,now)=>task.priority==='past_due'||task.state==='past_due'||time(task.dueAt)<now.getTime();
const taskWeight=(task,now)=>isPastDue(task,now)?capacityWeights.pastDue:task.state==='escalated'||task.priority==='escalated'?capacityWeights.escalated:task.state==='blocked'||task.priority==='blocked'?capacityWeights.blocked:task.priority==='follow_up_due'||task.state==='follow_up_due'||time(task.nextFollowUpAt)<=now.getTime()?capacityWeights.followUpDue:task.state==='action_required'||task.priority==='action_required'||task.state==='due_soon'||task.priority==='due_soon'?capacityWeights.actionRequired:0;
const statusFor=score=>score<=capacityThresholds.normalMax?'NORMAL':score<=capacityThresholds.elevatedMax?'ELEVATED':score<=capacityThresholds.highMax?'HIGH':'OVERLOADED';
const urgency=(task,now)=>isPastDue(task,now)?0:task.state==='escalated'||task.priority==='escalated'?1:task.state==='blocked'||task.priority==='blocked'?2:task.state==='action_required'||task.priority==='action_required'?3:task.priority==='follow_up_due'||task.state==='follow_up_due'||time(task.nextFollowUpAt)<=now.getTime()?4:task.state==='due_soon'||task.priority==='due_soon'?5:6;
const internalAction=task=>task.state!=='waiting';

export function capacityForEmployee(tasks=[],{now=new Date(),activeLoanIds=[]}={}){
  const open=tasks.filter(task=>!terminal.has(task.state)),loans=new Set([...activeLoanIds,...open.map(task=>task.displayLoanId).filter(Boolean)]),taskCounts={open:open.length,pastDue:open.filter(task=>isPastDue(task,now)).length,actionRequired:open.filter(task=>task.state==='action_required'||task.priority==='action_required').length,followUpDue:open.filter(task=>task.priority==='follow_up_due'||task.state==='follow_up_due'||time(task.nextFollowUpAt)<=now.getTime()).length,blocked:open.filter(task=>task.state==='blocked'||task.priority==='blocked').length,escalated:open.filter(task=>task.state==='escalated'||task.priority==='escalated').length};
  const ctcByLoan=new Map();for(const task of open){const key=task.displayLoanId;if(key&&!ctcByLoan.has(key))ctcByLoan.set(key,task.ctcClock?.status??null);}
  const ctcAtRisk=[...ctcByLoan.values()].filter(status=>status==='AT_RISK').length,ctcCritical=[...ctcByLoan.values()].filter(status=>status==='CRITICAL').length;
  const score=loans.size*capacityWeights.activeLoan+open.reduce((total,task)=>total+taskWeight(task,now),0)+ctcAtRisk*capacityWeights.ctcAtRisk+ctcCritical*capacityWeights.ctcCritical;
  return {activeLoans:loans.size,taskCounts,ctcAtRisk,ctcCritical,score,status:statusFor(score)};
}

export function buildManagementEscalations(tasks=[],{now=new Date()}={}){
  const loans=new Map();for(const task of tasks.filter(task=>!terminal.has(task.state))){const key=task.displayLoanId??task.id;if(!loans.has(key))loans.set(key,[]);loans.get(key).push(task);}
  const escalations=[];
  for(const [displayLoanId,items] of loans){const past=items.filter(task=>isPastDue(task,now)),actionable=items.filter(internalAction),blocked=items.filter(task=>(task.state==='blocked'||task.priority==='blocked')&&now.getTime()-time(task.blockedAt)>=blockedEscalationAgeHours*3600000),escalated=items.filter(task=>task.state==='escalated'||task.priority==='escalated'),resubmitPast=past.filter(task=>task.taskType==='resubmit_to_underwriting'),approvalPast=past.filter(task=>task.taskType==='review_approval_conditions'),assistantSevere=past.filter(task=>task.ownerRole==='processor_assistant'&&internalAction(task)&&now.getTime()-time(task.dueAt)>=24*3600000),ctc=items.find(task=>task.ctcClock?.status==='CRITICAL')?.ctcClock??items.find(task=>task.ctcClock?.status==='AT_RISK')?.ctcClock??null,critical=ctc?.status==='CRITICAL',atRisk=ctc?.status==='AT_RISK',reasons=[];
    let severity=null;
    if(escalated.length){severity='CRITICAL';reasons.push('Escalated task');}
    if(resubmitPast.length){severity='CRITICAL';reasons.push('Re-Submit to Underwriting past due');}
    if(critical&&actionable.length){severity='CRITICAL';reasons.push('CTC Critical with actionable internal work');}
    if(!severity&&(past.length>=2||blocked.length||atRisk&&past.some(internalAction)||past.some(task=>task.taskType==='ctc_follow_up')||approvalPast.length||assistantSevere.length)){severity='HIGH';if(past.length>=2)reasons.push('Multiple past-due tasks');if(blocked.length)reasons.push('Blocked more than 24 hours');if(atRisk&&past.some(internalAction))reasons.push('CTC At Risk with past-due internal work');if(past.some(task=>task.taskType==='ctc_follow_up'))reasons.push('Processor follow-up overdue');if(approvalPast.length)reasons.push('Approval review past due');if(assistantSevere.length)reasons.push('Assistant task significantly overdue');}
    if(!severity&&past.some(internalAction)){severity='WATCH';reasons.push('Due employee action is past due');}
    if(!severity)continue;
    const mostUrgent=[...items].sort((a,b)=>urgency(a,now)-urgency(b,now)||time(a.dueAt)-time(b.dueAt)||time(a.nextFollowUpAt)-time(b.nextFollowUpAt))[0];escalations.push({displayLoanId,currentStage:mostUrgent.currentStage,processor:mostUrgent.processor,assistant:mostUrgent.assistant,lenderInvestorName:mostUrgent.lenderInvestorName??null,ctcStatus:ctc?.status??null,severity,reasons,mostUrgentTask:mostUrgent.title,taskId:mostUrgent.id,dueAt:mostUrgent.dueAt??null,blockedAt:blocked[0]?.blockedAt??null});
  }
  const severityOrder={CRITICAL:0,HIGH:1,WATCH:2};return escalations.sort((a,b)=>severityOrder[a.severity]-severityOrder[b.severity]||time(a.dueAt)-time(b.dueAt)||String(a.displayLoanId).localeCompare(String(b.displayLoanId)));
}

export function buildAdminCommandCenter(tasks=[],{now=new Date(),activeLoanIds=[],activeLoanIdsByEmployee={}}={}){
  const open=tasks.filter(task=>!terminal.has(task.state)),byEmployee=new Map();for(const task of open){if(!['processor','processor_assistant'].includes(task.ownerRole))continue;const key=`${task.ownerRole}:${task.ownerEmail??task.ownerName??'unassigned'}`;if(!byEmployee.has(key))byEmployee.set(key,{name:task.ownerName??task.ownerEmail??'Unassigned',email:task.ownerEmail??null,role:task.ownerRole,tasks:[]});byEmployee.get(key).tasks.push(task);}
  const employees=[...byEmployee.values()].map(item=>({name:item.name,email:item.email,role:item.role,...capacityForEmployee(item.tasks,{now,activeLoanIds:activeLoanIdsByEmployee[`${item.role}:${item.email??item.name}`]??[]})})).sort((a,b)=>a.role.localeCompare(b.role)||a.name.localeCompare(b.name));const escalations=buildManagementEscalations(open,{now}),loanClocks=new Map();for(const task of open)if(task.displayLoanId&&!loanClocks.has(task.displayLoanId))loanClocks.set(task.displayLoanId,task.ctcClock?.status??null);
  return {summary:{activeLoans:new Set([...activeLoanIds,...open.map(task=>task.displayLoanId).filter(Boolean)]).size,pastDueLoans:new Set(open.filter(task=>isPastDue(task,now)).map(task=>task.displayLoanId)).size,ctcAtRisk:[...loanClocks.values()].filter(status=>status==='AT_RISK').length,ctcCritical:[...loanClocks.values()].filter(status=>status==='CRITICAL').length,managementEscalations:escalations.length},processors:employees.filter(item=>item.role==='processor'),assistants:employees.filter(item=>item.role==='processor_assistant'),escalations};
}
