import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('live Assistant Performance includes CD Sent in its summary-and-grid design without a score block',async()=>{const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.match(app,/assistant-summary/);assert.match(app,/assistant-sla-grid/);assert.match(app,/\['CD Sent','closing_disclosure_sent'\]/);assert.doesNotMatch(app,/assistant-performance[\s\S]*safe\(a\.score\)/);});
test('Assistant Performance grid has responsive four-column desktop styling',async()=>{const styles=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');assert.match(styles,/assistant-sla-grid/);assert.match(styles,/@media\(max-width:900px\)/);});
