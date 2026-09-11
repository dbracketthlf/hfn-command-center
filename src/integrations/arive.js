import { createHash, randomUUID } from 'node:crypto';
import { emptyIntegrationState, ingestEvent } from '../domain/events.js';

const value = (payload, ...names) => names.map(name => payload[name]).find(item => item !== undefined && item !== null && item !== '');
const statusMap = Object.freeze({ LOAN_SETUP:'LOAN_SETUP', DISCLOSED:'DISCLOSED', UNDERWRITING_SUBMITTED:'UNDERWRITING_SUBMITTED', APPROVED_WITH_CONDITION:'APPROVED_WITH_CONDITION', CLEAR_TO_CLOSE:'CLEAR_TO_CLOSE', DOCS_OUT:'DOCS_OUT', DOCS_SIGNED:'DOCS_SIGNED', LOAN_FUNDED:'LOAN_FUNDED' });
const digest = payload => createHash('sha256').update(JSON.stringify(payload) ?? 'null').digest('hex');
const eventId = payload => value(payload, 'zapierEventId', 'zapier_event_id', 'eventId', 'event_id') ?? digest(payload);
const text = item => typeof item === 'string' ? item.trim() : item;
function teamUsersFromSlots(payload) { const users=[]; for(let slot=1;slot<=10;slot++){const firstName=text(payload[`loanTeamUser${slot}FirstName`]),lastName=text(payload[`loanTeamUser${slot}LastName`]),email=text(payload[`loanTeamUser${slot}Email`]),role=text(payload[`loanTeamUser${slot}Role`]);if(firstName||lastName||email||role)users.push({firstName,lastName,email,role,name:[firstName,lastName].filter(Boolean).join(' ')});} return users; }
const processorAssistantRole = 'AssistantProcessor';
/**
 * ARIVE distinguishes Processor Assistants from Loan Officer Assistants in the
 * loan-team role. Only the confirmed exact role is eligible for this ownership.
 */
export function selectProcessorAssistant(teamUsers) { const matches=(teamUsers??[]).filter(user=>user.role===processorAssistantRole); if(matches.length===1)return {assistant:matches[0],exception:null}; if(matches.length===0)return {assistant:null,exception:`No Loan Team User with Loan Role ${processorAssistantRole}`}; return {assistant:null,exception:`Multiple Loan Team Users with Loan Role ${processorAssistantRole}`}; }

/** Maps only operational, non-borrower fields; raw payload is never persisted. */
export function normalizeArivePayload(payload, receivedAt) {
  payload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const systemGuid = text(value(payload, 'ariveLoanId', 'ariveSystemGuid', 'ariveSystemGUID', 'systemGuid', 'systemGUID'));
  const displayLoanId = text(value(payload, 'ariveDisplayLoanId', 'displayLoanId', 'loanNumber', 'loan_number'));
  const currentStatus = text(value(payload, 'currentLoanStatus_status', 'currentLoanStatus', 'Current Loan Status'))?.toUpperCase();
  const statusAt = value(payload, 'currentLoanStatus_date', 'currentLoanStatusDate', 'Current Loan Status Date');
  const updatedAt = value(payload, 'modifiedDateTime', 'loanUpdatedAt', 'Loan Updated At');
  const processor = text(value(payload, 'loanProcessorName', 'processorName', 'Processor')), processorEmail=text(value(payload,'loanProcessorEmail','processorEmail'));
  const suppliedTeam=value(payload, 'loanTeamUsers', 'loanTeam', 'Loan Team Users'); const teamUsers=Array.isArray(suppliedTeam)?suppliedTeam:teamUsersFromSlots(payload); const assignment=selectProcessorAssistant(teamUsers); const assistant=assignment.assistant?.name??null, assistantEmail=assignment.assistant?.email??null;
  const milestoneDates={initialLESentDate:value(payload,'keyDates_initialLESentDate'),initialLESignedDate:value(payload,'keyDates_initialLESignedDate'),intentToProceedDate:value(payload,'keyDates_intentToProceedDate'),initialCDSentDate:value(payload,'keyDates_initialCDSentDate'),mostRecentCDSentDate:value(payload,'keyDates_mostRecentCDSentDate'),appraisalOrderedDate:value(payload,'keyDates_appraisalOrderedDate','appraisalOrderedDate'),hoiOrderedDate:value(payload,'keyDates_hoiOrderedDate','hoiOrderedDate'),titleOrderedDate:value(payload,'keyDates_titleOrderedDate','titleOrderedDate'),appraisalReceivedDate:value(payload,'keyDates_appraisalDeliveryDate','appraisalReceivedDate'),hoiReceivedDate:value(payload,'keyDates_hoiReceivedDate','hoiReceivedDate'),titleReceivedDate:value(payload,'keyDates_titleReceivedDate','titleReceivedDate')};
  const trackerContext={appraisalStatus:value(payload,'appraisalStatus','APPRAISAL Status'),appraisalTrackerDate:value(payload,'appraisalTrackerDate','APPRAISAL Date'),titleStatus:value(payload,'titleStatus','TITLE Status'),titleTrackerDate:value(payload,'titleTrackerDate','TITLE Date'),hoiStatus:value(payload,'hoiStatus','HOI Status'),hoiTrackerDate:value(payload,'hoiTrackerDate','HOI Date')};
  return { systemGuid, displayLoanId, currentStatus, statusAt, updatedAt, processor, processorEmail, assistant, assistantEmail, assistantException:assignment.exception, teamUsers, city:text(value(payload, 'subjectProperty_city')), state:text(value(payload, 'subjectProperty_state')), purpose:text(value(payload, 'loanPurpose')), mortgageType:text(value(payload, 'mortgageType')), milestoneDates, trackerContext };
}
export const payloadIdempotencyKey = eventId;
export const payloadFingerprint = digest;
export const supportedEventType = status => statusMap[status];
/** No passthrough: audit storage is an operational allowlist, never a modified raw payload. */
export function redactedAuditPayload(payload, receivedAt) { const loan=normalizeArivePayload(payload,receivedAt); return {ariveSystemGuid:loan.systemGuid,ariveDisplayLoanId:loan.displayLoanId,currentLoanStatus:loan.currentStatus,currentLoanStatusDate:loan.statusAt,loanUpdatedAt:loan.updatedAt,processor:loan.processor,processorEmail:loan.processorEmail,processorAssistant:loan.assistant,processorAssistantEmail:loan.assistantEmail,assignmentException:loan.assistantException,loanTeamRoles:loan.teamUsers.map(member=>({name:member.name,email:member.email,role:member.role})),propertyCity:loan.city,propertyState:loan.state,loanPurpose:loan.purpose,mortgageType:loan.mortgageType,milestoneDates:loan.milestoneDates,trackerContext:loan.trackerContext}; }

export function createAriveStore() {
  return { audits: [], loans: new Map(), assignments: new Map(), integration: emptyIntegrationState() };
}
export function acceptArivePayload(store, payload, receivedAt = new Date().toISOString()) {
  const audit = { id: randomUUID(), source:'zapier-arive', externalId:eventId(payload), payloadHash:digest(payload), receivedAt, payload:redactedAuditPayload(payload,receivedAt), status:'received', failureReason:null };
  store.audits.push(audit); // Deliberately first: even malformed payloads remain auditable.
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail(store, audit, 'Payload must be a JSON object');
  const loan = normalizeArivePayload(payload, receivedAt);
  if (!loan.systemGuid) return fail(store, audit, 'Missing ARIVE System GUID');
  const existingAudit = store.audits.slice(0,-1).find(item => item.externalId === audit.externalId);
  if (existingAudit) { audit.status='duplicate'; return { ok:true, outcome:'duplicate', auditId:audit.id, tasksCreated:0 }; }
  const existing = store.loans.get(loan.systemGuid) ?? {};
  store.loans.set(loan.systemGuid, { ...existing, ...loan, ariveSystemGuid:loan.systemGuid, ariveDisplayLoanId:loan.displayLoanId, observedAt:receivedAt });
  // Assignment snapshots are retained as observations; they do not invent an historical assignment milestone.
  store.assignments.set(loan.systemGuid, { processor:loan.processor, processorEmail:loan.processorEmail, assistant:loan.assistant, assistantEmail:loan.assistantEmail, exception:loan.assistantException, loanTeamRoles:loan.teamUsers, observedAt:receivedAt });
  const internalType = statusMap[loan.currentStatus];
  if (!internalType) { audit.status='processed'; audit.failureReason='No supported status event in payload'; return { ok:true, outcome:'accepted-no-event', auditId:audit.id, tasksCreated:0 }; }
  // A missing source status timestamp is not replaced with received time: no historical event is fabricated.
  if (!loan.statusAt) { audit.status='processed'; audit.failureReason='Missing Current Loan Status Date; loan snapshot retained, no milestone created'; return { ok:true, outcome:'accepted-no-event', auditId:audit.id, tasksCreated:0 }; }
  const result = ingestEvent(store.integration, { loanId:loan.systemGuid, type:internalType, occurredAt:loan.statusAt, receivedAt, source:'zapier-arive', sourceEventId:audit.externalId, metadata:{ ariveDisplayLoanId:loan.displayLoanId, processor:loan.processor, processorEmail:loan.processorEmail, assistantId:loan.assistantEmail, assistantName:loan.assistant, assignmentException:loan.assistantException, loanTeamRoles:loan.teamUsers, milestoneDates:loan.milestoneDates, trackerContext:loan.trackerContext } });
  store.integration=result.state; audit.status=result.outcome === 'duplicate' ? 'duplicate' : 'processed'; audit.processedAt=receivedAt;
  return { ok:true, outcome:result.outcome, auditId:audit.id, tasksCreated:result.tasksCreated ?? 0 };
}
function fail(store, audit, reason) { audit.status='failed'; audit.failureReason=reason; return { ok:false, outcome:'failed', auditId:audit.id, error:reason }; }

/** Dashboard-safe aggregate: never returns raw payload, borrower details, or arbitrary metadata. */
export function integrationHealth(store) {
  const counts = Object.fromEntries(['received','processed','failed','duplicate'].map(status => [status, store.audits.filter(item => item.status===status).length]));
  const recent = store.audits.slice(-20).reverse().map(item => { const loan=normalizeArivePayload(item.payload ?? {}, item.receivedAt); return { receivedAt:item.receivedAt, sourceEventId:item.externalId, ariveDisplayLoanId:loan.displayLoanId ?? '—', eventType:statusMap[loan.currentStatus] ?? '—', status:item.status, auditNote:item.failureReason ?? 'Processed' }; });
  return { connectionStatus:'not-connected', lastEventReceived:store.audits.at(-1)?.receivedAt ?? null, eventsReceivedToday:store.audits.length, eventsProcessed:counts.processed, failedEvents:counts.failed, duplicateEventsIgnored:counts.duplicate, loansSynced:store.loans.size, missingRequiredFields:store.audits.filter(item => item.failureReason?.startsWith('Missing')).length, recent };
}
