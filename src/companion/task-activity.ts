import type {Task} from './state.js';

/** Current answerable interactions survive Agent idle, including continued questions.
 * Ledger history alone does not prove that an Agent is still working. */
export function taskActivity(task:Task):'waiting'|'running'|null {
 const question=task.pendingQuestions?.some(q=>q.callId.length>0&&(q.state==='open'||q.state==='continued'));
 const approval=task.pendingApprovals?.some(id=>id.length>0);
 const remote=(task.pendingRemote?.question??0)>0||(task.pendingRemote?.approval??0)>0;
 if(question||approval||remote)return 'waiting';
 // A driver still tearing down cannot undo its already committed terminal state.
 return task.state==='running'&&task.runtimeStatus==='running'?'running':null;
}
