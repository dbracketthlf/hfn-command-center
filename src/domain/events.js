import { dueAt } from './sla.js';
export const eventTypes = Object.freeze(['LOAN_SETUP', 'PROCESSOR_ASSISTANT_ASSIGNED', 'DISCLOSED', 'ITP_SIGNED', 'UNDERWRITING_SUBMITTED', 'APPROVED_WITH_CONDITION', 'CONDITIONS_REVIEW_STARTED', 'CONDITIONS_REVIEWED', 'CLEAR_TO_CLOSE', 'CD_SENT', 'DOCS_OUT', 'DOCS_SIGNED', 'LOAN_FUNDED']);
export const assistantMilestones = Object.freeze([
  { type:'appraisal_ordered', label:'Appraisal ordered', businessDays:1, completionKey:'appraisalOrderedDate' },
  { type:'title_ordered', label:'Title ordered', businessDays:1, completionKey:'titleOrderedDate' },
  { type:'insurance_ordered', label:'Insurance / HOI updates ordered', businessDays:1, completionKey:'hoiOrderedDate' },
  { type:'title_received', label:'Title completed / received', businessDays:5, completionKey:'titleReceivedDate' },
  { type:'insurance_received', label:'Insurance / HOI updates completed / received', businessDays:5, completionKey:'hoiReceivedDate' },
  { type:'appraisal_received', label:'Appraisal received', businessDays:7, completionKey:'appraisalReceivedDate' }
]);
export function ingestEvent(state, incoming) {
  const receivedAt = incoming.receivedAt ?? new Date().toISOString();
  if (!incoming.loanId || !incoming.type || !incoming.occurredAt || !incoming.source) return { state: { ...state, failed: [...state.failed, { ...incoming, receivedAt, reason: 'Missing required event fields' }] }, outcome: 'failed' };
  if (!eventTypes.includes(incoming.type)) return { state: { ...state, failed: [...state.failed, { ...incoming, receivedAt, reason: 'Unsupported event type' }] }, outcome: 'failed' };
  const key = `${incoming.source}:${incoming.sourceEventId ?? `${incoming.loanId}:${incoming.type}:${incoming.occurredAt}`}`;
  if (state.eventKeys.has(key)) return { state: { ...state, duplicateEvents: state.duplicateEvents + 1 }, outcome: 'duplicate' };
  const event = { ...incoming, receivedAt, idempotencyKey: key };
  const next = { ...state, eventKeys: new Set([...state.eventKeys, key]), events: [...state.events, event], processedEvents: state.processedEvents + 1 };
  if (event.type !== 'UNDERWRITING_SUBMITTED') return { state: next, outcome: 'processed' };
  const existing = new Set(next.tasks.filter(task => task.loanId === event.loanId).map(task => task.type));
  const dates = event.metadata?.milestoneDates ?? {};
  const created = assistantMilestones.filter(milestone => !existing.has(milestone.type)).map(milestone => { const completedAt=dates[milestone.completionKey]??null; return { id: `${event.loanId}:${milestone.type}`, loanId:event.loanId, type:milestone.type, label:milestone.label, assistantId:event.metadata?.assistantId, applicableAt:event.occurredAt, businessDays:milestone.businessDays, dueAt:dueAt(event.occurredAt,{kind:'businessHours',value:milestone.businessDays*8.5}).toISOString(), completedAt, status:completedAt?'completed':'open' }; });
  return { state: { ...next, tasks: [...next.tasks, ...created] }, outcome: 'processed', tasksCreated: created.length };
}
export const emptyIntegrationState = () => ({ eventKeys: new Set(), events: [], tasks: [], failed: [], processedEvents: 0, duplicateEvents: 0 });
