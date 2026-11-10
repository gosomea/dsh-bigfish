import React from 'react';
export type SettingsVariant='disclosure'|'section';
export function SettingsSection({title,testId,variant='disclosure',children}:{title:string;testId:string;variant?:SettingsVariant;children:React.ReactNode}){
 return variant==='section'?<section aria-label={title} data-testid={testId}><h3>{title}</h3>{children}</section>:<details className="bf-disclosure" data-testid={testId}><summary>{title}</summary>{children}</details>;
}
