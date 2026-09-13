import { randomUUID } from 'node:crypto';

const activeStates="('completed','cancelled','not_applicable')";
const email=value=>String(value??'').trim().toLowerCase();
const validDue=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():null;};

export async function enrichPrivateQueue(pool,queue){
  const ids=[...new Set(queue.tasks.map(task=>task.displayLoanId).filter(Boolean))];
  if(!ids.length)return queue;
  const result=await pool.query('select arive_display_loan_id,borrower_first_name,borrower_last_name from loans where arive_display_loan_id=any($1)',[ids]);
  const names=new Map(result.rows.map(row=>[row.arive_display_loan_id,[row.borrower_first_name,row.borrower_last_name].filter(Boolean).join(' ')||null]));
  return {...queue,tasks:queue.tasks.map(task=>({...task,borrowerName:names.get(task.displayLoanId)??null}))};
}

export async function manualTaskOptions(pool,employee){
  const ownerField=employee.role==='processor'?'processorEmail':'assistantEmail';
  const where=employee.role==='admin'?'':`and lower(coalesce(e.metadata->>'${ownerField}',''))=lower($1)`;
  const params=employee.role==='admin'?[]:[employee.email];
  const result=await pool.query(`select l.id,l.arive_display_loan_id "displayLoanId",l.current_stage "currentStage",l.borrower_first_name,l.borrower_last_name,coalesce(e.metadata->>'processorEmail','') "processorEmail",coalesce(e.metadata->>'processor','') processor,coalesce(e.metadata->>'assistantEmail','') "assistantEmail",coalesce(e.metadata->>'assistant','') assistant from loans l left join lateral (select metadata from loan_stage_events where loan_id=l.id order by occurred_at desc,received_at desc limit 1) e on true where l.processing_eligible_at is not null ${where} order by l.updated_at desc`,params);
  return {loans:result.rows.map(row=>({loanId:row.id,displayLoanId:row.displayLoanId,currentStage:row.currentStage,borrowerName:[row.borrower_first_name,row.borrower_last_name].filter(Boolean).join(' ')||null,assignees:[{email:row.processorEmail,name:row.processor,role:'processor'},{email:row.assistantEmail,name:row.assistant,role:'processor_assistant'}].filter(person=>person.email)}))};
}

export async function createPrivateManualTask(pool,{employee,loanId,title,assigneeEmail,dueAt,priority='normal',note=null}){
  if(!['processor','processor_assistant','admin'].includes(employee.role))throw new Error('Not authorized for manual tasks');
  const safeTitle=String(title??'').trim(); if(!safeTitle||safeTitle.length>160)throw new Error('Task title is required');
  const due=validDue(dueAt); if(!due)throw new Error('Valid due date is required');
  if(!['normal','high','urgent'].includes(priority))throw new Error('Invalid priority');
  const client=await pool.connect(); try {await client.query('begin');
    const loan=await client.query(`select l.id,coalesce(e.metadata->>'processorEmail','') processor_email,coalesce(e.metadata->>'processor','') processor_name,coalesce(e.metadata->>'assistantEmail','') assistant_email,coalesce(e.metadata->>'assistant','') assistant_name from loans l left join lateral (select metadata from loan_stage_events where loan_id=l.id order by occurred_at desc,received_at desc limit 1) e on true where l.id=$1 and l.processing_eligible_at is not null`,[loanId]);
    if(!loan.rowCount)throw new Error('Loan is not available'); const row=loan.rows[0], requested=email(assigneeEmail), processor=email(row.processor_email), assistant=email(row.assistant_email), self=email(employee.email);
    const permitted=employee.role==='processor_assistant'?requested===self&&requested===assistant:employee.role==='processor'?(self===processor&&(requested===processor||requested===assistant)):requested===processor||requested===assistant;
    if(!permitted)throw new Error('Assignee is not permitted for this loan');
    const ownerRole=requested===processor?'processor':'processor_assistant', ownerName=ownerRole==='processor'?row.processor_name:row.assistant_name, id=randomUUID(), at=new Date().toISOString();
    await client.query(`insert into workflow_tasks(id,loan_id,task_type,title,origin,owner_role,owner_email,owner_name,state,created_at,due_at,kpi_eligible,priority,created_by_email,created_by_role,manual_note,metadata) values($1,$2,$3,$4,'manual',$5,$6,$7,'action_required',$8,$9,false,$10,$11,$12,$13,'{}')`,[id,loanId,`manual_operational_task_${id}`,safeTitle,ownerRole,requested,ownerName,at,due,priority,self,employee.role,note?String(note).slice(0,1000):null]);
    await client.query('insert into workflow_task_history(id,task_id,occurred_at,action,to_state,actor_email,metadata) values($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),id,at,'manual_task_created','action_required',self,{assignee:requested,priority,dueAt:due}]); await client.query('commit'); return {ok:true,id};
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}}

export async function cancelPrivateManualTask(pool,{employee,taskId}){const client=await pool.connect();try{await client.query('begin');const result=await client.query('select id,origin,owner_email,created_by_email from workflow_tasks where id=$1',[taskId]),task=result.rows[0];if(!task||task.origin!=='manual')throw new Error('Manual task not found');const self=email(employee.email);if(employee.role!=='admin'&&self!==email(task.owner_email)&&self!==email(task.created_by_email))throw new Error('Not authorized to cancel this manual task');await client.query("update workflow_tasks set state='cancelled',updated_at=now() where id=$1",[taskId]);await client.query('insert into workflow_task_history(id,task_id,occurred_at,action,to_state,actor_email,metadata) values($1,$2,now(),$3,$4,$5,$6)',[randomUUID(),taskId,'manual_task_cancelled','cancelled',self,{}]);await client.query('commit');return {ok:true};}catch(error){await client.query('rollback');throw error;}finally{client.release();}}
