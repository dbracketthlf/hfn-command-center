export const eventTypes = Object.freeze(['LOAN_SETUP', 'PROCESSOR_ASSISTANT_ASSIGNED', 'DISCLOSED', 'ITP_SIGNED', 'UNDERWRITING_SUBMITTED', 'APPROVED_WITH_CONDITION', 'CONDITIONS_REVIEW_STARTED', 'CONDITIONS_REVIEWED', 'CLEAR_TO_CLOSE', 'CD_SENT', 'DOCS_OUT', 'DOCS_SIGNED', 'LOAN_FUNDED']);
export const postApprovalTaskTypes = Object.freeze(['APPRAISAL', 'TITLE', 'INSURANCE', 'PAYOFF']);
export function ingestEvent(state, incoming) {
  const receivedAt = incoming.receivedAt ?? new Date().toISOString();
  if (!incoming.loanId || !incoming.type || !incoming.occurredAt || !incoming.source) return { state: { ...state, failed: [...state.failed, { ...incoming, receivedAt, reason: 'Missing required event fields' }] }, outcome: 'failed' };
  if (!eventTypes.includes(incoming.type)) return { state: { ...state, failed: [...state.failed, { ...incoming, receivedAt, reason: 'Unsupported event type' }] }, outcome: 'failed' };
  const key = `${incoming.source}:${incoming.sourceEventId ?? `${incoming.loanId}:${incoming.type}:${incoming.occurredAt}`}`;
  if (state.eventKeys.has(key)) return { state: { ...state, duplicateEvents: state.duplicateEvents + 1 }, outcome: 'duplicate' };
  const event = { ...incoming, receivedAt, idempotencyKey: key };
  const next = { ...state, eventKeys: new Set([...state.eventKeys, key]), events: [...state.events, event], processedEvents: state.processedEvents + 1 };
  if (event.type !== 'APPROVED_WITH_CONDITION') return { state: next, outcome: 'processed' };
  const existing = new Set(next.tasks.filter(task => task.loanId === event.loanId).map(task => task.type));
  const created = postApprovalTaskTypes.filter(type => !existing.has(type)).map(type => ({ id: `${event.loanId}:${type}`, loanId: event.loanId, type, assistantId: event.metadata?.assistantId, applicableAt: event.occurredAt, status: 'open' }));
  return { state: { ...next, tasks: [...next.tasks, ...created] }, outcome: 'processed', tasksCreated: created.length };
}
export const emptyIntegrationState = () => ({ eventKeys: new Set(), events: [], tasks: [], failed: [], processedEvents: 0, duplicateEvents: 0 });
