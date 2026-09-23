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
