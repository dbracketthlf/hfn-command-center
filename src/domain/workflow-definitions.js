/** Internal, versioned workflow configuration. ARIVE remains the loan-data authority. */
export const workflowDefinitions=Object.freeze([
  {trigger:'LOAN_SETUP',type:'review_and_send_disclosures',title:'Review file and send initial disclosures',ownerRole:'processor_assistant',businessDays:1,completeOn:['DISCLOSED']},
  {trigger:'DISCLOSED',type:'get_disclosures_signed',title:'Get borrower disclosures signed',ownerRole:'processor_assistant',businessDays:2,completeOn:['ITP_SIGNED'],followUpBusinessDays:1,waitingOn:'borrower'},
  {trigger:'ITP_SIGNED',type:'submit_to_underwriting',title:'Submit loan to underwriting',ownerRole:'processor',businessDays:1,completeOn:['UNDERWRITING_SUBMITTED']},
  {trigger:'UNDERWRITING_SUBMITTED',type:'order_appraisal',title:'Order appraisal',ownerRole:'processor_assistant',businessDays:1,completeOn:['APPRAISAL_ORDERED']},
  {trigger:'UNDERWRITING_SUBMITTED',type:'order_title_escrow',title:'Order title / escrow',ownerRole:'processor_assistant',businessDays:1,completeOn:['TITLE_ORDERED'],followUpBusinessDays:3,waitingOn:'title_escrow'},
  {trigger:'UNDERWRITING_SUBMITTED',type:'request_insurance_eoi',title:'Request insurance / EOI package',ownerRole:'processor_assistant',businessDays:1,completeOn:['INSURANCE_ORDERED'],followUpBusinessDays:3,waitingOn:'insurance_agent',checklist:['Updated Evidence of Insurance','Replacement Cost Estimator','Insurance Invoice']},
  {trigger:'UNDERWRITING_SUBMITTED',type:'order_payoff',title:'Order payoff',ownerRole:'processor_assistant',businessDays:1,manual:true,followUpBusinessDays:3,waitingOn:'other'},
  {trigger:'APPROVED_WITH_CONDITION',type:'review_approval_conditions',title:'Review Approval & Conditions',ownerRole:'processor',businessDays:1},
  {trigger:'MANUAL_READY_FOR_RESUBMITTAL',type:'resubmit_to_underwriting',title:'Re-Submit to Underwriting',ownerRole:'processor',businessDays:0,completeOn:['RE_SUBMITTAL']},
  {trigger:'CLEAR_TO_CLOSE',type:'request_loan_documents',title:'Send loan documents to notary',ownerRole:'processor',businessDays:1,completeOn:['DOCS_OUT']},
  {trigger:'CLEAR_TO_CLOSE',type:'ctc_closing_readiness',title:'CTC closing readiness / verify closing invoices',ownerRole:'processor_assistant',businessDays:0,checklist:['Settlement Statement','Appraisal Invoice','Credit Report Invoice','Flood Cert Invoice','HOA Cert Invoice','Insurance Invoice']},
  {trigger:'DOCS_OUT',type:'confirm_borrower_signing',title:'Docs Signed Follow-Up',ownerRole:'processor',businessDays:2,completeOn:['DOCS_SIGNED'],followUpBusinessDays:2,waitingOn:'title_escrow'},
  {trigger:'DOCS_SIGNED',type:'clear_funding_requirements',title:'Fund Loan',ownerRole:'processor',businessDays:null,completeOn:['LOAN_FUNDED'],waitingOn:'other'},
]);

export const definitionsForTrigger=trigger=>workflowDefinitions.filter(definition=>definition.trigger===trigger);
export const definitionsCompletedBy=trigger=>workflowDefinitions.filter(definition=>definition.completeOn?.includes(trigger));
export const manualWorkflowTypes=Object.freeze(['ready_for_resubmittal','appraisal_correction','hoa_condo']);
export const conditionsWorkflowTaskTypes=Object.freeze(['review_approval_conditions','borrower_conditions_follow_up','resubmit_to_underwriting','ctc_follow_up']);
