export const processorAssistantCapability='processor_assistant';

const normalized=value=>String(value??'').trim().toLowerCase();

/**
 * Deliberately narrow: this operator flow onboards a Processor Assistant only.
 * Any existing identity/capability conflict must be resolved outside this tool.
 */
export function processorAssistantOnboardingPlan({existingEmployee=null,email,displayName,identityMismatches=[]}={}) {
  const expectedEmail=normalized(email),expectedName=String(displayName??'').trim();
  if(!expectedEmail||!expectedName) throw new Error('Verified email and display name are required');
  if(identityMismatches.length) throw new Error('Existing work uses a different Assistant identity; resolve the mismatch before onboarding');
  if(!existingEmployee) return {action:'create',email:expectedEmail,displayName:expectedName,capability:processorAssistantCapability};
  if(normalized(existingEmployee.email)!==expectedEmail||String(existingEmployee.displayName??'').trim()!==expectedName) throw new Error('Existing employee identity conflicts with the verified onboarding identity');
  const capabilities=new Set(existingEmployee.capabilities??[]);
  if((existingEmployee.role&&existingEmployee.role!==processorAssistantCapability)||capabilities.has('admin')||capabilities.has('processor')) throw new Error('Existing employee has conflicting access and cannot be converted by this onboarding command');
  return {action:'ensure',email:expectedEmail,displayName:expectedName,capability:processorAssistantCapability,activate:!existingEmployee.active,addCapability:!capabilities.has(processorAssistantCapability)};
}

/**
 * Explicitly reconciles a verified legacy Admin identity into a Processor
 * Assistant. This is intentionally separate from ordinary onboarding because
 * removing an Admin capability requires an operator acknowledgement.
 */
export function processorAssistantIdentityReconciliationPlan({existingEmployee=null,employeeId,email,currentDisplayName,displayName,removeAdminCapability=false,nameConflictCount=0}={}) {
  const expectedEmail=normalized(email),expectedCurrentName=String(currentDisplayName??'').trim(),expectedName=String(displayName??'').trim();
  if(!employeeId||!expectedEmail||!expectedCurrentName||!expectedName) throw new Error('Employee ID, verified email, current display name, and verified display name are required');
  if(!removeAdminCapability) throw new Error('--remove-admin-capability is required for an explicit access reduction');
  if(!existingEmployee||existingEmployee.id!==employeeId||normalized(existingEmployee.email)!==expectedEmail) throw new Error('Existing employee identity does not match the explicitly verified target');
  if(String(existingEmployee.displayName??'').trim()!==expectedCurrentName) throw new Error('Existing employee display name changed; re-run the dry run and verify the target');
  if(Number(nameConflictCount)>0) throw new Error('Another employee already uses the verified display name');
  const capabilities=new Set(existingEmployee.capabilities??[]);
  if(capabilities.has('processor')||existingEmployee.role==='processor') throw new Error('Existing employee has Processor access and cannot be reconciled by this command');
  if([...capabilities].some(capability=>!['admin',processorAssistantCapability].includes(capability))) throw new Error('Existing employee has an unexpected capability');
  return {
    action:'reconcile_existing_employee',employeeId,email:expectedEmail,currentDisplayName:expectedCurrentName,displayName:expectedName,
    finalRole:processorAssistantCapability,finalActive:true,finalCapabilities:[processorAssistantCapability],
    rename:String(existingEmployee.displayName??'').trim()!==expectedName,
    activate:!existingEmployee.active,
    removeAdminCapability:capabilities.has('admin'),
    addProcessorAssistantCapability:!capabilities.has(processorAssistantCapability)
  };
}
