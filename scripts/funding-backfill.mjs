import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const [displayLoanId,fundedDate,amountInput]=process.argv.slice(2);
const amount=Number(amountInput);
const validDate=typeof fundedDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(fundedDate)&&!Number.isNaN(Date.parse(`${fundedDate}T00:00:00Z`));
if(!displayLoanId?.trim()||!validDate||!Number.isFinite(amount)||amount<=0)throw new Error('Usage: npm run funding:backfill -- <loanId> <YYYY-MM-DD> <loanAmount>');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try{const result=await pool.query(`insert into historical_funding_corrections(id,display_loan_id,funded_date,loan_amount) values($1,$2,$3,$4) on conflict(display_loan_id) do update set funded_date=excluded.funded_date,loan_amount=excluded.loan_amount,updated_at=now() returning display_loan_id,funded_date,loan_amount,(xmax=0) inserted`,[randomUUID(),displayLoanId.trim(),fundedDate,amount]);const row=result.rows[0];console.log(`${row.inserted?'Inserted':'Updated'} ${row.display_loan_id}: ${row.funded_date} $${row.loan_amount}`);}finally{await pool.end();}
