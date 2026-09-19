export type WorkflowStatus='draft'|'published'|'archived';
export type NodeKind='start'|'form'|'approval'|'condition'|'automation'|'notify'|'end';
export type NodeState='unconfigured'|'configuring'|'valid'|'invalid';
export interface FormField {id:string;label:string;type:'text'|'number'|'amount'|'date'|'select'|'attachment';required:boolean;options?:string[]}
export interface FlowNode {id:string;type:NodeKind;position:{x:number;y:number};data:{label:string;state:NodeState;config:Record<string,any>}}
export interface FlowEdge {id:string;source:string;target:string;label?:string}
export interface Version {version:number;createdAt:string;note:string;nodes:FlowNode[];edges:FlowEdge[]}
export interface Workflow {id:string;name:string;domain:string;status:WorkflowStatus;version:number;editor:string;updatedAt:string;publishedAt?:string;abnormalCount:number;nodes:FlowNode[];edges:FlowEdge[];versions:Version[]}
export type InstanceStatus='abnormal'|'timeout'|'running'|'completed';
export type RetryResult='running'|'success'|'failure';
export interface RetryAttempt {id:string;seq:number;nodeId:string;nodeLabel:string;role:string;startedAt:string;finishedAt?:string;result:RetryResult;errorCode?:string;message?:string}
export interface InstanceSnapshot {workflowVersion:number;capturedAt:string;nodes:FlowNode[];edges:FlowEdge[]}
export interface Instance {id:string;workflowId:string;applicant:string;domain:string;currentNode:string;status:InstanceStatus;submittedAt:string;duration:string;risk:'high'|'medium'|'low';timeline:{title:string;time:string;status:string}[];errorCode?:string;errorReason?:string;attempts:RetryAttempt[];snapshot?:InstanceSnapshot;closedAt?:string}
export interface ValidationIssue {nodeId:string;level:'error'|'warning';message:string}
