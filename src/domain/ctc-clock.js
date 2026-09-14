const pacificParts=value=>{
  const date=new Date(value??'');
  if(!Number.isFinite(date.getTime()))return null;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=type=>parts.find(part=>part.type===type)?.value;
  const year=Number(get('year')),month=Number(get('month')),day=Number(get('day'));
  return Number.isInteger(year)&&Number.isInteger(month)&&Number.isInteger(day)?{year,month,day}:null;
};
const dayStamp=parts=>parts?Date.UTC(parts.year,parts.month-1,parts.day):null;
const isoDate=parts=>parts?`${parts.year}-${String(parts.month).padStart(2,'0')}-${String(parts.day).padStart(2,'0')}`:null;

/** Calendar-day operational CTC clock. It only accepts persisted, canonical stage timestamps. */
export function ctcClock({uwSubmittedAt,clearToCloseAt,now=new Date()}={}){
  const start=pacificParts(uwSubmittedAt),end=pacificParts(clearToCloseAt),today=pacificParts(now);
  if(!start)return {uwSubmittedAt:null,clearToCloseAt:null,targetCtcDate:null,elapsedCalendarDays:null,status:'TIMING_UNAVAILABLE',goalMet:null};
  const targetStamp=dayStamp(start)+20*86400000,targetParts=new Date(targetStamp);
  const targetCtcDate=`${targetParts.getUTCFullYear()}-${String(targetParts.getUTCMonth()+1).padStart(2,'0')}-${String(targetParts.getUTCDate()).padStart(2,'0')}`;
  const finish=end&&dayStamp(end)>=dayStamp(start)?end:null;
  const elapsed=Math.floor(((finish?dayStamp(finish):dayStamp(today))-dayStamp(start))/86400000);
  if(!Number.isFinite(elapsed)||elapsed<0)return {uwSubmittedAt,clearToCloseAt:null,targetCtcDate,elapsedCalendarDays:null,status:'TIMING_UNAVAILABLE',goalMet:null};
  if(finish){const goalMet=elapsed<=20;return {uwSubmittedAt,clearToCloseAt,targetCtcDate,elapsedCalendarDays:elapsed,status:goalMet?'GOAL_MET':'GOAL_MISSED',goalMet};}
  return {uwSubmittedAt,clearToCloseAt:null,targetCtcDate,elapsedCalendarDays:elapsed,status:elapsed>=20?'CRITICAL':elapsed>=15?'AT_RISK':'ON_TRACK',goalMet:null};
}

export function summarizeCtcClocks(rows=[],{now=new Date()}={}){
  const clocks=rows.map(row=>ctcClock({...row,now})).filter(clock=>clock.status!=='TIMING_UNAVAILABLE');
  const active=clocks.filter(clock=>['ON_TRACK','AT_RISK','CRITICAL'].includes(clock.status));
  const completed=clocks.filter(clock=>['GOAL_MET','GOAL_MISSED'].includes(clock.status));
  const successful=completed.filter(clock=>clock.goalMet).length;
  return {
    activeUwToCtc:active.length,onTrack:active.filter(clock=>clock.status==='ON_TRACK').length,
    atRisk:active.filter(clock=>clock.status==='AT_RISK').length,critical:active.filter(clock=>clock.status==='CRITICAL').length,
    averageCompletedDurationDays:completed.length?Number((completed.reduce((total,clock)=>total+clock.elapsedCalendarDays,0)/completed.length).toFixed(1)):null,
    hitRate:completed.length?{numerator:successful,denominator:completed.length,percentage:Number((successful/completed.length*100).toFixed(1))}:null
  };
}
