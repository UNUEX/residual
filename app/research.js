'use strict';
const root = document.querySelector('#root');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString(ResidualI18n.locale(), {maximumFractionDigits:2});
const date = value => {const d = new Date(value); return !value || Number.isNaN(d.getTime()) ? '' : d.toLocaleString(ResidualI18n.locale(), {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});};
const paths = {arrow:'M4 12h16 M14 6l6 6-6 6',plus:'M12 5v14 M5 12h14',check:'M5 12l4 4L19 6',upload:'M12 16V3 M7 8l5-5 5 5 M4 17v4h16v-4',download:'M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4',data:'M4 4h16v16H4z M4 9h16 M9 4v16',history:'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',close:'M6 6l12 12 M18 6L6 18',info:'M12 10v7 M12 7h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',spark:'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',file:'M14 3H5v18h14V8z M14 3v6h5 M8 13h8 M8 17h5',chevron:'M9 5l7 7-7 7'};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.info}"/></svg>`;
const defaultProvider = {provider:'ollama',base_url:'http://127.0.0.1:11434',model:'qwen3:1.7b',allow_external:false};
let state = null;
const ui = {datasetId:'',question:'',plan:null,report:null,chartMetric:'',modal:'',busy:'',error:'',notice:'',probe:null,configDirty:false,config:{...defaultProvider},upload:{label:ResidualI18n.text("__R_u263__"),housing:null,roster:null}};
let metricFallback = {total_area:{label:ResidualI18n.text("__R_u264__"),unit:ResidualI18n.text("__R_u265__")},area_per_person:{label:ResidualI18n.text("__R_u266__"),unit:ResidualI18n.text("__R_u267__")},rooms:{label:ResidualI18n.text("__R_u268__"),unit:ResidualI18n.text("__R_u269__")},persons_per_room:{label:ResidualI18n.text("__R_u270__"),unit:ResidualI18n.text("__R_u271__")},living_share:{label:ResidualI18n.text("__R_u272__"),unit:''}};
let qualityLabels = {housing_rows:ResidualI18n.text("__R_u273__"),roster_rows:ResidualI18n.text("__R_u274__"),roster_households:ResidualI18n.text("__R_u275__"),eligible_households:ResidualI18n.text("__R_u276__"),excluded_households:ResidualI18n.text("__R_u277__"),invalid_numeric_excluded:ResidualI18n.text("__R_u278__"),roster_mismatch_excluded:ResidualI18n.text("__R_u279__"),area_order:ResidualI18n.text("__R_u280__"),unused_roster_households:ResidualI18n.text("D008 __R_u281__")};
const dataset = () => state?.datasets?.find(item => item.id === ui.datasetId);
const metric = id => ui.report?.formulas?.[id] || state?.catalog?.metrics?.[id] || metricFallback[id] || {label:id,unit:''};
const metricName = id => metric(id).label || id;
const metricUnit = id => metric(id).unit || '';
const aggregationName = id => ({median:ResidualI18n.text("__R_u006__"),mean:ResidualI18n.text("__R_u005__")}[id] || id);
const groupingName = id => ({household_size:ResidualI18n.text("__R_u282__"),all:ResidualI18n.text("__R_u283__")}[id] || id);
const list = values => (Array.isArray(values) ? values : values ? [values] : []);

async function api(path, body) {
 const response = await fetch('/api/research/' + path, {method:body === undefined ? 'GET' : 'POST',headers:body === undefined ? {'X-Residual-Language':ResidualI18n.language} : {'Content-Type':'application/json','X-Residual-Language':ResidualI18n.language},body:body === undefined ? undefined : JSON.stringify(body)});
 let result;
 try {result = await response.json();} catch {throw new Error(ResidualI18n.text("__R_u284__"));}
 if (!response.ok || result.error) throw new Error(result.error || result.message || ResidualI18n.html`__R_u020__${response.status}).`);
 return result;
}
async function refresh() {
 state = await api('state');
 if (!state.datasets?.some(item => item.id === ui.datasetId)) ui.datasetId = state.datasets?.[0]?.id || '';
 ui.config = {...defaultProvider,...state.provider};
}
function announce(message) {document.querySelector('#announcer').textContent = message;}
async function action(name, work) {
 if (ui.busy) return;
 ui.busy = name; ui.error = ''; ui.notice = ''; render(); announce(name);
 try {await work();} catch (error) {ui.error = error.message || ResidualI18n.text("__R_u021__");}
 finally {ui.busy = '';render();announce(ui.error || ui.notice || ResidualI18n.text("__R_u022__"));}
}
function disabled(condition = false) {return ui.busy || condition ? 'disabled' : '';}
function sectionHead(index, title, detail, badge = '') {return `<div class="section-head"><span class="step-number">${index}</span><div><h2>${title}</h2>${detail ? `<p>${detail}</p>` : ''}</div>${badge}</div>`;}
function modelStatus() {
 if (ui.probe?.ok) return {text:ResidualI18n.text("__R_u023__"),class:'ready'};
 if (ui.probe) return {text:ResidualI18n.text("__R_u285__"),class:'unavailable'};
 return {text:ResidualI18n.text("__R_u025__"),class:'unknown'};
}
function header() {
 const status = modelStatus();
 return ResidualI18n.html`<header class="header"><a class="brand" href="/" aria-label="Residual, __R_u286__"><img src="/assets/residual-mark.png" width="44" height="44" alt=""><span><strong>residual</strong><small>__R_u027__</small></span></a><nav aria-label="__R_u287__"><span class="nav-current" aria-current="page">__R_u016__</span><a href="/quality/">__R_u288__ ${icon('arrow')}</a></nav><button class="model-trigger" data-action="settings" ${disabled()}><span class="status-dot ${status.class}"></span><span>${esc(state?.provider?.model || defaultProvider.model)}<small>${status.text}</small></span>${icon('settings')}</button></header>`;
}
function sidebar() {
 const reports = list(state.reports);
 const plans = list(state.plans).filter(plan => plan.status === 'ready' && !reports.some(report => report.plan_id === plan.id)).slice(0,5);
 return ResidualI18n.html`<aside class="sidebar"><div class="workspace-label">__R_u292__ <span>01</span></div><div class="intro"><h1>__R_u293__<br>__R_u294__ <em>__R_u295__</em></h1><p>__R_u296__<br>__R_u297__</p></div><button class="btn new-question" data-action="new" ${disabled()}>${icon('plus')}__R_u298__</button><div class="history-heading"><h2>${icon('history')}__R_u299__</h2><span>${number(reports.length)}</span></div><div class="history-list">${reports.length ? reports.map(report => `<button class="history-item ${ui.report?.id === report.id ? 'active' : ''}" data-report="${esc(report.id)}" ${disabled()}><span>${esc(report.question || ResidualI18n.text("__R_u089__"))}</span><small>${esc(date(report.created_at))}</small></button>`).join('') : ResidualI18n.text("<p class=\"muted small empty-history\">__R_u289__</p>")}</div>${plans.length ? ResidualI18n.html`<details class="pending-plans"><summary>__R_u291__ <span>${number(plans.length)}</span></summary>${plans.map(plan => ResidualI18n.html`<button class="history-item" data-plan="${esc(plan.id)}" ${disabled()}><span>${esc(plan.question)}</span><small>__R_u290__</small></button>`).join('')}</details>` : ''}<div class="scope-note"><span class="scope-mark">D006 / D008</span><p>__R_u300__</p><span>__R_u301__</span></div></aside>`;
}
function datasetPanel() {
 const selected = dataset();
 return `<section class="panel dataset-panel" aria-labelledby="dataset-title">${sectionHead('01',ResidualI18n.text("__R_u138__"),ResidualI18n.text("__R_u302__"))}${selected ? ResidualI18n.html`<div class="dataset-selected"><label for="dataset-select" class="field-label" id="dataset-title">__R_u307__</label><select id="dataset-select" ${disabled()}>${state.datasets.map(item => `<option value="${esc(item.id)}" ${item.id === ui.datasetId ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select><div class="dataset-metadata"><span>${icon('data')}${number(selected.quality?.housing_rows)} __R_u308__</span><span>${esc(selected.year)}</span><span>${selected.is_demo ? ResidualI18n.text("__R_u303__") : selected.synthetic_data === true ? ResidualI18n.text("__R_u304__") : ResidualI18n.text("__R_u305__")}</span></div>${selected.is_demo ? ResidualI18n.text("<p class=\"dataset-caution\">__R_u306__</p>") : ''}<div class="dataset-actions"><button class="text-button" data-action="upload" ${disabled()}>${icon('upload')}__R_u309__</button><button class="text-button" data-action="demo" ${disabled()}>__R_u310__</button></div></div>` : ResidualI18n.html`<div class="start-data"><div class="data-symbol" aria-hidden="true">${icon('data')}<span>D006 + D008</span></div><div><h3 id="dataset-title">__R_u311__</h3><p>__R_u312__</p><div class="button-row"><button class="btn primary" data-action="demo" ${disabled()}>__R_u313__ ${icon('arrow')}</button><button class="btn" data-action="upload" ${disabled()}>${icon('upload')}__R_u314__</button></div><small>__R_u315__</small></div></div>`}</section>`;
}
function questionPanel() {
 const examples = list(state.catalog?.examples).length ? state.catalog.examples : [ResidualI18n.text("__R_u316__"),ResidualI18n.text("__R_u317__"),ResidualI18n.text("__R_u318__")];
 return ResidualI18n.html`<section class="panel question-panel ${dataset() ? '' : 'awaiting'}">${sectionHead('02',ResidualI18n.text("__R_u319__"),ResidualI18n.text("__R_u320__"),ResidualI18n.html`<span class="label-pill">${icon('spark')}__R_u321__</span>`)}<form id="question-form"><label for="research-question" class="field-label">__R_u324__</label><textarea id="research-question" rows="3" maxlength="2000" placeholder="__R_u325__" ${disabled(!dataset())}>${esc(ui.question)}</textarea><div class="examples" aria-label="__R_u326__">${examples.map((example,index) => `<button type="button" data-example="${index}" ${disabled(!dataset())}>${esc(typeof example === 'string' ? example : example.question || example.text)}</button>`).join('')}</div><div class="question-footer"><p>${dataset() ? ResidualI18n.text("__R_u322__") : ResidualI18n.text("__R_u323__")}</p><button class="btn primary" type="submit" id="prepare-plan" ${disabled(!dataset() || !ui.question.trim())}>__R_u327__ ${icon('arrow')}</button></div></form>${ui.plan ? planPanel() : ''}</section>`;
}
function planPanel() {
 const p = ui.plan, ready = p.status === 'ready';
 return `<div class="plan-card ${ready ? '' : 'plan-paused'}" id="research-plan" tabindex="-1"><div class="plan-title"><span class="label-pill">${icon(ready ? 'check' : 'info')}${ready ? ResidualI18n.text("__R_u154__") : p.status === 'clarify' ? ResidualI18n.text("__R_u328__") : ResidualI18n.text("__R_u329__")}</span><small>${esc(p.model || state.provider?.model || '')}</small></div><p class="plan-reason">${esc(p.reason || (ready ? ResidualI18n.text("__R_u330__") : ResidualI18n.text("__R_u331__")))}</p>${ready ? ResidualI18n.html`<dl class="plan-fields"><div><dt>__R_u164__</dt><dd>${list(p.metrics).map(id => esc(metricName(id))).join(' · ')}</dd></div><div><dt>__R_u165__</dt><dd>${esc(aggregationName(p.aggregation))}</dd></div><div><dt>__R_u166__</dt><dd>${esc(groupingName(p.grouping))}</dd></div><div><dt>__R_u168__</dt><dd>${esc(p.year)}</dd></div></dl><div class="plan-approval"><p>__R_u332__</p><button class="btn primary" data-action="execute" ${disabled()}>${icon('check')}__R_u163__</button></div>` : ResidualI18n.text("<p class=\"muted small\">__R_u333__</p>")}</div>`;
}
function chartPanel(report) {
 const metrics = list(report.plan?.metrics).length ? report.plan.metrics : Object.keys(report.table?.[0]?.values || {});
 if (!metrics.includes(ui.chartMetric)) ui.chartMetric = metrics[0] || '';
 const rows = list(report.chart).filter(row => row.metric === ui.chartMetric && row.value !== null && Number.isFinite(Number(row.value)));
 if (!rows.length) return ResidualI18n.text("<div class=\"empty-result\">__R_u334__</div>");
 const maximum = Math.max(...rows.map(row => Math.abs(Number(row.value))),1);
 const height = rows.length * 48 + 26;
 return ResidualI18n.html`<div class="chart-heading"><div><h3>${esc(metricName(ui.chartMetric))}</h3><p>${esc(aggregationName(report.plan?.aggregation))}${metricUnit(ui.chartMetric) ? ` · ${esc(metricUnit(ui.chartMetric))}` : ''}</p></div>${metrics.length > 1 ? ResidualI18n.html`<label class="chart-select-label">__R_u335__<select id="chart-metric">${metrics.map(id => `<option value="${esc(id)}" ${id === ui.chartMetric ? 'selected' : ''}>${esc(metricName(id))}</option>`).join('')}</select></label>` : ''}</div><svg class="report-chart" viewBox="0 0 700 ${height}" role="img" aria-label="${esc(metricName(ui.chartMetric))} __R_u336__"><title>${esc(metricName(ui.chartMetric))}</title>${rows.map((row,index) => `<g transform="translate(0 ${index*48+10})"><text class="chart-group" x="0" y="23">${esc(row.group)}</text><rect class="chart-track" x="152" y="5" width="420" height="28" rx="6"/><rect class="chart-bar" x="152" y="5" width="${Math.abs(Number(row.value))/maximum*420}" height="28" rx="6"/><text class="chart-value" x="588" y="24">${number(row.value)}</text></g>`).join('')}</svg>`;
}
function dataTable(rows,metrics,caption) {
 return ResidualI18n.html`<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(caption)}"><table><caption>${esc(caption)}</caption><thead><tr><th scope="col">__R_u189__</th><th scope="col">__R_u337__</th>${metrics.map(id => `<th scope="col">${esc(metricName(id))}${metricUnit(id) ? `<small>${esc(metricUnit(id))}</small>` : ''}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${esc(row.group)}</th><td>${number(row.households)}</td>${metrics.map(id => `<td>${number(row.values?.[id])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function reportPanel() {
 const r = ui.report;
 if (!r) return '';
 const metrics = list(r.plan?.metrics).length ? r.plan.metrics : Object.keys(r.table?.[0]?.values || {});
 const quality = r.quality || {}, sensitivity = r.sensitivity || {};
 return ResidualI18n.html`<section class="panel report-panel" id="research-report" tabindex="-1">${sectionHead('03',ResidualI18n.text("__R_u338__"),ResidualI18n.text("__R_u339__"),ResidualI18n.html`<span class="label-pill">${icon('check')}__R_u340__</span>`)}<div class="report-intro"><h3>${esc(r.question || r.plan?.question)}</h3><p>${esc(r.dataset?.label || '')} · ${esc(r.plan?.year || r.dataset?.year || '')} · ${esc(aggregationName(r.plan?.aggregation))}</p></div>${r.dataset?.is_demo ? ResidualI18n.text("<div class=\"inline-notice\">__R_u341__</div>") : ''}<div class="report-summary">${list(r.summary).map(text => `<p>${esc(text)}</p>`).join('')}</div><div class="chart-block">${chartPanel(r)}</div>${dataTable(list(r.table),metrics,ResidualI18n.text("__R_u342__"))}<div class="report-support"><details open><summary>__R_u348__</summary><dl class="quality-grid">${Object.entries(quality).filter(([key,value]) => key in qualityLabels && typeof value === 'number').map(([key,value]) => `<div><dt>${esc(qualityLabels[key])}</dt><dd>${number(value)}</dd></div>`).join('')}</dl><p class="muted small">__R_u349__</p></details>${sensitivity.table ? ResidualI18n.html`<details><summary>__R_u344__ <span>${number(sensitivity.excluded_area_order)} __R_u345__</span></summary><p>${esc(sensitivity.description || '')}</p>${dataTable(list(sensitivity.table),metrics,ResidualI18n.text("__R_u343__"))}</details>` : ''}<details><summary>__R_u350__</summary><dl class="formula-list">${metrics.map(id => `<div><dt>${esc(metricName(id))}</dt><dd><code>${esc(r.formulas?.[id]?.formula || metric(id).formula || '')}</code></dd></div>`).join('')}</dl>${list(r.sources).map(source => `<div class="source-item"><strong>${esc(source.form || source.title || ResidualI18n.text("__R_u346__"))}</strong><span>${esc(source.file || '')}</span>${source.sha256 ? `<code>SHA-256 ${esc(source.sha256)}</code>` : ''}</div>`).join('')}<p class="muted small">__R_u351__ ${esc(r.dataset?.id || r.plan?.dataset_id || '')}<br>__R_u352__ ${esc(r.plan?.id || '')}<br>__R_u205__ ${esc(r.plan?.model || '')}</p></details><details open><summary>__R_u353__</summary><ul class="limitations">${list(r.limitations).map(text => `<li>${esc(text)}</li>`).join('')}</ul></details></div><div class="export-bar"><span>${icon('download')}__R_u354__</span><div>${[['csv',ResidualI18n.text("__R_u194__")],['html',ResidualI18n.text("__R_u347__")],['json',ResidualI18n.text("__R_u197__")],['python',ResidualI18n.text("__R_u195__")]].map(([format,label]) => `<a class="btn small-btn" href="/api/research/export?id=${encodeURIComponent(r.id)}&format=${format}" download>${label}</a>`).join('')}</div></div></section>`;
}
function settingsModal() {
 const p = ui.config, status = modelStatus();
 return ResidualI18n.html`<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="modal-head"><div><span class="eyebrow">__R_u225__</span><h2 id="settings-title">__R_u226__</h2><p>__R_u363__</p></div><button class="icon-button" data-action="close" aria-label="__R_u364__" ${disabled()}>${icon('close')}</button></div><div class="modal-body"><div class="connection-status ${status.class}" role="status"><span class="status-dot ${status.class}"></span><div><strong>${status.text}</strong><p>${esc(ui.probe?.message || ResidualI18n.text("__R_u355__"))}</p></div></div><form id="provider-form"><label class="field-label" for="provider-kind">__R_u228__</label><select id="provider-kind" ${disabled()}><option value="ollama" ${p.provider === 'ollama' ? 'selected' : ''}>Ollama · __R_u229__</option><option value="openai_compatible" ${p.provider === 'openai_compatible' ? 'selected' : ''}>__R_u230__</option></select>${p.provider === 'ollama' ? ResidualI18n.text("<div class=\"setup-note\"><strong>__R_u356__</strong><p>__R_u357__ <code>setup_local_ai.cmd</code> __R_u358__</p></div>") : ''}<label class="field-label" for="provider-url">__R_u232__</label><input id="provider-url" type="url" value="${esc(p.base_url)}" required ${disabled()}><label class="field-label" for="provider-model">__R_u233__</label><input id="provider-model" value="${esc(p.model)}" maxlength="200" required ${disabled()}>${p.provider === 'openai_compatible' ? ResidualI18n.html`<label class="field-label" for="provider-key">__R_u221__</label><input id="provider-key" type="password" autocomplete="new-password" placeholder="${p.api_key_set ? ResidualI18n.text("__R_u219__") : ResidualI18n.text("__R_u220__")}" maxlength="4096" ${disabled()}><p class="field-hint">__R_u359__</p><label class="checkbox-label"><input id="allow-external" type="checkbox" ${p.allow_external ? 'checked' : ''} ${disabled()}>__R_u360__</label>` : ''}<p class="privacy-note">${esc(state.provider?.data_policy || ResidualI18n.text("__R_u361__"))}</p><div class="button-row settings-actions"><button class="btn primary" type="submit" ${disabled()}>__R_u235__</button><button class="btn" type="button" data-action="probe" ${disabled(ui.configDirty)}>__R_u236__</button></div></form>${ui.probe?.models?.length ? ResidualI18n.html`<details class="models-list"><summary>__R_u362__ ${number(ui.probe.models.length)}</summary><p>${ui.probe.models.map(name => esc(name)).join('<br>')}</p></details>` : ''}${ui.error ? `<div class="error-banner" role="alert">${icon('info')}<span>${esc(ui.error)}</span></div>` : ''}${ui.busy ? `<p class="busy-inline" role="status"><span class="spinner"></span>${esc(ui.busy)}</p>` : ''}</div></section></div>`;
}
function uploadModal() {
 const form = ui.upload;
 return ResidualI18n.html`<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="upload-title"><div class="modal-head"><div><span class="eyebrow">__R_u368__</span><h2 id="upload-title">__R_u138__</h2><p>D006 __R_u369__</p></div><button class="icon-button" data-action="close" aria-label="__R_u370__" ${disabled()}>${icon('close')}</button></div><form id="upload-form" class="modal-body"><label class="field-label" for="dataset-label">__R_u371__</label><input id="dataset-label" value="${esc(form.label)}" maxlength="120" required ${disabled()}>${[['housing',ResidualI18n.text("D006 · __R_u365__"),'NOMER, OB_PL, J_PL, KOL_K'],['roster',ResidualI18n.text("D008 · __R_u366__"),'NOMER, NOMP, KOL_CHL']].map(([key,title,fields]) => `<label class="file-zone ${form[key] ? 'selected' : ''}">${icon(form[key] ? 'check' : 'upload')}<span><strong>${title}</strong><small>${form[key] ? ResidualI18n.html`${esc(form[key].name)} · ${number(form[key].size/1024)} __R_u367__` : fields}</small></span><input type="file" id="file-${key}" accept=".csv,text/csv" aria-label="${title}" ${disabled()}></label>`).join('')}<p class="field-hint">CSV · __R_u372__</p><button class="btn primary full-width" type="submit" ${disabled(!form.housing || !form.roster)}>__R_u373__ ${icon('arrow')}</button>${ui.error ? `<div class="error-banner" role="alert">${icon('info')}<span>${esc(ui.error)}</span></div>` : ''}${ui.busy ? `<p class="busy-inline" role="status"><span class="spinner"></span>${esc(ui.busy)}</p>` : ''}</form></section></div>`;
}
function render() {
 if (!state) {root.innerHTML = `<div class="boot"><img src="/assets/residual-mark.png" alt="Residual" width="64" height="64"><p>${esc(ui.error || ResidualI18n.text("__R_u237__"))}</p>${ui.error ? ResidualI18n.text("<button class=\"btn\" data-action=\"retry\">__R_u238__</button>") : '<span class="spinner"></span>'}</div>`;return;}
 root.innerHTML = ResidualI18n.html`<div class="app">${header()}<div class="workspace">${sidebar()}<main class="content" id="main-content"><div class="content-heading"><span class="eyebrow">__R_u375__</span><span class="local-label">${icon('data')}__R_u242__</span></div>${ui.error && !ui.modal ? `<div class="error-banner" role="alert">${icon('info')}<span>${esc(ui.error)}</span></div>` : ''}${ui.notice ? `<div class="notice-banner" role="status">${icon('check')}<span>${esc(ui.notice)}</span></div>` : ''}${ui.busy && !ui.modal ? `<div class="busy-banner" role="status"><span class="spinner"></span><div><strong>${esc(ui.busy)}</strong><p>${ui.busy.includes(ResidualI18n.text("__R_u239__")) ? ResidualI18n.text("__R_u374__") : ResidualI18n.text("__R_u241__")}</p></div></div>` : ''}${datasetPanel()}${questionPanel()}${reportPanel()}<footer class="footer"><span>residual © 2026</span><span>__R_u376__</span></footer></main></div></div>${ui.modal === 'settings' ? settingsModal() : ui.modal === 'upload' ? uploadModal() : ''}`;
}
function resetResearch(clearQuestion = false) {ui.plan = null; ui.report = null; ui.chartMetric = '';if (clearQuestion) ui.question = '';ui.error = '';ui.notice = '';}
async function demo() {await action(ResidualI18n.text("__R_u377__"),async () => {const result = await api('demo',{});const selected = result.dataset || result;await refresh();ui.datasetId = selected.id;resetResearch(true);ui.modal = '';ui.notice = ResidualI18n.text("__R_u378__");});}
async function prepare(event) {
 event.preventDefault();if (!dataset() || !ui.question.trim()) return;
 await action(ResidualI18n.text("__R_u379__"),async () => {ui.report = null;ui.plan = null;const result = await api('plan',{dataset_id:ui.datasetId,question:ui.question.trim()});ui.plan = result.plan || result;ui.probe = {ok:true,message:ResidualI18n.text("__R_u380__"),selected_model:ui.plan.model};await refresh();});
 document.querySelector('#research-plan')?.focus({preventScroll:true});
}
async function execute() {
 if (ui.plan?.status !== 'ready') return;
 await action(ResidualI18n.text("__R_u381__"),async () => {const result = await api('execute',{plan_id:ui.plan.id});ui.report = result.report || result;ui.chartMetric = '';await refresh();ui.notice = ResidualI18n.text("__R_u382__");});
 if (ui.report) document.querySelector('#research-report')?.scrollIntoView({behavior:'smooth',block:'start'});
}
async function configure(event) {
 event.preventDefault();
 const secret = document.querySelector('#provider-key');
 const body = {provider:ui.config.provider,base_url:document.querySelector('#provider-url').value.trim(),model:document.querySelector('#provider-model').value.trim(),allow_external:ui.config.provider === 'openai_compatible' && Boolean(document.querySelector('#allow-external')?.checked)};
 if (secret?.value) body.api_key = secret.value;
 if (secret) secret.value = '';
 await action(ResidualI18n.text("__R_u256__"),async () => {await api('configure',body);ui.probe = null;ui.configDirty = false;await refresh();ui.notice = ResidualI18n.text("__R_u383__");});
}
async function upload(event) {
 event.preventDefault();const form = ui.upload;
 if (!form.housing || !form.roster) return;
 if (form.housing.size+form.roster.size > 16*1024*1024) {ui.error = ResidualI18n.text("__R_u384__");render();return;}
 await action(ResidualI18n.text("__R_u385__"),async () => {const [housing_csv,roster_csv] = await Promise.all([form.housing.text(),form.roster.text()]);const result = await api('upload',{label:form.label.trim(),housing_csv,roster_csv,year:2024});await refresh();ui.datasetId = (result.dataset || result).id;resetResearch(true);ui.modal = '';ui.notice = ResidualI18n.text("__R_u386__");});
}
root.addEventListener('click',async event => {
 const button = event.target.closest('button');if (!button || button.disabled) return;
 if (button.dataset.example !== undefined) {const examples = list(state.catalog?.examples).length ? state.catalog.examples : [ResidualI18n.text("__R_u316__"),ResidualI18n.text("__R_u317__"),ResidualI18n.text("__R_u318__")];const example = examples[Number(button.dataset.example)];ui.question = typeof example === 'string' ? example : example.question || example.text;resetResearch();render();document.querySelector('#research-question')?.focus();return;}
 if (button.dataset.report) {await action(ResidualI18n.text("__R_u387__"),async () => {const result = await api('report?id='+encodeURIComponent(button.dataset.report));ui.report = result.report || result;ui.plan = ui.report.plan;ui.datasetId = ui.plan.dataset_id || ui.report.dataset?.id;ui.question = ui.report.question || ui.plan.question;ui.chartMetric = '';});return;}
 if (button.dataset.plan) {ui.plan = state.plans.find(plan => plan.id === button.dataset.plan);ui.datasetId = ui.plan.dataset_id;ui.question = ui.plan.question;ui.report = null;ui.error = '';render();return;}
 switch (button.dataset.action) {
  case 'settings':ui.modal = 'settings';ui.error = '';ui.config = {...defaultProvider,...state.provider};ui.configDirty = false;render();document.querySelector('#provider-kind')?.focus();break;
  case 'close':ui.modal = '';ui.error = '';render();break;
  case 'upload':ui.modal = 'upload';ui.error = '';render();document.querySelector('#dataset-label')?.focus();break;
  case 'demo':await demo();break;
  case 'execute':await execute();break;
  case 'new':resetResearch(true);render();document.querySelector('#research-question')?.focus();break;
  case 'probe':await action(ResidualI18n.text("__R_u261__"),async () => {try {ui.probe = await api('probe',{});} catch(error) {ui.probe = {ok:false,message:error.message};throw error;}});break;
  case 'retry':await action(ResidualI18n.text("__R_u262__"),async () => {await refresh();});break;
 }
});
root.addEventListener('input',event => {
 const {id,value} = event.target;
 if (id === 'research-question') {ui.question = value;const button = document.querySelector('#prepare-plan');if (button) button.disabled = Boolean(ui.busy || !dataset() || !value.trim());if (ui.plan) {ui.plan = null;ui.report = null;document.querySelector('#research-plan')?.remove();document.querySelector('#research-report')?.remove();}}
 if (id === 'dataset-label') ui.upload.label = value;
 if (id === 'provider-url') ui.config.base_url = value;
 if (id === 'provider-model') ui.config.model = value;
 if (['provider-url','provider-model','provider-key'].includes(id)) {ui.configDirty = true;const probe = document.querySelector('[data-action="probe"]');if(probe) probe.disabled = true;}
});
root.addEventListener('change',event => {
 const {id,value} = event.target;
 if (id === 'dataset-select') {ui.datasetId = value;resetResearch();render();}
 if (id === 'chart-metric') {ui.chartMetric = value;render();}
 if (id === 'provider-kind') {ui.configDirty = true;ui.config.provider = value;ui.config.allow_external = false;if (value === 'ollama') {ui.config.base_url = defaultProvider.base_url;ui.config.model = defaultProvider.model;} else {ui.config.base_url = '';ui.config.model = '';}render();}
 if (id === 'allow-external') {ui.config.allow_external = event.target.checked;ui.configDirty = true;const probe = document.querySelector('[data-action="probe"]');if(probe) probe.disabled = true;}
 if (id === 'file-housing' || id === 'file-roster') {ui.upload[id === 'file-housing' ? 'housing' : 'roster'] = event.target.files[0] || null;ui.error = '';render();}
});
root.addEventListener('submit',event => {if (event.target.id === 'question-form') prepare(event);if (event.target.id === 'provider-form') configure(event);if (event.target.id === 'upload-form') upload(event);});
document.addEventListener('keydown',event => {
 if (event.key === 'Escape' && ui.modal && !ui.busy) {ui.modal = '';ui.error = '';render();}
 if (event.key === 'Tab' && ui.modal) {const focusable = [...document.querySelectorAll('[role="dialog"] button:not([disabled]),[role="dialog"] input:not([disabled]),[role="dialog"] select:not([disabled]),[role="dialog"] summary')];if (!focusable.length) {event.preventDefault();return;}const first = focusable[0],last = focusable[focusable.length-1];if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();} else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}}
});
refresh().then(render).catch(error => {ui.error = error.message;render();});

window.addEventListener("residual:language", () => {
metricFallback = {total_area:{label:ResidualI18n.text("__R_u264__"),unit:ResidualI18n.text("__R_u265__")},area_per_person:{label:ResidualI18n.text("__R_u266__"),unit:ResidualI18n.text("__R_u267__")},rooms:{label:ResidualI18n.text("__R_u268__"),unit:ResidualI18n.text("__R_u269__")},persons_per_room:{label:ResidualI18n.text("__R_u270__"),unit:ResidualI18n.text("__R_u271__")},living_share:{label:ResidualI18n.text("__R_u272__"),unit:''}};
qualityLabels = {housing_rows:ResidualI18n.text("__R_u273__"),roster_rows:ResidualI18n.text("__R_u274__"),roster_households:ResidualI18n.text("__R_u275__"),eligible_households:ResidualI18n.text("__R_u276__"),excluded_households:ResidualI18n.text("__R_u277__"),invalid_numeric_excluded:ResidualI18n.text("__R_u278__"),roster_mismatch_excluded:ResidualI18n.text("__R_u279__"),area_order:ResidualI18n.text("__R_u280__"),unused_roster_households:ResidualI18n.text("D008 __R_u281__")};
ui.error='';ui.notice='';render();
});
