/**
 * Persistent third-party work after an initial order/request is confirmed.
 * These definitions deliberately contain only operational metadata; ARIVE key
 * dates remain the authority for completion.
 */
export const thirdPartyFollowUps=Object.freeze({
  order_appraisal:{
    taskType:'appraisal_follow_up',title:'Follow up on appraisal',waitingOn:'appraiser',
    firstCadenceBusinessDays:1,repeatCadenceBusinessDays:1,phase:'waiting_for_payment',
    completionKey:'appraisalReceivedDate'
  },
  order_title_escrow:{
    taskType:'title_follow_up',title:'Follow up with title / escrow',waitingOn:'title_escrow',
    firstCadenceBusinessDays:3,repeatCadenceBusinessDays:3,phase:'waiting_for_title',
    completionKey:'titleReceivedDate'
  },
  request_insurance_eoi:{
    taskType:'insurance_follow_up',title:'Follow up on insurance / EOI package',waitingOn:'insurance_agent',
    firstCadenceBusinessDays:3,repeatCadenceBusinessDays:2,phase:'waiting_for_insurance',
    completionKey:'hoiReceivedDate'
  },
  order_payoff:{
    taskType:'payoff_follow_up',title:'Follow up on payoff',waitingOn:'payoff_provider',
    firstCadenceBusinessDays:3,repeatCadenceBusinessDays:3,phase:'waiting_for_payoff',
    completionKey:null
  },
  order_settlement_statement:{
    taskType:'settlement_statement_follow_up',title:'Follow Up on Settlement Statement',waitingOn:'title_escrow',
    firstCadenceBusinessDays:2,repeatCadenceBusinessDays:2,phase:'waiting_for_settlement_statement',
    completionKey:null
  }
});

export const followUpForInitialTask=taskType=>thirdPartyFollowUps[taskType]??null;
export const followUpCadence=(task,{afterFollowUp=false,phase=null}={})=>{
  const config=Object.values(thirdPartyFollowUps).find(item=>item.taskType===task.task_type||item.taskType===task.taskType);
  if(!config)return task.follow_up_cadence_business_days??task.followUpCadenceBusinessDays??null;
  if(config.taskType==='appraisal_follow_up'&&['paid_waiting_scheduling','scheduled_waiting_completion'].includes(phase??task.metadata?.followUpPhase))return 2;
  return afterFollowUp?config.repeatCadenceBusinessDays:config.firstCadenceBusinessDays;
};
