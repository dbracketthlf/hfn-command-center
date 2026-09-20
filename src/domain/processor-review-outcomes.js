export const processorReviewTaskTypes=Object.freeze(['review_appraisal','review_title','review_insurance','review_payoff']);

export const isProcessorReviewTask=task=>processorReviewTaskTypes.includes(task?.task_type??task?.taskType);

/** The existing workflow history note field is operational-only and bounded. */
export function conciseOperationalNote(note,{required=false}={}){
  if(note===null||note===undefined||note===''){
    if(required)throw new Error('An operational note is required');
    return null;
  }
  if(typeof note!=='string')throw new Error('Invalid operational note');
  const value=note.trim();
  if(!value&&required)throw new Error('An operational note is required');
  if(!value)return null;
  if(value.length>500)throw new Error('Operational note must be 500 characters or fewer');
  return value;
}
