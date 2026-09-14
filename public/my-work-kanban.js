export const kanbanColumns=Object.freeze(['past_due','action_needed','follow_up','waiting']);
const order=Object.freeze({past_due:0,escalated:1,blocked:2,action_required:3,due_soon:4,follow_up_due:5,waiting:6});
const timestamp=value=>{const time=new Date(value??'').getTime();return Number.isFinite(time)?time:Infinity;};

export function kanbanColumnFor(task,{now=new Date()}={}){
  if(task.priority==='past_due'||timestamp(task.dueAt)<now.getTime())return 'past_due';
  if(['escalated','blocked','action_required','due_soon'].includes(task.priority??task.state))return 'action_needed';
  if(task.priority==='follow_up_due'||timestamp(task.nextFollowUpAt)<=now.getTime())return 'follow_up';
  return 'waiting';
}

export function compareWorkTasks(left,right,{now=new Date()}={}){
  const columnDifference=kanbanColumns.indexOf(kanbanColumnFor(left,{now}))-kanbanColumns.indexOf(kanbanColumnFor(right,{now}));
  if(columnDifference)return columnDifference;
  const urgencyDifference=(order[left.priority]??99)-(order[right.priority]??99);
  if(urgencyDifference)return urgencyDifference;
  const dueDifference=Math.min(timestamp(left.dueAt),timestamp(left.nextFollowUpAt))-Math.min(timestamp(right.dueAt),timestamp(right.nextFollowUpAt));
  if(dueDifference)return dueDifference;
  return String(left.id??'').localeCompare(String(right.id??''));
}

export function buildLoanKanban(tasks,{now=new Date()}={}){
  const grouped=new Map();
  for(const task of tasks??[]){const key=task.displayLoanId??task.id;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(task);}
  const loans=[...grouped.entries()].map(([key,items])=>{const sorted=[...items].sort((a,b)=>compareWorkTasks(a,b,{now}));return {key,tasks:sorted,urgentTask:sorted[0],column:kanbanColumnFor(sorted[0],{now})};});
  loans.sort((left,right)=>{const columnDifference=kanbanColumns.indexOf(left.column)-kanbanColumns.indexOf(right.column);if(columnDifference)return columnDifference;const taskDifference=compareWorkTasks(left.urgentTask,right.urgentTask,{now});if(taskDifference)return taskDifference;return String(left.key).localeCompare(String(right.key));});
  return {loans,columns:Object.fromEntries(kanbanColumns.map(column=>[column,loans.filter(loan=>loan.column===column)]))};
}
