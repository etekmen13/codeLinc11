import {useState} from 'react';
import {simulateRisk,riskStates} from './riskSimulation';
import type {RiskResult} from './riskSimulation';
import {Button,Card,Notice} from './ThemeComponents';

export default function RiskAssessment({procedure,acute,onContinue}:{procedure:string;acute:boolean;onContinue:()=>void}){
  const [initial,setInitial]=useState(1);
  const [months,setMonths]=useState(24);
  const [rates,setRates]=useState(['1','3','2','1']);
  const [result,setResult]=useState<RiskResult|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [inspect,setInspect]=useState(6);
  async function run(){
    setError('');
    if(rates.some(v=>v.trim()===''||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>100)){
      setError('Enter each monthly probability between 0% and 100%.');return;
    }
    setBusy(true);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    try{setResult(simulateRisk({initialState:initial,probabilities:rates.map(v=>Number(v)/100),months}));setInspect(Math.min(inspect,months));}
    catch(e){setError(e instanceof Error?e.message:'Simulation failed.');}
    finally{setBusy(false);}
  }
  if(acute)return <><h1>Contact a dental professional promptly.</h1><Notice warning>You reported severe pain, swelling, or fever. The simulation is skipped. Contact a dentist now for assessment; this app cannot determine a safe waiting period.</Notice></>;
  const point=result?.points[Math.min(inspect,result.points.length-1)];
  const medium=result?.points.find(p=>p.escalation>=.1);
  const high=result?.points.find(p=>p.escalation>=.25);
  return <><h1>How could risk change over time?</h1><p className="intro">Explore 10,000 illustrative futures for untreated progression associated with your planned {procedure.toLowerCase()}.</p>
    <Notice>Demo model only. These invented probabilities and starting states are not clinical estimates. The simulation describes assumed progression and cannot diagnose, select a procedure, or establish a safe treatment date.</Notice>
    <form onSubmit={e=>{e.preventDefault();void run();}}>
      <Card title="Monthly transition assumptions"><div className="grid"><label>Assumed starting condition<select value={initial} onChange={e=>{setInitial(Number(e.target.value));setResult(null);}}>{riskStates.slice(0,4).map((s,i)=><option key={s} value={i}>{s}</option>)}</select></label><label>Time horizon<select value={months} onChange={e=>{setMonths(Number(e.target.value));setResult(null);}}><option value={12}>12 months</option><option value={24}>24 months</option></select></label></div>
      <div className="grid">{rates.map((v,i)=><label key={i}>{riskStates[i]} → {riskStates[i+1]} (% per month)<input required type="number" min={0} max={100} step="0.1" value={v} onChange={e=>{setRates(rates.map((r,j)=>j===i?e.target.value:r));setResult(null);}}/></label>)}</div>
      <p className="muted">Each month, a trajectory stays in its current state or advances one state. Tooth loss is absorbing. This model assumes no treatment and no recovery.</p>
      {error&&<p role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy?'Simulating…':result?'Run again':'Run 10,000 simulations'}</Button></Card>
    </form>
    {result&&<><Card title="Escalation probability over time"><p>Probability of advancing beyond the assumed starting condition by each month. Bands: low below 10%, medium 10–25%, high 25% or above.</p>
      <svg className="risk-chart" viewBox="0 0 720 300" role="img" aria-label="Escalation probability versus months. Exact probabilities appear in the table below.">
        <rect x="65" y="32" width="620" height="169.5" fill="#fcebed"/><rect x="65" y="201.5" width="620" height="33.9" fill="#fff4dd"/><rect x="65" y="235.4" width="620" height="22.6" fill="#eaf4ee"/>
        {[0,25,50,75,100].map(v=><g key={v}><line x1="65" x2="685" y1={258-v*2.26} y2={258-v*2.26} stroke="#d5d5d5"/><text x="52" y={263-v*2.26} textAnchor="end">{v}%</text></g>)}
        <polyline fill="none" stroke="#650030" strokeWidth="3" points={result.points.map(p=>`${65+p.month/months*620},${258-p.escalation*226}`).join(' ')}/>
        {[0,6,12,18,24].filter(m=>m<=months).map(m=><text key={m} x={65+m/months*620} y="282" textAnchor="middle">{m} mo</text>)}
      </svg>
      <div className="risk-table-wrap"><table className="risk-table"><caption>Selected months under these assumptions</caption><thead><tr><th>Months waiting</th><th>Any escalation</th><th>Model band</th></tr></thead><tbody>{[0,3,6,12,18,24].filter(m=>m<=months).map(m=>{const p=result.points[m];return <tr key={m}><td>{m}</td><td>{(100*p.escalation).toFixed(1)}%</td><td>{p.escalation<.1?'Low':p.escalation<.25?'Medium':'High'}</td></tr>;})}</tbody></table></div>
      <p className="notice">Under these assumptions, the model first reaches 10% escalation {medium?`at month ${medium.month}`:'after the displayed horizon'} and 25% {high?`at month ${high.month}`:'after the displayed horizon'}. These are model thresholds, not treatment recommendations.</p>
      </Card>
      <Card title="Inspect a month"><label>Month {inspect}<input type="range" min="0" max={months} value={inspect} onChange={e=>setInspect(Number(e.target.value))}/></label>{point&&<><p><strong>{(point.escalation*100).toFixed(1)}%</strong> escalated beyond the starting condition by month {point.month}.</p><div className="risk-distribution">{point.distribution.map((p,i)=><div key={i}><span>{riskStates[i]}</span><progress max={1} value={p}/><strong>{(p*100).toFixed(1)}%</strong></div>)}</div></>}</Card>
      <Button onClick={onContinue}>Continue to providers →</Button></>}
  </>;
}
