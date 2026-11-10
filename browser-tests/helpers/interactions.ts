import {expect,type Locator} from '@playwright/test';
import {settingsPage} from './settings.js';

/** Use the interaction controls; the separate return-home command needs a saved destination. */
export async function lifeActions(pet:Locator){
 const popover=pet.locator('.bf-popover');
 if(!await popover.isVisible())await pet.getByRole('button',{name:'设置',exact:true}).click();
 if(await popover.getByRole('navigation',{name:'大肥鱼设置分区'}).count())await settingsPage(pet,'日常陪伴');
 const parents=popover.locator('details:has([data-testid="life-actions"])');
 for(let i=0;i<await parents.count();i++){
  const parent=parents.nth(i);
  if(await parent.getAttribute('open')===null)await parent.locator(':scope > summary').click();
 }
 const actions=pet.getByTestId('life-actions'),summary=actions.locator(':scope > summary');
 if(await summary.count()&&await actions.getAttribute('open')===null)await summary.click();
 await expect(actions).toBeVisible();return actions;
}

export async function wave(pet:Locator){
 const actions=await lifeActions(pet);
 await actions.getByRole('button',{name:'招招手',exact:true}).click();
}
