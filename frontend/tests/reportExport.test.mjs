import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildReportExport,reportFilename} from '../src/utils/reportExport.js';
const snapshot=JSON.parse(await readFile(new URL('../public/demo/scenarios/multiple_faults.json',import.meta.url)));
const record={title:'Multiple faults',source:'demo',createdAt:{seconds:100},snapshotJson:JSON.stringify(snapshot),notes:'Operator review'};
test('metadata-only export excludes observations and notes until selected',()=>{
 const result=buildReportExport(record,{},'2026-10-31T00:00:00Z');
 assert.deepEqual(result.included_sections,[]);assert.equal(result.evidence,undefined);assert.equal(result.notes,undefined);assert.match(result.disclaimer,/Synthetic/);assert.equal(result.metadata.saved_at,'1970-01-01T00:01:40.000Z');
});
test('selected export preserves supported evidence and hypotheses while dropping unknown credential fields',()=>{
 const data=structuredClone(snapshot);data.token='SECRET';data.telemetry.credentials='SECRET';data.evidence[0].authorization='SECRET';data.diagnosis.findings[0].privateKey='SECRET';
 const result=buildReportExport({...record,snapshotJson:JSON.stringify(data),apiKey:'SECRET'},{diagnosis:true,evidence:true,incidents:true,impact:true,notes:true});
 assert.equal(result.diagnosis.findings.length,5);assert.equal(result.diagnosis.suspected_causes.length,2);assert.equal(result.evidence.length,11);assert.equal(result.incidents.length,2);assert.equal(result.notes,'Operator review');assert.ok(!JSON.stringify(result).includes('SECRET'));assert.deepEqual(result.diagnosis.findings[0].evidence_ids,['EV-201']);
});
test('selected diagnosis export includes the optional model comparison without unknown fields',()=>{
 const data=structuredClone(snapshot);data.diagnosis.optional_model={status:'available',reason:'Comparison',algorithm:'bernoulli_naive_bayes',training_runs:12,score_semantics:'relative_model_score_not_calibrated_probability',predictions:[{candidate_link:'R1-R2',relative_score:.75,credential:'SECRET'}],explanation:['finding:bgp_down'],credential:'SECRET'};
 const result=buildReportExport({...record,snapshotJson:JSON.stringify(data)},{diagnosis:true});
 assert.deepEqual(result.diagnosis.optional_model.predictions,[{candidate_link:'R1-R2',relative_score:.75}]);assert.deepEqual(result.diagnosis.optional_model.explanation,['finding:bgp_down']);assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('legacy and malformed snapshots export metadata with missing data explicitly marked',()=>{
 for(const data of [{},{snapshotJson:'{bad'},{snapshotJson:'null'}]) {const result=buildReportExport(data,{diagnosis:true,evidence:true});assert.equal(result.metadata.snapshot_available,false);assert.equal(result.diagnosis,null);assert.equal(result.evidence,null);assert.equal(result.metadata.source,'unknown');}
});
test('Live impact and provenance do not become simulated or confirmed physical faults',()=>{
 const result=buildReportExport({source:'live',snapshot:{telemetry:{collected_at:'2026-10-31T00:00:00Z'},investigation:{completed_at:'2026-10-31T01:00:00Z',operation:'diagnose_stored_telemetry'},diagnosis:{impact_analysis:{limitations:'Estimate only',affected_links:[{link:'R1-R2',impact:'partition',assessment:'Assumed',secret:'SECRET'}]}}}},{impact:true});
 assert.equal(result.metadata.source,'live');assert.match(result.disclaimer,/not confirmed/);assert.equal(result.impact.affected_links[0].secret,undefined);assert.equal(result.metadata.captured_at,'2026-10-31T01:00:00Z');
});
test('filenames are bounded and do not allow paths or HTML',()=>{assert.equal(reportFilename({title:'../../<script>'}),'netscope-script.json');assert.ok(reportFilename({title:'x'.repeat(200)}).length<90);});
const auth={currentUser:{uid:'owner'}};let write, failure;
mock.module('../src/services/firebase.js',{namedExports:{auth,db:{}}});
mock.module('firebase/firestore',{namedExports:{doc:(_db,...path)=>path,serverTimestamp:()=> 'server-time',updateDoc:async(path,data)=>{if(failure)throw failure;write={path,data};}}});
const {saveReportNotes}=await import('../src/services/reportNotes.js');
test('notes update only owner notes fields and preserve evidence',async()=>{await saveReportNotes('owner','report','Reviewed');assert.deepEqual(write,{path:['users','owner','investigations','report'],data:{notes:'Reviewed',notesUpdatedAt:'server-time'}});});
test('notes reject wrong owner, invalid IDs and excessive text; write failures propagate',async()=>{
 await assert.rejects(saveReportNotes('other','report','x'),/Sign in/);await assert.rejects(saveReportNotes('owner','a/b','x'),/Invalid/);await assert.rejects(saveReportNotes('owner','report','x'.repeat(10001)),/10,000/);failure={code:'permission-denied'};await assert.rejects(saveReportNotes('owner','report','x'));failure=null;
});
