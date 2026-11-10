import {expect,type Locator,type Page} from '@playwright/test';
type Scope=Page|Locator;
export type SettingsPageName='日常陪伴'|'智能管家'|'外观与生活'|'高级与数据';
/** Page and floating settings may coexist. Operate only the settings surface the user can see. */
export const activeSettings=(scope:Scope)=>scope.locator('.bf-settings:visible').last();
export async function settingsPage(scope:Scope,name:SettingsPageName){
 const panel=activeSettings(scope),nav=panel.getByRole('navigation',{name:'大肥鱼设置分区'});
 if(!await nav.count()){
  if(name!=='日常陪伴')throw Error(`完整设置尚未打开：${name}`);
  return panel;
 }
 await nav.getByRole('button',{name,exact:true}).click();
 const body=panel.locator('[data-settings-page]:visible');await expect(body).toHaveAttribute('aria-label',name);return body;
}
export async function settingsDisclosure(scope:Scope,page:SettingsPageName,...titles:string[]){
 const body=await settingsPage(scope,page);
 for(const title of titles){
  const exact=new RegExp('^'+title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
  const summary=body.locator('summary').filter({hasText:exact});
  await expect(summary).toBeVisible();if(await summary.locator('..').getAttribute('open')===null)await summary.click();
 }
 return body;
}
export async function companionship(scope:Scope,more=false){
 const body=await settingsPage(scope,'日常陪伴');
 if(more&&await activeSettings(scope).getByRole('navigation',{name:'大肥鱼设置分区'}).count())return settingsDisclosure(scope,'日常陪伴','更多陪伴偏好');
 return body;
}
export const roleLibrary=(scope:Scope)=>settingsDisclosure(scope,'外观与生活','角色库与动作预览');
export const appearance=(scope:Scope)=>settingsDisclosure(scope,'外观与生活','外观与动画');
export const expertSpeed=(scope:Scope)=>settingsDisclosure(scope,'高级与数据','专家参数','速度与空挥参数');
export const lifeSettings=(scope:Scope)=>settingsDisclosure(scope,'外观与生活','装扮、成长与收藏');
/** Select through the actual themed combobox/listbox rather than a hidden native control. */
export async function selectSetting(scope:Scope,name:string,value:string|{label:string}){
 await selectControl(scope.getByRole('combobox',{name,exact:true}),value);
}
// An open listbox and its trigger intentionally share the accessible label.
// Narrow legacy getByLabel callers before every read rather than depending on menu timing.
const selectTrigger=(combo:Locator)=>combo.and(combo.page().getByRole('combobox'));
/** Access the currently visible option rows, opening the menu if needed. */
export async function settingOptions(combo:Locator){
 const trigger=selectTrigger(combo);
 if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();
 const id=await trigger.getAttribute('aria-controls');
 if(!id)throw Error('设置下拉框没有打开');
 return combo.page().locator(`[id="${id}"]`).getByRole('option');
}
export async function selectControl(combo:Locator,value:string|{label:string}){
 const trigger=selectTrigger(combo),options=await settingOptions(trigger);
 if(typeof value==='string'){
  const values=await options.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-value'))),index=values.indexOf(value);
  if(index<0)throw Error(`设置下拉框没有选项：${value}`);
  await options.nth(index).click();
 }else await options.filter({hasText:new RegExp('^'+value.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')}).click();
 await expect(trigger).toHaveAttribute('aria-expanded','false');
}
