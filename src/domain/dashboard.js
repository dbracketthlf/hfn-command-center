import { rankAssistants } from './performance.js';
import { assistantWeights } from './rules.js';

const processorNames = ['Susan Vu', 'Elizabeth Martinez'];
const assistantNames = ['Joshua Quintanilla', 'Sophia Gomez'];
const metricLabels = { setup:'Setup SLA %', disclosures:'Disclosure SLA %', uw:'UW Submit SLA %', approval:'Approval SLA %', conditions:'Conditions SLA %', ctc:'CTC SLA %' };
const category = metric => Object.keys(metricLabels).find(key => metric.toLowerCase().includes(key));
const percent = (good, total) => total ? Math.round(good / total * 100) : null;

/** Aggregates only borrower-safe, persisted operational rows; no demo records. */
export function buildLiveDashboard({ counts, processorLoans, processorSlas, funded, assistantTasks, attention }) {
  const processors = processorNames.map(name => {
    const loans = processorLoans.filter(row => row.processor === name);
    const slas = processorSlas.filter(row => row.processor === name);
    const sla = Object.fromEntries(Object.keys(metricLabels).map(key => {
      const items = slas.filter(row => category(row.metricKey) === key);
      return [key, percent(items.filter(row => row.state !== 'breached').length, items.length)];
    }));
    return { name, activeLoans:loans.filter(row => row.currentStage !== 'LOAN_FUNDED').length, setupSla:sla.setup, disclosureSla:sla.disclosures, uwSubmitSla:sla.uw, approvalSla:sla.approval, conditionsSla:sla.conditions, ctcSla:sla.ctc, fundedMtd:funded.filter(row => row.processor === name).length, pastSla:slas.filter(row => row.state === 'breached').length };
  });
  const byAssistant = new Map(assistantNames.map(name => [name, []]));
  for (const task of assistantTasks) {
    if (task.kpiEligible===false || !task.assistant || task.assistant === 'Unassigned') continue;
    if (!byAssistant.has(task.assistant)) byAssistant.set(task.assistant, []);
    byAssistant.get(task.assistant).push(task);
  }
  const assistants = rankAssistants([...byAssistant].map(([name, tasks]) => {
    const completed = tasks.filter(task => task.completedAt);
    const active = tasks.filter(task => !task.completedAt);
    const onTime = completed.filter(task => new Date(task.completedAt) <= new Date(task.dueAt));
    const turnaroundHours = completed.length ? completed.reduce((total, task) => total + (new Date(task.completedAt) - new Date(task.applicableAt)) / 3_600_000, 0) / completed.length : null;
    const pastDue = active.filter(task => new Date(task.dueAt) < new Date()).length;
    const completion = tasks.length ? completed.length / tasks.length : 0;
    const sla = completed.length ? onTime.length / completed.length : 0;
    const turnaround = turnaroundHours === null ? 0 : Math.max(0, 1 - turnaroundHours / (8.5 * 7));
    const backlog = active.length ? Math.max(0, 1 - pastDue / active.length) : 1;
    return { name, activeTasks:active.length, completionPercent:Math.round(completion * 100), slaCompliancePercent:percent(onTime.length, completed.length), averageTurnaroundHours:turnaroundHours === null ? null : Number(turnaroundHours.toFixed(1)), pastDueTasks:pastDue, collectingData:completed.length===0, metrics:{ completion, sla, turnaround, backlog } };
  }), assistantWeights).map(({ metrics, ...assistant }) => assistant).map(assistant=>assistant.collectingData?{...assistant,rank:'—',score:'Collecting data',completionPercent:null,slaCompliancePercent:null,averageTurnaroundHours:null}:assistant);
  return { source:'live', kpis:counts, processors, assistants, attention };
}
