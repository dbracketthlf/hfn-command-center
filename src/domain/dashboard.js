import { rankAssistants } from './performance.js';
import { assistantWeights } from './rules.js';
import { assistantMetricKeys, metricResult, overallResult, processorMetricKey, processorMetricKeys } from './kpi-metrics.js';

const processorNames = ['Susan Vu', 'Elizabeth Martinez'];
const assistantNames = ['Joshua Quintanilla', 'Sophia Gomez'];
const measurableProcessorState = state => state === 'completed' || state === 'breached';

/** Aggregates only borrower-safe, persisted operational rows; no demo records. */
export function buildLiveDashboard({ counts, processorLoans, processorSlas, funded, assistantTasks, assistantSlas=[], attention }) {
  const processors = processorNames.map(name => {
    const loans = processorLoans.filter(row => row.processor === name);
    const slas = processorSlas.filter(row => row.processor === name).map(row=>({...row,metricKey:processorMetricKey(row.metricKey)})).filter(row=>row.metricKey);
    const observations=slas.map(item=>({metricKey:item.metricKey,kpiEligible:true,completedAt:measurableProcessorState(item.state)?item.evaluatedAt??item.dueAt:null,dueAt:item.dueAt}));
    const individual=Object.fromEntries(processorMetricKeys.map(key=>[key,metricResult(observations,key)]));
    const overall=overallResult(observations);
    return { name, activeLoans:loans.filter(row => row.currentStage !== 'LOAN_FUNDED').length, uwSubmitSla:individual.uw_submission, approvalSla:individual.approval, conditionsSla:individual.conditions, ctcSla:individual.ctc, overallSla:overall, fundedMtd:funded.filter(row => row.processor === name).length, pastSla:slas.filter(row => row.state === 'breached').length };
  });
  const byAssistant = new Map(assistantNames.map(name => [name, []]));
  for (const task of assistantTasks) {
    if (task.kpiEligible===false || !task.assistant || task.assistant === 'Unassigned') continue;
    if (!byAssistant.has(task.assistant)) byAssistant.set(task.assistant, []);
    byAssistant.get(task.assistant).push(task);
  }
  for (const observation of assistantSlas) {
    if (!observation.assistant || observation.assistant === 'Unassigned') continue;
    if (!byAssistant.has(observation.assistant)) byAssistant.set(observation.assistant, []);
    byAssistant.get(observation.assistant).push({...observation,kpiOnly:true,completedAt:measurableProcessorState(observation.state)?observation.evaluatedAt??observation.dueAt:null});
  }
  const assistants = rankAssistants([...byAssistant].map(([name, tasks]) => {
    const completed = tasks.filter(task => task.completedAt);
    const active = tasks.filter(task => !task.kpiOnly && !task.completedAt);
    const onTime = completed.filter(task => new Date(task.completedAt) <= new Date(task.dueAt));
    const tasksWithTurnaround = completed.filter(task=>task.applicableAt);
    const turnaroundHours = tasksWithTurnaround.length ? tasksWithTurnaround.reduce((total, task) => total + (new Date(task.completedAt) - new Date(task.applicableAt)) / 3_600_000, 0) / tasksWithTurnaround.length : null;
    const pastDue = active.filter(task => new Date(task.dueAt) < new Date()).length;
    const completion = tasks.length ? completed.length / tasks.length : 0;
    const sla = completed.length ? onTime.length / completed.length : 0;
    const turnaround = turnaroundHours === null ? 0 : Math.max(0, 1 - turnaroundHours / (8.5 * 7));
    const backlog = active.length ? Math.max(0, 1 - pastDue / active.length) : 1;
    const observations=tasks.map(task=>({metricKey:task.taskType??task.type,kpiEligible:task.kpiEligible,completedAt:task.completedAt,dueAt:task.dueAt}));const individual=Object.fromEntries(assistantMetricKeys.map(key=>[key,metricResult(observations,key)]));const overall=overallResult(observations);return { name, activeTasks:active.length, completionPercent:Math.round(completion * 100), slaCompliancePercent:overall.percentage, individualSlas:individual, overallSla:overall, averageTurnaroundHours:turnaroundHours === null ? null : Number(turnaroundHours.toFixed(1)), pastDueTasks:pastDue, collectingData:completed.length===0, metrics:{ completion, sla, turnaround, backlog } };
  }), assistantWeights).map(({ metrics, ...assistant }) => assistant).map(assistant=>assistant.collectingData?{...assistant,rank:'—',score:'Collecting data',completionPercent:null,slaCompliancePercent:null,averageTurnaroundHours:null}:assistant);
  return { source:'live', kpis:counts, processors, assistants, attention };
}
