import { isTerminalWorkTask, workPriorityKey, workPriorityTime } from './work-priority.js';
export const kanbanColumns=Object.freeze(['past_due','action_needed','follow_up','waiting']);
const order=Object.freeze({past_due:0,escalated:1,blocked:2,action_required:3,due_soon:4,follow_up_due:5,waiting:6});
export function kanbanColumnFor(task,{now=new Date()}={}){
  if(isTerminalWorkTask(task))return null;
  const priority=workPriorityKey(task,{now});
  if(priority==='past_due')return 'past_due';
  if(['escalated','blocked','action_required','due_soon'].includes(priority))return 'action_needed';
  if(priority==='follow_up_due')return 'follow_up';
  return 'waiting';
}

export function compareWorkTasks(left,right,{now=new Date()}={}){
  const columnDifference=kanbanColumns.indexOf(kanbanColumnFor(left,{now}))-kanbanColumns.indexOf(kanbanColumnFor(right,{now}));
  if(columnDifference)return columnDifference;
  const urgencyDifference=(order[left.priority]??99)-(order[right.priority]??99);
  if(urgencyDifference)return urgencyDifference;
  const dueDifference=Math.min(workPriorityTime(left.dueAt),workPriorityTime(left.nextFollowUpAt))-Math.min(workPriorityTime(right.dueAt),workPriorityTime(right.nextFollowUpAt));
  if(dueDifference)return dueDifference;
  return String(left.id??'').localeCompare(String(right.id??''));
}

export function buildLoanKanban(tasks,{now=new Date()}={}){
  const grouped=new Map();
  for(const task of tasks??[]){if(isTerminalWorkTask(task))continue;const key=task.displayLoanId??task.id;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(task);}
  const loans=[...grouped.entries()].map(([key,items])=>{const sorted=[...items].sort((a,b)=>compareWorkTasks(a,b,{now}));return {key,tasks:sorted,urgentTask:sorted[0],column:kanbanColumnFor(sorted[0],{now})};});
  loans.sort((left,right)=>{const columnDifference=kanbanColumns.indexOf(left.column)-kanbanColumns.indexOf(right.column);if(columnDifference)return columnDifference;const taskDifference=compareWorkTasks(left.urgentTask,right.urgentTask,{now});if(taskDifference)return taskDifference;return String(left.key).localeCompare(String(right.key));});
  return {loans,columns:Object.fromEntries(kanbanColumns.map(column=>[column,loans.filter(loan=>loan.column===column)]))};
}
