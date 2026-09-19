import {NavLink,Outlet} from 'react-router-dom';
import {Boxes,LayoutDashboard,Workflow,Activity,Search,Bell,HelpCircle,ShieldCheck} from 'lucide-react';
import {useAppStore} from '../store/useAppStore';
import {roles} from '../../mock-data/catalog';
export function Layout(){
 const toast=useAppStore(s=>s.toast),role=useAppStore(s=>s.currentRole),setRole=useAppStore(s=>s.setCurrentRole);
 return <div className="app"><aside className="sidebar"><div className="brand"><span className="brandmark">F</span><b>FlowDesk</b><small>STUDIO</small></div><nav><NavLink to="/"><LayoutDashboard/>总览</NavLink><NavLink to="/workflows"><Workflow/>流程管理</NavLink><NavLink to="/monitor"><Activity/>运行监控</NavLink></nav><div className="side-bottom"><span><Boxes/>组件中心</span><span><HelpCircle/>帮助中心</span><div className="user"><i>林</i><div>林秋<small data-testid="current-role">{role}</small></div></div></div></aside><div className="main"><header><div className="global-search"><Search/>搜索流程、实例或申请人</div><div className="header-actions"><Bell/><span>企业工作区</span><label className="role-switch"><ShieldCheck/><span>当前角色</span><select aria-label="当前角色" data-testid="role-switch" value={role} onChange={e=>setRole(e.target.value)}>{roles.map(r=><option key={r}>{r}</option>)}</select></label><i>林</i></div></header><main><Outlet/></main></div>{toast&&<div className="toast" role="status">✓ {toast}</div>}</div>}
