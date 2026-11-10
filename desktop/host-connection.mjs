/** Main-process-only DSH login exchange. Never expose cookies to a renderer. */
export function hostAddress(value, token = '') {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.hash || [...u.searchParams.keys()].some(k => k !== 'token') || u.searchParams.getAll('token').length > 1) throw Error('请输入 DSH Host 根地址或启动登录链接');
  if (u.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) throw Error('远程 Host 必须使用 HTTPS');
  const credential = token || u.searchParams.get('token') || '';
  if (typeof credential !== 'string' || credential.length > 8192 || /[\r\n]/.test(credential)) throw Error('登录凭据无效');
  return {url:u.origin, token:credential};
}
export async function exchangeHost(value, token = '', transport = fetch) {
  const address = hostAddress(value, token);
  const url = new URL('/', address.url);
  if (address.token) url.searchParams.set('token', address.token);
  let response;
  try { response = await transport(url, {redirect:'manual', signal:AbortSignal.timeout(15000)}); }
  catch { throw Error('无法连接 DSH Host，请检查地址与运行状态'); }
  if (![200,303].includes(response.status)) throw Error('DSH 登录失败，请使用当前 Host 的启动登录链接');
  const cookies = response.headers.getSetCookie().map(value => value.split(';')[0]).filter(value => /^dsh-auth-[A-Za-z0-9_-]+=[A-Za-z0-9_.-]+$/.test(value));
  if (address.token && !cookies.length) throw Error('Host 未返回登录会话，请重新取得启动链接');
  return {url:address.url, cookie:cookies.join('; ')};
}
