// Keep every screen aware of a server deployment without discarding desk work.
let started = false;
export function watchAppUpdates() {
  if (started) return;
  started = true;
  let revision, checking = false;
  async function check() {
    if (checking || document.visibilityState === 'hidden') return;
    checking = true;
    try {
      const response = await fetch('/api/app-revision', { cache: 'no-store' });
      if (!response.ok) return;
      const current = (await response.json()).revision;
      if (!current) return;
      if (!revision) { revision = current; return; }
      if (revision === current || document.getElementById('app-update-notice')) return;
      const notice = document.createElement('div');
      notice.id = 'app-update-notice';
      notice.setAttribute('role', 'status');
      notice.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:100;background:white;color:#163353;border:2px solid #12619b;border-radius:10px;padding:16px;box-shadow:0 4px 20px #0003';
      notice.innerHTML = '<b>HMS update available.</b> Finish or save your current work, then reload to use the latest changes on every page. <button class="btn-primary" type="button">Reload latest version</button>';
      notice.querySelector('button').onclick = () => window.location.reload();
      document.body.append(notice);
    } catch { /* Recheck when the connection recovers. */ }
    finally { checking = false; }
  }
  check();
  setInterval(check, 30000);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
}
