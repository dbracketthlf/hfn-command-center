import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('live Assistant Performance uses a summary row and an eight-cell metric grid without a score block',async()=>{const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.match(app,/assistant-summary/);assert.match(app,/assistant-sla-grid/);assert.match(app,/const assistantMetrics=\[/);assert.doesNotMatch(app,/assistant-performance[\s\S]*safe\(a\.score\)/);});
test('Assistant Performance grid has responsive four-column desktop styling',async()=>{const styles=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');assert.match(styles,/assistant-sla-grid/);assert.match(styles,/@media\(max-width:900px\)/);});
