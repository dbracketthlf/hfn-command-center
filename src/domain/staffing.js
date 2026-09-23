export const employeeCapabilities = employee => new Set(employee?.capabilities?.length ? employee.capabilities : employee?.role ? [employee.role] : []);
export const hasCapability = (employee, capability) => employeeCapabilities(employee).has(capability);
export const operationalRoles = Object.freeze(['processor','processor_assistant']);
export const terminalWorkflowStates = Object.freeze(['completed','cancelled','not_applicable']);

export function activeTeamRows(rows=[]) {
  const byEmail=new Map();
  for (const row of rows) {
    if (!row?.active || !row?.email) continue;
    const capabilities=Array.from(new Set(row.capabilities ?? (row.role ? [row.role] : [])));
    byEmail.set(String(row.email).toLowerCase(), {...row, capabilities});
  }
  return [...byEmail.values()];
}

/** Overrides are deliberately checked before ARIVE, and inactive ARIVE users never route work. */
export function resolveOperationalOwner({role, override=null, arive=null}={}) {
  if (!operationalRoles.includes(role)) throw new Error('Invalid operational role');
  const valid = candidate => candidate?.active && (candidate.capabilities ?? []).includes(role) && candidate.email;
  if (valid(override)) return {owner:override, source:'operational_override', exception:null};
  if (valid(arive)) return {owner:arive, source:'arive_active_employee', exception:null};
  return {owner:null, source:'unassigned', exception:`No active ${role} assignment`};
}

export function transitionPlan({loans=[], tasks=[], fromEmail, toEmployee}) {
  const source=String(fromEmail??'').trim().toLowerCase();
  if (!source || !toEmployee?.email) throw new Error('Source and target employees are required');
  const loanIds=new Set(loans.filter(loan=>String(loan.processorEmail??'').toLowerCase()===source).map(loan=>loan.loanId));
  const taskIds=tasks.filter(task=>task.ownerRole==='processor' && !terminalWorkflowStates.includes(task.state) && String(task.ownerEmail??'').toLowerCase()===source).map(task=>task.id);
  return {loanIds:[...loanIds], taskIds};
}
