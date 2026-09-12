import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { acceptArivePayload, createAriveStore, integrationHealth } from './src/integrations/arive.js';
import { loadRuntimeConfig, postgresPoolOptions } from './src/config/runtime.js';

const root = join(process.cwd(), 'public');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };
const json = (res, status, body) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };
async function readJson(req) {
  let data=''; for await (const part of req) { data+=part; if (data.length>1_000_000) throw new Error('Payload too large'); }
  if (!data) throw new Error('Request body is required'); try { return JSON.parse(data); } catch { throw new Error('Invalid JSON'); }
}
const authorized=(req,secret)=>{if(!secret)return true;const supplied=req.headers.authorization?.replace(/^Bearer\s+/i,'')??req.headers['x-hfn-webhook-secret'];if(!supplied)return false;const a=Buffer.from(supplied),b=Buffer.from(secret);return a.length===b.length&&timingSafeEqual(a,b);};
export function createHfnServer({ store=createAriveStore(), environment=process.env.NODE_ENV ?? 'development', webhookSecret }={}) {
  return createServer(async (req,res) => {
    const url=new URL(req.url,'http://localhost');
    try {
      if (req.method==='POST' && (url.pathname==='/api/integrations/arive/events' || (environment!=='production' && url.pathname==='/api/development/arive/synthetic-event'))) {
        if(url.pathname==='/api/integrations/arive/events'&&!authorized(req,webhookSecret))return json(res,401,{ok:false,error:'Unauthorized'});
        const payload=await readJson(req), result=store.receive?await store.receive(payload):acceptArivePayload(store,payload);
        return json(res,result.ok?200:400,{ok:result.ok,outcome:result.outcome,tasksCreated:result.tasksCreated,error:result.ok?undefined:result.error});
      }
      if (req.method==='GET' && url.pathname==='/api/integrations/arive/health') return json(res,200,store.health?await store.health():integrationHealth(store));
      if (req.method==='GET' && url.pathname==='/api/dashboard') return store.dashboard?json(res,200,await store.dashboard()):json(res,404,{ok:false,error:'Live dashboard unavailable in demo mode'});
      if (req.method==='GET' && url.pathname==='/api/admin/funding-goals') { if(!authorized(req,webhookSecret))return json(res,401,{ok:false,error:'Unauthorized'});if(!store.monthlyFundingGoal)return json(res,404,{ok:false,error:'Funding goals unavailable'});const now=new Date(),year=Number(url.searchParams.get('year')??now.getFullYear()),month=Number(url.searchParams.get('month')??now.getMonth()+1);return json(res,200,await store.monthlyFundingGoal(year,month)); }
      if (req.method==='PUT' && url.pathname==='/api/admin/funding-goals') { if(!authorized(req,webhookSecret))return json(res,401,{ok:false,error:'Unauthorized'});if(!store.saveMonthlyFundingGoal)return json(res,404,{ok:false,error:'Funding goals unavailable'});const body=await readJson(req);return json(res,200,await store.saveMonthlyFundingGoal({year:Number(body.year),month:Number(body.month),fundedLoanGoal:Number(body.fundedLoanGoal),fundedVolumeGoal:Number(body.fundedVolumeGoal)})); }
      if (req.method==='GET' && url.pathname==='/api/loans') return json(res,200,store.listLoans?await store.listLoans(url.searchParams.get('q')??''):{source:environment==='production'?'live':'demo',loans:[]});
      if (req.method==='GET' && url.pathname.startsWith('/api/loans/')) { if(!store.loanDetail)return json(res,404,{ok:false,error:'Live loan detail unavailable in demo mode'});const detail=await store.loanDetail(decodeURIComponent(url.pathname.slice('/api/loans/'.length)));return detail?json(res,200,detail):json(res,404,{ok:false,error:'Loan not found'}); }
      if (req.method==='GET' && (url.pathname==='/health'||url.pathname==='/api/health')) return json(res,200,{ok:true,status:'healthy'});
      if (url.pathname.startsWith('/api/')) return json(res,404,{ok:false,error:'Not found'});
      const requested=url.pathname==='/'?'index.html':url.pathname.slice(1), path=normalize(join(root,requested));
      if (!path.startsWith(root)) return res.writeHead(403).end('Forbidden');
      let body=await readFile(path); if(environment==='production'&&requested==='index.html')body=Buffer.from(body.toString().replace('</head>','<script>window.HFN_PRODUCTION=true;</script></head>')); res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream'}); res.end(body);
    } catch (error) { const clientError=['Invalid JSON','Request body is required','Payload too large'].includes(error.message);if(!clientError)console.error(JSON.stringify({route:url.pathname,errorName:error?.name??'Error',errorMessage:error?.message??'Unknown error',stack:error?.stack??null}));json(res,clientError?400:500,{ok:false,error:clientError?error.message:'Internal error'}); }
  });
}
export function listenHfnServer(server, config, onListening=()=>{}) { return server.listen({ port:config.port, host:'0.0.0.0' },onListening); }
if (process.argv[1]===fileURLToPath(import.meta.url)) { const config=loadRuntimeConfig(); let store=createAriveStore(); if(!config.demo){const {Pool}=await import('pg');const {PostgresAriveRepository}=await import('./src/storage/postgres-arive.js');store=new PostgresAriveRepository(new Pool(postgresPoolOptions(config)));await store.initialize();}const server=createHfnServer({store,environment:config.production?'production':'development',webhookSecret:config.webhookSecret});listenHfnServer(server,config,()=>console.log(`HFN Command Center running at http://0.0.0.0:${config.port}`)); }
