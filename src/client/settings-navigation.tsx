import React from 'react';

export const settingsPages = {
  companionship: '日常陪伴',
  intelligence: '智能管家',
  appearance: '外观与生活',
  advanced: '高级与数据',
} as const;
export type SettingsPage = keyof typeof settingsPages;

/** Hidden pages remain mounted so navigating never discards an unsaved draft. */
export function SettingsNavigation({current,onChange,idPrefix}:{current:SettingsPage;onChange:(page:SettingsPage)=>void;idPrefix:string}) {
  return <nav className="bf-settings-nav" aria-label="大肥鱼设置分区">
    <span className="bf-settings-nav-caption">宠物设置</span>
    {(Object.entries(settingsPages) as [SettingsPage,string][]).map(([id,label]) => <button
      type="button" key={id} aria-current={current===id?'page':undefined} aria-controls={`${idPrefix}-${id}`}
      onClick={()=>onChange(id)}>{label}<span aria-hidden="true">›</span></button>)}
  </nav>;
}
