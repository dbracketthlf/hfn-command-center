export const processingEntryStage = 'LOAN_SETUP';
export const establishesProcessingEligibility = status => status === processingEntryStage;
export const isProcessingEligible = loan => Boolean(loan?.processingEligibleAt);
