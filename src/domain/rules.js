export const slaRules = {
  setup: { kind: 'businessHours', value: 24, label: 'New file setup' },
  disclosures: { kind: 'businessHours', value: 24, label: 'Initial disclosures' },
  uwSubmission: { kind: 'businessHours', value: 24, label: 'Submit to underwriting' },
  approval: { kind: 'businessHours', value: 72, label: 'Underwriting approval' },
  conditions: { kind: 'businessHours', value: 48, label: 'Conditions reviewed' },
  ctc: { kind: 'calendarDays', value: 21, label: 'Clear to close' }
};
export const assistantWeights = { completion: .4, sla: .3, turnaround: .2, backlog: .1 };
