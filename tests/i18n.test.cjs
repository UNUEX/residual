const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const languages=['en','kk','ko','zh-CN'];
const catalogues=Object.fromEntries(languages.map(lang=>[lang,JSON.parse(fs.readFileSync(path.join(base,'app/locales',lang+'.json'),'utf8'))]));

function runtime(saved){
 const listeners=new Map(),stored=new Map(saved?[['residual-language',saved]]:[]);
 const root={innerHTML:'',addEventListener(){}};
 const document={documentElement:{lang:''},cookie:'',title:'',getElementById:id=>id==='root'?root:null,
  querySelector:selector=>selector==='#root'?root:selector==='#announcer'?{textContent:''}:null};
 const context=vm.createContext({document,RESIDUAL_LOCALES:catalogues,Intl,console,
  localStorage:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)},
  MutationObserver:class{observe(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
  dispatchEvent:event=>{for(const fn of listeners.get(event.type)||[])fn(event);},
  location:{hash:''},history:{pushState(){}},fetch:async()=>({ok:true,json:async()=>({datasets:[],reports:[],provider:{model:'qwen3:1.7b'}})}),
  setTimeout,clearTimeout,File:class{},scrollTo(){}});
 context.window=context;
 vm.runInContext(fs.readFileSync(path.join(base,'app/i18n.js'),'utf8'),context);
 return {context,stored,root};
}

test('all four catalogues have identical nonempty keys and valid markers',()=>{
 const keys=Object.keys(catalogues.en).sort();
 for(const lang of languages){assert.deepEqual(Object.keys(catalogues[lang]).sort(),keys);for(const value of Object.values(catalogues[lang]))assert.equal(typeof value,'string');}
 for(const name of ['tables.js','research.js','app.js'])for(const match of fs.readFileSync(path.join(base,'app',name),'utf8').matchAll(/__R_([a-zA-Z0-9_]+)__/g))assert.ok(keys.includes(match[1]),match[1]);
});
test('English is the default and Russian is not an available language',()=>{
 for(const saved of [undefined,'ru','unsupported']){const {context}=runtime(saved);assert.equal(context.ResidualI18n.language,'en');assert.equal(context.document.documentElement.lang,'en');assert.deepEqual(Object.keys(context.ResidualI18n.languages),languages);}
});
test('only static message markers are translated; inserted user text is preserved',()=>{
 const {context}=runtime();
 for(const lang of languages){context.ResidualI18n.setLanguage(lang);const text='Home Қазақша 한국어 中文 Русский <unchanged>';
  const result=context.ResidualI18n.html(['<b>__R_u014__</b>',''],text);
  assert.equal(result,'<b>'+catalogues[lang].u014+'</b>'+text);
 }
});
test('the primary interface renders in all languages without clearing a user question',async()=>{
 const {context,root,stored}=runtime();
 vm.runInContext(fs.readFileSync(path.join(base,'app/tables.js'),'utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 vm.runInContext('ui.question="Home Қазақша 한국어 中文 Русский";',context);
 for(const lang of languages){context.ResidualI18n.setLanguage(lang);vm.runInContext('render()',context);assert.ok(root.innerHTML.includes(catalogues[lang].u034));assert.ok(!root.innerHTML.includes('__R_'));assert.equal(vm.runInContext('ui.question',context),'Home Қазақша 한국어 中文 Русский');}
 assert.deepEqual([...stored.keys()],['residual-language']);
});
test('example questions use localized operations and preserve actual column labels',async()=>{
 const {context}=runtime();vm.runInContext(fs.readFileSync(path.join(base,'app/tables.js'),'utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 vm.runInContext('state.datasets=[{id:"sample",columns:[{id:"c0",label:"Home",role:"number"},{id:"c1",label:"Русский 中文",role:"category"}]}];ui.datasetId="sample";',context);
 for(const lang of languages){context.ResidualI18n.setLanguage(lang);const questions=vm.runInContext('examples()',context);assert.equal(questions.length,2);assert.ok(questions.every(q=>q.includes('«Home»')));assert.ok(questions[1].includes('«Русский 中文»'));}
});
