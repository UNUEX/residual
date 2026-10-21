'use strict';

// Only application-owned message markers are translated. Interpolated values
// (questions, cells, column names and comments) are never searched or rewritten.
window.ResidualI18n = (() => {
 const languages = Object.freeze({en:'English',kk:'Қазақша',ko:'한국어','zh-CN':'简体中文'});
 const locales = Object.freeze({en:'en-US',kk:'kk-KZ',ko:'ko-KR','zh-CN':'zh-CN'});
 const catalogue = window.RESIDUAL_LOCALES;
 let language = 'en';
 try {const saved = localStorage.getItem('residual-language');if (Object.hasOwn(languages,saved)) language = saved;} catch {}
 const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function t(key, parameters={}) {
  const template = catalogue[language]?.[key] ?? catalogue.en[key];
  if (typeof template !== 'string') throw new Error('Unknown interface message: '+key);
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(_,name)=>Object.hasOwn(parameters,name)?String(parameters[name]):'{'+name+'}');
 }
 function expand(value,html=false) {return String(value).replace(/__R_([a-zA-Z0-9_]+)__/g,(_,key)=>html?escape(t(key)):t(key));}
 function html(strings,...values) {
  return strings.reduce((result,part,index)=>result+expand(part,true)+(index<values.length?String(values[index]):''),'');
 }
 function text(value) {return expand(value,/<[a-zA-Z/!]/.test(value));}
 function syncDocument() {
  document.documentElement.lang = language;
  document.title = t('app_title');
  document.cookie = 'residual_language='+encodeURIComponent(language)+'; Path=/; SameSite=Strict';
 }
 function setLanguage(next) {
  if (!Object.hasOwn(languages,next) || next===language) return;
  const previous=language;
  const secret=document.querySelector('input[type="password"]');
  const secretId=secret?.id, secretValue=secret?.value;
  language=next;
  try {localStorage.setItem('residual-language',language);} catch {}
  syncDocument();
  window.dispatchEvent(new CustomEvent('residual:language',{detail:{previous,language}}));
  if(secretId&&secretValue){const current=document.getElementById(secretId);if(current)current.value=secretValue;}
  mount();
  document.getElementById('residual-language')?.focus({preventScroll:true});
 }
 function mount() {
  const header=document.querySelector('.header,.topbar');
  if(!header||document.getElementById('residual-language'))return;
  const wrapper=document.createElement('label');wrapper.className='language-switcher';
  const caption=document.createElement('span');caption.textContent=t('language');
  const select=document.createElement('select');select.id='residual-language';select.setAttribute('aria-label',t('language'));
  for(const [code,name]of Object.entries(languages)){const option=document.createElement('option');option.value=code;option.textContent=name;option.selected=code===language;select.append(option);}
  select.addEventListener('change',()=>setLanguage(select.value));
  wrapper.append(caption,select);
  header.insertBefore(wrapper,header.querySelector('.model-trigger')||null);
 }
 syncDocument();
 new MutationObserver(mount).observe(document.getElementById('root'),{childList:true,subtree:true});
 return Object.freeze({t,text,html,mount,setLanguage,languages,locale:()=>locales[language],get language(){return language;}});
})();
