import {test,expect} from '@playwright/test';
test.describe.serial('FlowDesk 完整链路',()=>{
 test('Dashboard KPI 与最近流程进入编辑器',async({page})=>{await page.goto('/');await expect(page.getByTestId('kpi-grid')).toBeVisible();await expect(page.getByText('流程总数')).toBeVisible();await expect(page.getByText('异常实例',{exact:true}).first()).toBeVisible();await page.getByTestId('recent-workflow').first().click();await expect(page.getByTestId('flow-canvas')).toBeVisible();});
 test('审批配置、保存和双区域校验',async({page})=>{await page.goto('/workflows/wf-1');await page.getByTestId('canvas-node-approval').click();await expect(page.getByTestId('config-panel')).toContainText('审批配置');await page.getByLabel('审批人来源').selectOption({label:'固定角色'});await page.getByTestId('save-node-config').click();await page.getByRole('button',{name:'保存草稿'}).click();await page.getByTestId('validate-button').click();await expect(page.getByTestId('canvas-node-condition')).toHaveClass(/invalid/);await expect(page.getByTestId('issues-panel')).toContainText('条件分支规则未配置');const before=await page.getByTestId('error-count').textContent();expect(Number(before?.match(/\d+/)?.[0])).toBeGreaterThan(0);await page.getByTestId('canvas-node-condition').click();await page.getByLabel('条件字段').selectOption('amount');await page.getByLabel('条件比较值').fill('5000');await page.getByTestId('save-node-config').click();await page.getByTestId('validate-button').click();await expect(page.getByTestId('error-count')).toContainText('0 错误');});
 test('表单预览金额驱动条件分支',async({page})=>{await page.goto('/workflows/wf-1/preview');await expect(page.getByTestId('branch-result')).toContainText('标准分支');await page.getByLabel('申请金额').fill('12000');await expect(page.getByTestId('branch-result')).toContainText('高额分支');});
 test('发布后列表和总览同步',async({page})=>{await page.goto('/workflows/wf-2');await page.getByTestId('publish-button').click();await expect(page.getByRole('status')).toContainText('发布成功');await page.getByRole('link',{name:'流程管理'}).click();const row=page.getByTestId('workflow-row').filter({hasText:'采购合同审批'});await expect(row).toContainText('已发布');await expect(row).toContainText('v3');await page.getByRole('link',{name:'总览'}).click();await expect(page.getByTestId('kpi-grid')).toBeVisible();});
 test('异常实例详情、时间线与当前节点高亮',async({page})=>{await page.goto('/monitor');await page.getByRole('button',{name:'异常',exact:true}).click();await page.getByTestId('instance-row').first().click();await expect(page.getByTestId('instance-detail')).toBeVisible();await expect(page.getByTestId('execution-timeline')).toContainText('提交申请');await expect(page.locator('.runtime-highlight')).toHaveCount(1);});
 test('版本比较并恢复历史版本',async({page})=>{await page.goto('/workflows/wf-2/versions');await expect(page.getByTestId('version-compare')).toContainText('新增节点');await page.getByTestId('restore-version').click();await expect(page).toHaveURL(/\/workflows\/wf-2$/);await expect(page.getByRole('status')).toContainText('已恢复');await expect(page.getByTestId('flow-canvas')).toBeVisible();});
});

test('1440px 桌面视觉与控制台验证',async({page})=>{
 const errors:string[]=[]; page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 for(const path of ['/','/workflows/wf-1','/monitor']){await page.goto(path);await page.waitForTimeout(250);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);expect(overflow,`${path} 不应横向溢出`).toBeFalsy()}
 await page.goto('/'); await page.screenshot({path:'test-results/dashboard-1440.png',fullPage:true});
 expect(errors,'浏览器 console 不应出现 error').toEqual([]);
});

const openFirstAbnormal=async(page:import('@playwright/test').Page)=>{
 await page.goto('/monitor');
 await page.getByRole('button',{name:'异常',exact:true}).click();
 await page.getByTestId('instance-row').first().click();
 await expect(page.getByTestId('instance-detail')).toBeVisible();
};

test.describe('异常实例重试闭环',()=>{
 test('仅节点责任角色可发起重试，重复点击不会并列',async({page})=>{
  await openFirstAbnormal(page);
  // 首条异常实例停在“直属主管审批”，责任角色为部门负责人；先以系统管理员身份被拒
  await page.getByTestId('role-switch').selectOption('系统管理员');
  await expect(page.getByTestId('node-owner')).toContainText('部门负责人');
  await expect(page.getByTestId('start-retry')).toBeDisabled();
  await expect(page.getByTestId('retry-blocked')).toContainText('仅「部门负责人」可重试');
  // 切到责任角色后可发起
  await page.getByTestId('role-switch').selectOption('部门负责人');
  await page.getByTestId('start-retry').click();
  await expect(page.getByTestId('retry-running')).toBeVisible();
  // 同一实例同一节点同时只能有一个进行中的重试：按钮消失，列表中只有一条执行中记录
  await expect(page.getByTestId('start-retry')).toHaveCount(0);
  await expect(page.getByTestId('attempt-item').filter({hasText:'进行中'})).toHaveCount(1);
 });

 test('进行中的重试刷新后仍唯一，失败保留原异常并追加有序尝试',async({page})=>{
  await openFirstAbnormal(page);
  await page.getByTestId('role-switch').selectOption('部门负责人');
  await page.getByTestId('start-retry').click();
  await expect(page.getByTestId('snapshot-badge')).toContainText('节点快照已冻结');
  // 刷新：实例仍是重试中、快照和尝试顺序还在，且仍只有一条进行中尝试
  await page.reload();
  await expect(page.getByTestId('instance-detail')).toBeVisible();
  await expect(page.getByTestId('retry-running')).toBeVisible();
  await expect(page.getByTestId('snapshot-badge')).toBeVisible();
  await expect(page.getByTestId('attempt-item').filter({hasText:'进行中'})).toHaveCount(1);
  // 模拟失败：状态回到异常，原错误码保留，尝试记录变为失败 #1
  await page.getByTestId('retry-fail').click();
  await expect(page.getByTestId('retry-panel')).toContainText('异常代码');
  await expect(page.getByTestId('instance-detail').locator('.detail-meta')).toContainText('异常');
  const first=page.getByTestId('attempt-item').first();
  await expect(first).toContainText('失败');
  await expect(first.locator('.attempt-seq')).toHaveText('#1');
  await expect(first).toContainText('APPROVER_TIMEOUT');
  await expect(page.getByTestId('execution-timeline')).toContainText('第 1 次重试失败');
  // 可以再次发起，序号递增为 2，顺序在 #1 之后
  await expect(page.getByTestId('start-retry')).toContainText('发起第 2 次重试');
  await page.getByTestId('start-retry').click();
  const running=page.getByTestId('attempt-item').filter({hasText:'进行中'});
  await expect(running).toHaveCount(1);
  await expect(running.locator('.attempt-seq')).toHaveText('#2');
  await page.getByTestId('retry-fail').click();
  await expect(page.getByTestId('attempt-item')).toHaveCount(2);
  await expect(page.getByTestId('attempt-item').nth(0).locator('.attempt-seq')).toHaveText('#1');
  await expect(page.getByTestId('attempt-item').nth(1).locator('.attempt-seq')).toHaveText('#2');
  // 再刷新一次：失败态与尝试顺序仍一致
  await page.reload();
  await expect(page.getByTestId('instance-detail').locator('.detail-meta')).toContainText('异常');
  await expect(page.getByTestId('attempt-item')).toHaveCount(2);
  await expect(page.getByTestId('attempt-item').nth(1)).toContainText('第 2 次');
 });

 test('重试开始后编辑与发布不能改变实例节点快照',async({page})=>{
  await openFirstAbnormal(page);
  const snapshotNodes=await page.getByTestId('runtime-canvas').locator('.flow-node').count();
  await page.getByTestId('role-switch').selectOption('部门负责人');
  await page.getByTestId('start-retry').click();
  await expect(page.getByTestId('snapshot-badge')).toBeVisible();
  // 到编辑器改审批配置、补齐条件规则并发布新版本（v1 -> v2）
  await page.goto('/workflows/wf-1');
  await page.getByTestId('canvas-node-approval').click();
  await page.getByLabel('审批人来源').selectOption({label:'固定角色'});
  await page.getByTestId('save-node-config').click();
  await page.getByTestId('canvas-node-condition').click();
  await page.getByLabel('条件字段').selectOption('amount');
  await page.getByLabel('条件比较值').fill('5000');
  await page.getByTestId('save-node-config').click();
  await page.getByTestId('publish-button').click();
  await expect(page.getByRole('status')).toContainText('发布成功');
  // 回到实例：画布仍是冻结快照（节点数量未变），徽标仍标记发起时的 v1
  await page.goto('/monitor?instance=INS-2026-0001');
  await expect(page.getByTestId('instance-detail')).toBeVisible();
  await expect(page.getByTestId('runtime-canvas').locator('.flow-node')).toHaveCount(snapshotNodes);
  await expect(page.getByTestId('runtime-canvas')).toContainText('直属主管审批');
  await expect(page.getByTestId('snapshot-badge')).toContainText('基于 v1');
  await expect(page.getByTestId('snapshot-note')).toBeVisible();
 });

 test('重试成功才能关闭实例，关闭后不可再重试',async({page})=>{
  await openFirstAbnormal(page);
  await page.getByTestId('role-switch').selectOption('部门负责人');
  await page.getByTestId('start-retry').click();
  await page.getByTestId('retry-succeed').click();
  await expect(page.getByTestId('retry-closed')).toContainText('实例已关闭');
  await expect(page.getByTestId('instance-detail').locator('.detail-meta')).toContainText('已完成');
  await expect(page.getByTestId('start-retry')).toHaveCount(0);
  await expect(page.getByTestId('execution-timeline')).toContainText('流程结束');
  // 刷新后仍是已关闭
  await page.reload();
  await expect(page.getByTestId('instance-detail').locator('.detail-meta')).toContainText('已完成');
  await expect(page.getByTestId('retry-closed')).toBeVisible();
  await expect(page.getByTestId('start-retry')).toHaveCount(0);
 });
});
