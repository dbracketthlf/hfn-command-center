const time=value=>{const parsed=new Date(value??'').getTime();return Number.isFinite(parsed)?parsed:Infinity;};

/** Shared operational priority for browser UI and server-side management views. */
export function workPriorityKey(task,{now=new Date()}={}){
  if(task.state==='follow_up_due'||task.priority==='follow_up_due')return 'follow_up_due';
  const waitingFollowUp=task.state==='waiting'&&time(task.nextFollowUpAt)<=now.getTime();
  if(waitingFollowUp)return 'follow_up_due';
  if(task.priority==='past_due'||task.state==='past_due'||time(task.dueAt)<now.getTime())return 'past_due';
  if(task.state==='escalated'||task.priority==='escalated')return 'escalated';
  if(task.state==='blocked'||task.priority==='blocked')return 'blocked';
  if(task.state==='action_required'||task.priority==='action_required')return 'action_required';
  if(task.state==='due_soon'||task.priority==='due_soon')return 'due_soon';
  return 'waiting';
}

export const workPriorityTime=time;
export const isPastDueTask=(task,options)=>workPriorityKey(task,options)==='past_due';
