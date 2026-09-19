import type {Instance} from '../src/types';
import {domains,users} from './catalog';
const errors={
 '直属主管审批':{code:'APPROVER_TIMEOUT',reason:'审批人超过 24 小时未处理，任务自动转异常'},
 '金额判断':{code:'RULE_EVAL_ERROR',reason:'条件字段“申请金额”取值缺失，规则无法求值'}
} as const;
export const instances:Instance[]=Array.from({length:80},(_,i)=>{
 const status:Instance['status']=i<12?'abnormal':i<22?'timeout':i<50?'running':'completed';
 const currentNode=i%3===0?'直属主管审批':'金额判断';
 const err=status==='abnormal'||status==='timeout'?errors[currentNode as keyof typeof errors]:undefined;
 return {id:`INS-2026-${String(i+1).padStart(4,'0')}`,workflowId:`wf-${i%12+1}`,applicant:users[i%8],domain:domains[i%5],currentNode,status,submittedAt:`2026-07-${String(10-i%9).padStart(2,'0')} ${String(8+i%10).padStart(2,'0')}:10`,duration:status==='timeout'?`${28+i}h`:`${i%9+1}h ${i%6*10}m`,risk:i<22?'high':i<45?'medium':'low',timeline:[{title:'提交申请',time:'09:10',status:'completed'},{title:'直属主管审批',time:'10:24',status:i%3===0?'current':'completed'},{title:'金额判断',time:'11:05',status:i%3!==0?'current':'pending'}],errorCode:err?.code,errorReason:err?.reason,attempts:[]};
});
