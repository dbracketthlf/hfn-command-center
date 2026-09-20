const time=value=>{const parsed=new Date(value??'').getTime();return Number.isFinite(parsed)?parsed:Infinity;};
export const terminalWorkTaskStates=Object.freeze(['completed','cancelled','not_applicable']);
export const isTerminalWorkTask=task=>terminalWorkTaskStates.includes(task?.state);

/** Shared operational priority for browser UI and server-side management views. */
export function workPriorityKey(task,{now=new Date()}={}){
  if(isTerminalWorkTask(task))return task.state;
  if(task.state==='follow_up_due'||task.priority==='follow_up_due')return 'follow_up_due';
  // Once work is genuinely waiting on an external party, the original action
  // deadline no longer represents an employee miss. Only its scheduled
  // follow-up can make it actionable again.
  if(task.state==='waiting'&&task.nextFollowUpAt)return time(task.nextFollowUpAt)<=now.getTime()?'follow_up_due':'waiting';
  if(task.priority==='past_due'||task.state==='past_due'||time(task.dueAt)<now.getTime())return 'past_due';
  if(task.state==='escalated'||task.priority==='escalated')return 'escalated';
  if(task.state==='blocked'||task.priority==='blocked')return 'blocked';
  if(task.state==='action_required'||task.priority==='action_required')return 'action_required';
  if(task.state==='due_soon'||task.priority==='due_soon')return 'due_soon';
  return 'waiting';
}

export const workPriorityTime=time;
export const isPastDueTask=(task,options)=>workPriorityKey(task,options)==='past_due';
