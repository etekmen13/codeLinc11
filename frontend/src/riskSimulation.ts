export const riskStates = ['Healthy', 'Early lesion', 'Cavity', 'Pulp involvement', 'Tooth loss'] as const;
export type RiskPoint = {month:number; escalation:number; severe:number; distribution:number[]};
export type RiskResult = {points:RiskPoint[]; trials:number; initialState:number};

// Illustrative untreated progression model: one adjacent transition per month.
// probabilities[i] is P(next state | currently in state i) during one month.
export function simulateRisk({initialState, probabilities, months=24, trials=10000, random=Math.random}: {
  initialState:number; probabilities:number[]; months?:number; trials?:number; random?:()=>number;
}):RiskResult {
  if(!Number.isInteger(initialState)||initialState<0||initialState>3)throw new Error('Choose a starting state from 0 through 3.');
  if(probabilities.length!==4||probabilities.some(p=>!Number.isFinite(p)||p<0||p>1))throw new Error('Monthly probabilities must be between 0 and 1.');
  if(!Number.isInteger(months)||months<1||months>120||!Number.isInteger(trials)||trials<1)throw new Error('Invalid simulation size.');
  const counts=Array.from({length:months+1},()=>Array(5).fill(0) as number[]);
  for(let trial=0;trial<trials;trial++){
    let state=initialState;
    counts[0][state]++;
    for(let month=1;month<=months;month++){
      if(state<4&&random()<probabilities[state])state++;
      counts[month][state]++;
    }
  }
  return {trials,initialState,points:counts.map((row,month)=>({
    month,distribution:row.map(n=>n/trials),
    escalation:row.slice(initialState+1).reduce((a,b)=>a+b,0)/trials,
    severe:row.slice(3).reduce((a,b)=>a+b,0)/trials,
  }))};
}
