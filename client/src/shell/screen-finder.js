import {modal,esc} from '../ui.js';
import {navigate} from '../router.js';

/** Discover existing permitted screens without adding another workflow or changing access. */
export function openScreenFinder(areas,title='Find a screen') {
  const entries=areas.flatMap(area=>area.items.map(item=>({...item,area:area.section})));
  modal({title,size:'lg',body:`<label class="field-label" for="screen-finder-query">Search by screen or department</label><input id="screen-finder-query" class="field" type="search" autocomplete="off" placeholder="Billing, lab, stock, patients, users…"><p class="text-body-sm my-2" data-screen-count role="status" aria-live="polite"></p><div class="screen-finder-results" data-screen-results></div>`,footer:'<button class="btn-secondary" data-close>Close</button>',onMount(root,close){
    const input=root.querySelector('#screen-finder-query'),results=root.querySelector('[data-screen-results]');
    const paint=()=>{
      const terms=input.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      const rows=entries.filter(item=>terms.every(term=>(item.label+' '+item.area+' '+item.route).toLocaleLowerCase().includes(term)));
      root.querySelector('[data-screen-count]').textContent=`${rows.length} screen${rows.length===1?'':'s'} available to your login`;
      results.innerHTML=rows.length?rows.map(item=>`<button type="button" class="screen-finder-result" data-screen-route="${esc(item.route)}" ${item.external?'data-external="1"':''}><span class="material-symbols-outlined" aria-hidden="true">${esc(item.icon||'web')}</span><span><strong>${esc(item.label)}</strong><small>${esc(item.area)}</small></span><span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>`).join(''):'<p class="p-4 text-body-md">No matching screen. Try its department name.</p>';
    };
    paint();input.oninput=paint;
    input.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('button')?.focus();}if(e.key==='Enter'){e.preventDefault();results.querySelector('button')?.click();}};
    results.onclick=e=>{const button=e.target.closest('[data-screen-route]');if(!button)return;close();if(button.dataset.external)window.open(button.dataset.screenRoute,'_blank','noopener');else navigate(button.dataset.screenRoute);document.querySelector('#app-shell')?.classList.remove('mobile-open');};
  }});
}
