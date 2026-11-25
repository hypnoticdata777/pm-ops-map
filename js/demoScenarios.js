/** @typedef {{id:string, title:string, why:string, notice:string, action:string, result:string, view:string, target?:string, condition?:string}} DemoStep */
/** @typedef {{id:string, title:string, description:string, available:boolean, steps:DemoStep[]}} DemoScenario */
/** Only completed, verified scenarios become available. Phase 3 supplies maintenance steps. @type {DemoScenario[]} */
export const DEMO_SCENARIOS = [
  {id:'operation',title:'Set up an operation',description:'See how the company, property, contacts and people connect.',available:false,steps:[]},
  {id:'ownership',title:'Clarify who owns the work',description:'Find an unassigned responsibility and choose an owner.',available:false,steps:[]},
  {id:'workload',title:"Balance the team's workload",description:'Compare assignment counts and review a reassignment. Counts do not measure capacity.',available:false,steps:[]},
  {id:'maintenance',title:'Tighten maintenance flow',description:'Give an example repair an owner and a visible next step.',available:false,steps:[]},
  {id:'gaps',title:'Review operational gaps',description:'Find a gap and understand what to address first. Review indicators do not certify compliance.',available:false,steps:[]},
];
