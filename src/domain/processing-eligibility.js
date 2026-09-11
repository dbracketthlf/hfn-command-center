export const processingEntryStages = Object.freeze(['LOAN_SETUP','DISCLOSURE_SENT','UNDERWRITING_SUBMITTED','APPROVED_WITH_CONDITION','RE_SUBMITTAL','CLEAR_TO_CLOSE','DOCS_OUT','DOCS_SIGNED','LOAN_FUNDED','BROKER_CHECK_RECEIVED','COMMISSION_PAID']);
export const establishesProcessingEligibility = status => processingEntryStages.includes(status);
export const isProcessingEligible = loan => Boolean(loan?.processingEligibleAt);
