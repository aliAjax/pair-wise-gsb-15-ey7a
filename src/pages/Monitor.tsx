import {useMemo,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Activity,AlertTriangle,Clock,Lock,Search,X,RotateCw,CheckCircle2,XCircle,UserCog,Camera,History} from 'lucide-react';
import {Empty,PageTitle,Status} from '../components/common';
import {FlowCanvas} from '../components/FlowCanvas';
import {useAppStore,ownerRoleOf} from '../store/useAppStore';
import type {Instance} from '../types';

function RetryPanel({item}:{item:Instance}){
 const currentRole=useAppStore(s=>s.currentRole);
 const workflows=useAppStore(s=>s.workflows);
 const startRetry=useAppStore(s=>s.startRetry);
 const finishRetry=useAppStore(s=>s.finishRetry);
 const flow=workflows.find(w=>w.id===item.workflowId);
 const graph=item.snapshot?{nodes:item.snapshot.nodes,edges:item.snapshot.edges}:flow?{nodes:flow.nodes,edges:flow.edges}:{nodes:[],edges:[]};
 const node=graph.nodes.find(n=>n.data.label===item.currentNode);
 const owner=ownerRoleOf(node);
 const running=item.attempts.find(a=>a.result==='running');
 const closed=item.status==='completed';
 const canStart=!closed&&!running&&!!owner&&owner===currentRole;
 let blocked='';
 if(closed)blocked='实例已正常关闭';
 else if(running)blocked='该节点已有进行中的重试';
 else if(!owner)blocked='当前节点缺少责任角色配置';
 else if(owner!==currentRole)blocked=`仅「${owner}」可重试，当前角色为「${currentRole}」`;
 return <section className="retry-panel" data-testid="retry-panel">
  <div className="retry-head"><h3><RotateCw/>异常重试</h3>{item.snapshot&&<span className="snapshot-badge" data-testid="snapshot-badge"><Camera/>节点快照已冻结 · 基于 v{item.snapshot.workflowVersion} · {item.snapshot.capturedAt.slice(5)}</span>}</div>
  <div className="retry-meta">
   <div><small>异常节点</small><b>{item.currentNode}</b></div>
   <div><small>责任角色</small><b data-testid="node-owner"><UserCog/>{owner||'未配置'}</b></div>
   <div><small>当前角色</small><b>{currentRole}</b></div>
   <div><small>异常代码</small><b className="mono">{item.errorCode||'—'}</b></div>
  </div>
  {item.errorReason&&<p className="error-reason"><AlertTriangle/>{item.errorReason}</p>}
  {closed?<div className="retry-closed" data-testid="retry-closed"><CheckCircle2/><div><b>实例已关闭</b><small>{item.closedAt} 经重试成功后正常结束，共执行 {item.attempts.length} 次重试</small></div></div>
   :running?<div className="retry-running" data-testid="retry-running">
     <div><span className="spinner"/><div><b>第 {running.seq} 次重试执行中</b><small>{running.nodeLabel} · 由 {running.role} 于 {running.startedAt} 发起</small></div></div>
     <p>重试进行期间，流程的编辑与发布都不会改变本实例的节点快照。请选择模拟的执行结果：</p>
     <div className="retry-actions"><button data-testid="retry-succeed" onClick={()=>finishRetry(item.id,'success')}><CheckCircle2/>模拟重试成功</button><button className="danger-btn" data-testid="retry-fail" onClick={()=>finishRetry(item.id,'failure')}><XCircle/>模拟重试失败</button></div>
    </div>
   :<div className="retry-start">
     <button data-testid="start-retry" disabled={!canStart} onClick={()=>startRetry(item.id)}><RotateCw/>发起第 {item.attempts.length+1} 次重试</button>
     {blocked&&<small data-testid="retry-blocked" className={owner&&owner!==currentRole?'deny':''}><Lock/>{blocked}</small>}
    </div>}
  <div className="attempts"><h4><History/>重试尝试（按发起顺序）</h4>{item.attempts.length===0?<p className="no-attempt">暂无重试记录</p>:<ol data-testid="attempt-list">{item.attempts.map(a=>{
   const order=item.attempts.indexOf(a)+1;
   return <li key={a.id} data-testid="attempt-item" className={'attempt '+a.result}><span className="attempt-seq">#{order}</span><div className="attempt-body"><b>第 {a.seq} 次 · {a.nodeLabel}</b><small>{a.role} 发起 · {a.startedAt}{a.finishedAt?` → ${a.finishedAt}`:' → 进行中'}</small>{a.errorCode&&<small className="attempt-err">错误码 {a.errorCode}：{a.message}</small>}{a.result==='success'&&<small className="attempt-ok">{a.message}</small>}</div><Status value={a.result}/></li>;
  })}</ol>}</div>
 </section>;
}

export function Monitor(){
 const ins=useAppStore(s=>s.instances),ws=useAppStore(s=>s.workflows);
 const [params,setParams]=useSearchParams();
 const [filter,setFilter]=useState('all');
 const selected=params.get('instance');
 const rows=useMemo(()=>ins.filter(i=>filter==='all'||i.status===filter),[ins,filter]);
 const item=ins.find(i=>i.id===selected);
 const liveFlow=ws.find(w=>w.id===item?.workflowId);
 const graph=item?.snapshot?{nodes:item.snapshot.nodes,edges:item.snapshot.edges}:liveFlow?{nodes:liveFlow.nodes,edges:liveFlow.edges}:undefined;
 const close=()=>{const u=new URLSearchParams(params);u.delete('instance');setParams(u)};
 return <div className="page">
  <PageTitle eyebrow="运行中心" title="Runtime Monitor" desc="观察流程实例状态、耗时和风险；异常实例仅可由停住节点的责任角色发起重试。"/>
  <section className="monitor-kpis">{[['运行中',ins.filter(i=>i.status==='running').length,Activity],['异常',ins.filter(i=>i.status==='abnormal').length,AlertTriangle],['超时',ins.filter(i=>i.status==='timeout').length,Clock],['今日完成',ins.filter(i=>i.status==='completed').length,Activity]].map(([a,b,I]:any)=><article key={a}><I/><span><small>{a}</small><b>{b}</b></span></article>)}</section>
  <div className="toolbar panel"><div className="search"><Search/><input placeholder="搜索实例或申请人"/></div>{[['all','全部'],['abnormal','异常'],['timeout','超时'],['running','进行中'],['completed','已完成']].map(([v,l])=><button key={v} className={'filter '+(filter===v?'active':'')} onClick={()=>setFilter(v)}>{l}</button>)}</div>
  <section className="panel monitor-table">{rows.length?<table><thead><tr><th>实例编号</th><th>申请人</th><th>业务域</th><th>当前节点</th><th>状态</th><th>提交时间</th><th>耗时</th><th>风险</th><th>重试</th></tr></thead><tbody>{rows.map(i=><tr key={i.id} data-testid="instance-row" onClick={()=>setParams({instance:i.id})}><td><b>{i.id}</b></td><td>{i.applicant}</td><td>{i.domain}</td><td>{i.status==='completed'?'已结束':i.currentNode}</td><td><Status value={i.status}/></td><td>{i.submittedAt}</td><td>{i.duration}</td><td><Status value={i.risk}/></td><td>{i.attempts.length?`${i.attempts.length} 次`:i.status==='completed'?'—':'未重试'}</td></tr>)}</tbody></table>:<Empty/>}</section>
  {item&&graph&&<div className="drawer-backdrop"><aside className="instance-drawer" data-testid="instance-detail">
   <div className="drawer-head"><div><small>流程实例详情{liveFlow&&<> · {liveFlow.name}</>}</small><h2>{item.id}</h2></div><button className="icon-btn" onClick={close}><X/></button></div>
   <div className="detail-meta"><div><small>申请人</small><b>{item.applicant}</b></div><div><small>状态</small><Status value={item.status}/></div><div><small>耗时</small><b>{item.duration}</b></div><div><small>风险</small><Status value={item.risk}/></div></div>
   <h3>执行流程{item.snapshot&&<em className="snapshot-note" data-testid="snapshot-note"><Lock/>展示该实例冻结的节点快照（v{item.snapshot.workflowVersion}），不受后续编辑/发布影响</em>}</h3>
   <div className="runtime-canvas" data-testid="runtime-canvas"><FlowCanvas nodes={graph.nodes} edges={graph.edges} onNodes={()=>{}} onEdges={()=>{}} onSelect={()=>{}} highlight={graph.nodes.find(n=>n.data.label===item.currentNode)?.id}/></div>
   <RetryPanel item={item}/>
   <h3>执行时间线</h3>
   <div className="timeline" data-testid="execution-timeline">{item.timeline.map((t,k)=><div key={k} className={t.status}><i/><span><b>{t.title}</b><small>{t.time}</small></span><Status value={t.status==='current'?'current':t.status}/></div>)}</div>
  </aside></div>}
 </div>}
