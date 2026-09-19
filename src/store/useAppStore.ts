import {create} from 'zustand';
import {workflows as seed} from '../../mock-data/workflows';
import {instances as seedInstances} from '../../mock-data/instances';
import type {FlowEdge,FlowNode,Instance,RetryAttempt,ValidationIssue,Workflow} from '../types';

const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));
const STORE_KEY='flowdesk-state-v2';

// 异常节点的默认责任角色，兜底历史版本快照中缺失 ownerRole 的节点
const fallbackOwner:Record<string,string>={approval:'部门负责人',condition:'系统管理员',automation:'系统管理员',notify:'系统管理员',form:'部门负责人'};
export const ownerRoleOf=(node?:FlowNode):string|undefined=>node?.data.config?.ownerRole||fallbackOwner[node?.type||''];

const now=()=>{const d=new Date(),p=(x:number)=>String(x).padStart(2,'0');return `2026-07-11 ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`};

const validate=(w:Workflow):ValidationIssue[]=>{
 const issues:ValidationIssue[]=[];
 if(!w.nodes.some(n=>n.type==='end')) issues.push({nodeId:w.nodes[0]?.id||'flow',level:'error',message:'流程缺少结束节点'});
 const linked=new Set(w.edges.flatMap(e=>[e.source,e.target]));
 w.nodes.filter(n=>n.type!=='start'&&n.type!=='end'&&!linked.has(n.id)).forEach(n=>issues.push({nodeId:n.id,level:'error',message:'必经节点不能孤立'}));
 w.nodes.forEach(n=>{
  if(n.type==='condition'&&!n.data.config.ruleType)issues.push({nodeId:n.id,level:'error',message:'条件分支规则未配置'});
  if(n.type==='approval'&&!n.data.config.approverSource)issues.push({nodeId:n.id,level:'error',message:'审批人不能为空'});
 });
 return issues;
};

interface Persisted {workflows:Workflow[];instances:Instance[];currentRole:string}
const loadPersisted=():Partial<Persisted>=>{
 try{const raw=localStorage.getItem(STORE_KEY);return raw?JSON.parse(raw):{}}catch{return {}}
};
const persisted=loadPersisted();

interface State{
 workflows:Workflow[];instances:Instance[];currentRole:string;
 currentId:string;selectedNodeId:string|null;issues:ValidationIssue[];toast:string;
 setCurrent:(id:string)=>void;selectNode:(id:string|null)=>void;
 updateNodes:(nodes:FlowNode[])=>void;updateEdges:(edges:FlowEdge[])=>void;updateConfig:(id:string,config:Record<string,any>)=>void;
 runValidation:()=>ValidationIssue[];save:()=>void;publish:()=>void;create:()=>string;copy:(id:string)=>void;archive:(id:string)=>void;restore:(v:number)=>void;
 setCurrentRole:(role:string)=>void;
 startRetry:(instanceId:string)=>boolean;finishRetry:(instanceId:string,outcome:'success'|'failure')=>void;
 clearToast:()=>void;
}

export const useAppStore=create<State>((set,get)=>({
 workflows:persisted.workflows?persisted.workflows:clone(seed),
 instances:persisted.instances?persisted.instances:clone(seedInstances),
 currentRole:persisted.currentRole||'部门负责人',
 currentId:'wf-1',selectedNodeId:null,issues:[],toast:'',
 setCurrent:id=>set({currentId:id,selectedNodeId:null,issues:[]}),
 selectNode:id=>set({selectedNodeId:id}),
 updateNodes:nodes=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,nodes}:w)})),
 updateEdges:edges=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,edges}:w)})),
 updateConfig:(id,config)=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,nodes:w.nodes.map(n=>n.id===id?{...n,data:{...n.data,config:{...n.data.config,...config},state:'configuring'}}:n)}:w)})),
 runValidation:()=>{
  const w=get().workflows.find(x=>x.id===get().currentId)!;
  const issues=validate(w);
  set(s=>({issues,workflows:s.workflows.map(x=>x.id===w.id?{...x,nodes:x.nodes.map(n=>({...n,data:{...n.data,state:issues.some(i=>i.nodeId===n.id)?'invalid':'valid'}}))}:x),toast:issues.length?`发现 ${issues.length} 个问题`:'校验通过'}));
  return issues;
 },
 save:()=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,status:'draft',updatedAt:now()}:w),toast:'草稿已保存'})),
 publish:()=>set(s=>({workflows:s.workflows.map(w=>{
   if(w.id!==s.currentId)return w;
   const version=w.version+1;
   return {...w,status:'published',version,publishedAt:now(),updatedAt:now(),versions:[...w.versions,{version,createdAt:now(),note:'发布最新审批配置',nodes:clone(w.nodes),edges:clone(w.edges)}]};
  }),toast:'流程发布成功'})),
 create:()=>{
  const id='wf-'+Date.now();
  set(s=>({workflows:[{id,name:'未命名流程',domain:'财务',status:'draft',version:0,editor:'林秋',updatedAt:now(),abnormalCount:0,nodes:[],edges:[],versions:[]},...s.workflows],currentId:id}));
  return id;
 },
 copy:id=>set(s=>{const w=s.workflows.find(x=>x.id===id)!;return{workflows:[{...clone(w),id:'wf-'+Date.now(),name:w.name+'（副本）',status:'draft'},...s.workflows]}}),
 archive:id=>set(s=>({workflows:s.workflows.map(w=>w.id===id?{...w,status:'archived'}:w)})),
 restore:v=>set(s=>({workflows:s.workflows.map(w=>{if(w.id!==s.currentId)return w;const old=w.versions.find(x=>x.version===v)!;return{...w,status:'draft',nodes:clone(old.nodes),edges:clone(old.edges)}}),toast:`已恢复 v${v} 为草稿`})),
 setCurrentRole:role=>set({currentRole:role}),
 // 发起重试：仅异常/超时实例、仅当前节点责任角色、同一实例同一节点同时只能有一个进行中的重试
 startRetry:(instanceId)=>{
  const s=get();
  const item=s.instances.find(i=>i.id===instanceId);
  if(!item)return false;
  if(item.status==='completed'){set({toast:'实例已关闭，不能再发起重试'});return false}
  const running=item.attempts.some(a=>a.result==='running');
  if(running){set({toast:'该节点已有进行中的重试，请勿重复发起'});return false}
  const flow=s.workflows.find(w=>w.id===item.workflowId);
  const node=flow?.nodes.find(n=>n.data.label===item.currentNode);
  const owner=ownerRoleOf(node);
  if(!owner){set({toast:'当前节点缺少责任角色配置'});return false}
  if(owner!==s.currentRole){set({toast:`只有「${owner}」可以重试该节点`});return false}
  const seq=item.attempts.length+1;
  const startedAt=now();
  const attempt:RetryAttempt={id:`try-${item.id}-${seq}`,seq,nodeId:node?.id||item.currentNode,nodeLabel:item.currentNode,role:owner,startedAt,result:'running'};
  // 快照只在首次重试时冻结一次：之后的编辑、发布都不改变这个实例看到的流程
  const snapshot=item.snapshot?item.snapshot:{workflowVersion:flow?.version||0,capturedAt:startedAt,nodes:clone(flow?.nodes||[]),edges:clone(flow?.edges||[])};
  set(st=>({instances:st.instances.map(i=>i.id===instanceId?{
    ...i,
    snapshot,
    attempts:[...i.attempts,attempt],
    timeline:[...i.timeline,{title:`第 ${seq} 次重试：${item.currentNode}`,time:startedAt.slice(11),status:'running'}]
  }:i),toast:`已由 ${owner} 发起第 ${seq} 次重试`}));
  return true;
 },
 // 重试落库：成功才能关闭实例；失败保留原异常并追加失败尝试
 finishRetry:(instanceId,outcome)=>{
  const s=get();
  const item=s.instances.find(i=>i.id===instanceId);
  if(!item)return;
  const idx=item.attempts.findIndex(a=>a.result==='running');
  if(idx<0)return;
  const attempt=item.attempts[idx];
  const finishedAt=now();
  const done={...attempt,finishedAt};
  if(outcome==='success'){
   const closed={...done,result:'success' as const,message:'节点处理成功，流程继续执行并正常结束'};
   set(st=>({instances:st.instances.map(i=>i.id===instanceId?{
    ...i,status:'completed' as const,closedAt:finishedAt,risk:'low',
    attempts:i.attempts.map(a=>a.id===attempt.id?closed:a),
    timeline:i.timeline.map(t=>t.status==='running'&&t.title.includes('重试')?{...t,status:'success'}:{...t,status:t.status==='current'?'completed':t.status==='pending'?'completed':t.status}).concat([{title:`第 ${attempt.seq} 次重试成功`,time:finishedAt.slice(11),status:'success'},{title:'流程结束',time:finishedAt.slice(11),status:'completed'}])
   }:i),toast:`第 ${attempt.seq} 次重试成功，实例已关闭`}));
  }else{
   const failed={...done,result:'failure' as const,errorCode:item.errorCode||'RETRY_FAILED',message:'重试处理失败，异常已保留，可再次发起重试'};
   set(st=>({instances:st.instances.map(i=>i.id===instanceId?{
    ...i,
    attempts:i.attempts.map(a=>a.id===attempt.id?failed:a),
    timeline:i.timeline.map(t=>t.status==='running'&&t.title.includes('重试')?{...t,status:'failure'}:t).concat([{title:`第 ${attempt.seq} 次重试失败 · ${failed.errorCode}`,time:finishedAt.slice(11),status:'failure'}])
   }:i),toast:`第 ${attempt.seq} 次重试失败，原异常已保留`}));
  }
 },
 clearToast:()=>set({toast:''})
}));

// 刷新后实例状态、节点快照、尝试顺序保持一致
useAppStore.subscribe(state=>{
 try{localStorage.setItem(STORE_KEY,JSON.stringify({workflows:state.workflows,instances:state.instances,currentRole:state.currentRole}))}catch{}
});
