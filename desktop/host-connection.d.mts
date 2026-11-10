export function hostAddress(value:string,token?:string):{url:string;token:string};
export function exchangeHost(value:string,token?:string,transport?:typeof fetch):Promise<{url:string;cookie:string}>;
