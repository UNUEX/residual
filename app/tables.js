'use strict';

const root = document.querySelector('#root');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const list = value => Array.isArray(value) ? value : value ? [value] : [];
const number = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString(ResidualI18n.locale(),{maximumFractionDigits:2});
const date = value => {const parsed = new Date(value);return !value || Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString(ResidualI18n.locale(),{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});};
const paths = {home:'M3 11l9-8 9 8 M5 10v11h5v-7h4v7h5V10',arrow:'M4 12h16 M14 6l6 6-6 6',plus:'M12 5v14 M5 12h14',check:'M5 12l4 4L19 6',upload:'M12 16V3 M7 8l5-5 5 5 M4 17v4h16v-4',download:'M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4',data:'M4 4h16v16H4z M4 9h16 M9 4v16',history:'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',close:'M6 6l12 12 M18 6L6 18',info:'M12 10v7 M12 7h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',spark:'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',file:'M14 3H5v18h14V8z M14 3v6h5 M8 13h8 M8 17h5'};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.info}"/></svg>`;
const defaults = {provider:'ollama',base_url:'http://127.0.0.1:11434',model:'qwen3:1.7b',allow_external:false};
let roles = {number:ResidualI18n.text("__R_u001__"),category:ResidualI18n.text("__R_u002__"),identifier:ResidualI18n.text("__R_u003__"),ignore:ResidualI18n.text("__R_u004__")};
const aggregation = value => ({mean:ResidualI18n.text("__R_u005__"),median:ResidualI18n.text("__R_u006__"),sum:ResidualI18n.text("__R_u007__")}[value] || value);
const formulaDescription = value => ({mean:ResidualI18n.text("__R_u008__"),median:ResidualI18n.text("__R_u009__"),sum:ResidualI18n.text("__R_u010__")}[value] || ResidualI18n.text("__R_u011__")) + ResidualI18n.text(" __R_u012__");
const humanText = text => esc(String(text).replaceAll('valid_counts',ResidualI18n.text("__R_u013__")));
let state = null;
let views = {home:ResidualI18n.text("__R_u014__"),data:ResidualI18n.text("__R_u015__"),analysis:ResidualI18n.text("__R_u016__"),reports:ResidualI18n.text("__R_u017__"),model:ResidualI18n.text("__R_u018__")};
const initialView = () => Object.hasOwn(views,location.hash.slice(1)) ? location.hash.slice(1) : 'home';
const ui = {view:initialView(),datasetId:'',resumeDatasetId:'',question:'',plan:null,report:null,savedReport:null,showReportList:false,chartMetric:'',busy:'',error:'',notice:'',probe:null,config:{...defaults},configDirty:false,importing:false,inspection:null,tableId:'',headerRow:1,preview:null,passport:null,confirmed:false};
const dataset = () => list(state?.datasets).find(item => item.id === ui.datasetId);
const disabled = condition => ui.busy || condition ? 'disabled' : '';
const currentReport = () => ui.view === 'reports' ? ui.savedReport || ui.report : ui.report;
const metricInfo = id => currentReport()?.formulas?.[id] || list(currentReport()?.plan?.metric_details || ui.plan?.metric_details).find(item => item.id === id) || list(currentReport()?.dataset?.columns || dataset()?.columns).find(item => item.id === id) || {id,label:id,unit:''};

async function api(path,body,section='tables') {
 const response = await fetch(`/api/${section}/${path}`,{method:body === undefined ? 'GET' : 'POST',headers:body === undefined ? {'X-Residual-Language':ResidualI18n.language} : {'Content-Type':'application/json','X-Residual-Language':ResidualI18n.language},body:body === undefined ? undefined : JSON.stringify(body)});
 let result;
 try {result = await response.json();} catch {throw new Error(ResidualI18n.text("__R_u019__"));}
 if (!response.ok || result.error) throw new Error(result.error || result.message || ResidualI18n.html`__R_u020__${response.status}).`);
 return result;
}
async function refresh() {
 state = await api('state');
 if (ui.datasetId && !list(state.datasets).some(item => item.id === ui.datasetId)) ui.datasetId = '';
 if (ui.resumeDatasetId && !list(state.datasets).some(item => item.id === ui.resumeDatasetId)) ui.resumeDatasetId = '';
 if (!ui.configDirty) ui.config = {...defaults,...state.provider};
}
function announce(text) {document.querySelector('#announcer').textContent = text;}
async function action(text,work) {
 if (ui.busy) return;
 ui.busy = text;ui.error = '';ui.notice = '';render();announce(text);
 try {await work();} catch(error) {ui.error = error.message || ResidualI18n.text("__R_u021__");}
 finally {ui.busy = '';render();announce(ui.error || ui.notice || ResidualI18n.text("__R_u022__"));}
}
function resetResult(clearQuestion=false) {ui.plan = null;ui.report = null;ui.chartMetric = '';ui.error = '';ui.notice = '';if (clearQuestion) ui.question = '';}
function modelStatus() {return ui.probe?.ok ? {text:ResidualI18n.text("__R_u023__"),kind:'ready'} : ui.probe ? {text:ResidualI18n.text("__R_u024__"),kind:'unavailable'} : {text:ResidualI18n.text("__R_u025__"),kind:''};}
function heading(step,title,text) {return `<div class="section-head"><span class="step-number">${step}</span><div><h2>${title}</h2><p>${text}</p></div></div>`;}
function warnings(values) {const items = list(values).filter(Boolean);return items.length ? `<ul class="warnings-list">${items.map(value => `<li>${esc(value)}</li>`).join('')}</ul>` : '';}

function goTo(view,updateHistory=true) {
 if (!Object.hasOwn(views,view)) return;
 ui.view = view;ui.error = '';ui.notice = '';
 if (updateHistory && location.hash !== '#'+view) history.pushState(null,'','#'+view);
 render();document.querySelector('#main-content')?.focus({preventScroll:true});window.scrollTo({top:0});
}
function setView(view) {
 ui.view = view;
 if (location.hash !== '#'+view) history.pushState(null,'','#'+view);
}
function header() {
 const status = modelStatus();
 return ResidualI18n.html`<header class="header"><a class="brand" href="#home" aria-label="Residual — __R_u026__"><img src="/assets/residual-mark.png" width="40" height="40" alt=""><span><strong>residual</strong><small>__R_u027__</small></span></a><span class="header-location">__R_u028__</span><button class="model-trigger" data-view="model" ${disabled()}><span class="status-dot ${status.kind}"></span><span>${esc(state.provider?.model || defaults.model)}<small>${status.text}</small></span>${icon('settings')}</button></header>`;
}
function navigation() {
 const icons = {home:'home',data:'data',analysis:'spark',reports:'file',model:'settings'};
 return ResidualI18n.html`<aside class="studio-dock"><a class="dock-brand" href="#home" aria-label="Residual — __R_u026__"><img src="/assets/residual-mark.png" alt="" width="38" height="38"></a><nav aria-label="__R_u029__">${Object.entries(views).map(([view,label]) => `<button class="dock-tab ${ui.view === view ? 'active' : ''}" data-view="${view}" ${ui.view === view ? 'aria-current="page"' : ''} ${disabled()}>${icon(icons[view])}<span>${label}</span></button>`).join('')}</nav><div class="dock-bottom">R / 01</div></aside>`;
}
function homePage() {
 const tables = list(state.datasets).length,reports = list(state.reports).length;
 return ResidualI18n.html`<section class="home-hero" aria-labelledby="home-title"><div class="home-copy"><span class="eyebrow">__R_u033__</span><h1 id="home-title">__R_u034__<br><em>__R_u035__</em></h1><p>__R_u036__</p><div class="hero-actions"><button class="btn primary" data-action="begin" ${disabled()}>__R_u037__ ${icon('arrow')}</button><button class="text-button" data-action="example-excel" ${disabled()}>__R_u038__ ${icon('arrow')}</button></div><span class="hero-footnote">__R_u039__</span></div><div class="home-art" aria-hidden="true"><span class="orbit-label">RESIDUAL / DATA TO INSIGHT</span><div class="orbit-ring ring-one"></div><div class="orbit-ring ring-two"></div><div class="hero-mark"><img src="/assets/residual-mark.png" alt="" width="250" height="250"></div><span class="orbit-point"></span></div></section><section class="home-shortcuts" aria-label="__R_u040__"><button class="shortcut-card" data-view="data" ${disabled()}><span class="shortcut-icon">${icon('data')}</span><div><small>__R_u041__</small><strong>__R_u042__</strong><span>${tables ? ResidualI18n.html`__R_u030__ ${number(tables)}` : ResidualI18n.text("__R_u031__")}</span></div><span class="shortcut-arrow">${icon('arrow')}</span></button><button class="shortcut-card" data-view="reports" ${disabled()}><span class="shortcut-icon">${icon('file')}</span><div><small>__R_u043__</small><strong>__R_u044__</strong><span>${reports ? ResidualI18n.html`__R_u030__ ${number(reports)}` : ResidualI18n.text("__R_u032__")}</span></div><span class="shortcut-arrow">${icon('arrow')}</span></button></section>`;
}
function viewHeading(kicker,title,text,extra='') {
 return `<div class="view-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${text}</p></div>${extra}</div>`;
}
function emptyView(symbol,title,text,button,view) {
 return `<section class="panel empty-view">${icon(symbol)}<h2>${title}</h2><p>${text}</p><button class="btn primary" data-view="${view}" ${disabled()}>${button} ${icon('arrow')}</button></section>`;
}
function connectionPanel() {
 if (ui.probe?.ok) return '';
 return ResidualI18n.html`<div class="connection-hint">${icon('info')}<span>${ui.probe ? ResidualI18n.text("__R_u045__") : ResidualI18n.text("__R_u046__")}</span><button class="text-button" data-view="model" ${disabled()}>__R_u047__</button></div>`;
}
function savedDatasetChoice() {
 const saved = list(state.datasets);
 if (!saved.length) return '';
 return ResidualI18n.html`<div class="saved-dataset-choice"><label class="field-label" for="saved-dataset-select">__R_u050__<select id="saved-dataset-select" ${disabled()}><option value="">__R_u051__</option>${saved.map(item => ResidualI18n.html`<option value="${esc(item.id)}" ${item.id === ui.resumeDatasetId ? 'selected' : ''}>${esc(item.label)}${item.synthetic_data ? ResidualI18n.text(" · __R_u048__") : ''} · ${number(item.row_count)} __R_u049__</option>`).join('')}</select></label><button class="btn" data-action="resume-dataset" ${disabled(!ui.resumeDatasetId)}>__R_u052__ ${icon('arrow')}</button></div>`;
}
function syntheticBadge(value) {return value ? ResidualI18n.text("<span class=\"sample-data-badge\">__R_u053__</span>") : '';}
function startPanel() {
 return ResidualI18n.html`${savedDatasetChoice()}<div class="import-start"><label class="upload-tile">${icon('upload')}<strong>__R_u054__</strong><span>CSV · TSV · Excel · HTML</span><span>__R_u055__</span><input id="table-file" type="file" accept=".csv,.tsv,.xlsx,.xls,.html,.htm" aria-label="__R_u054__" ${disabled()}></label><div class="sample-tile"><span class="sample-label">__R_u056__</span><h3>__R_u057__</h3><p>__R_u058__</p><button class="btn" data-action="example-excel" ${disabled()}>__R_u059__ ${icon('arrow')}</button><div class="sample-links"><a href="/examples/import/schools.xlsx" download>__R_u060__</a><a href="/examples/import/budget.html" download>__R_u061__</a></div></div></div><details class="scope-help"><summary>__R_u062__</summary><p>__R_u063__</p><p>__R_u064__</p><p>__R_u065__</p></details>`;
}
function dataPage() {
 return ResidualI18n.html`${viewHeading(ResidualI18n.text("01 / __R_u066__"),ResidualI18n.text("__R_u015__"),ResidualI18n.text("__R_u067__"))}<div class="data-page">${datasetPanel()}${dataset() && !ui.importing ? ResidualI18n.html`<div class="dataset-continue"><button class="btn primary" data-view="analysis" ${disabled()}>__R_u052__ ${icon('arrow')}</button></div>` : ''}<a class="archive-link" href="/housing/">__R_u068__ ${icon('arrow')}</a></div>`;
}
function analysisPage() {
 const selected = dataset();
 const title = viewHeading(ResidualI18n.text("02 / __R_u069__"),ResidualI18n.text("__R_u016__"),ResidualI18n.text("__R_u070__"));
 if (ui.importing) return title + emptyView('data',ResidualI18n.text("__R_u071__"),ui.inspection ? ResidualI18n.text("__R_u072__") : ResidualI18n.text("__R_u073__"),ResidualI18n.text("__R_u074__"),'data');
 if (!selected) return title + emptyView('data',ResidualI18n.text("__R_u075__"),ResidualI18n.text("__R_u076__"),ResidualI18n.text("__R_u077__"),'data');
 return ResidualI18n.html`${title}<div class="active-dataset"><div><small>__R_u078__</small><strong>${esc(selected.label)}</strong><span>${number(selected.row_count)} __R_u049__${selected.period ? ` · ${esc(selected.period)}` : ''}${selected.synthetic_data ? ResidualI18n.text(" · __R_u048__") : ''}</span></div><button class="text-button" data-view="data" ${disabled()}>__R_u079__ ${icon('arrow')}</button></div>${connectionPanel()}${questionPanel()}`;
}
function reportsPage() {
 const reports = list(state.reports);
 const report = currentReport();
 if (report && !ui.showReportList) return ResidualI18n.html`${viewHeading(ResidualI18n.text("03 / __R_u080__"),ResidualI18n.text("__R_u081__"),ResidualI18n.text("__R_u082__"),ResidualI18n.html`<button class="btn" data-action="all-reports" ${disabled()}>${icon('history')}__R_u083__</button>`)}${reportPanel(report)}<details class="panel completed-plan"><summary>__R_u084__</summary>${planCard(report.plan,report)}</details>`;
 const title = viewHeading(ResidualI18n.text("03 / __R_u085__"),ResidualI18n.text("__R_u017__"),ResidualI18n.text("__R_u086__"));
 if (!reports.length) return title + emptyView('file',ResidualI18n.text("__R_u087__"),ResidualI18n.text("__R_u088__"),ResidualI18n.text("__R_u037__"),'analysis');
 return `${title}<div class="report-list">${reports.map(report => `<button class="report-list-item" data-report="${esc(report.id)}" ${disabled()}><span class="report-list-icon">${icon('file')}</span><span class="report-list-copy"><strong>${esc(report.question || ResidualI18n.text("__R_u089__"))}</strong><small>${esc(date(report.created_at))}</small></span>${icon('arrow')}</button>`).join('')}</div>`;
}
function pageContent() {
 return {home:homePage,data:dataPage,analysis:analysisPage,reports:reportsPage,model:settingsPanel}[ui.view]();
}
function rawPreview(table) {
 const rows = list(table?.preview);
 if (!rows.length) return ResidualI18n.text("<p class=\"preview-note\">__R_u090__</p>");
 return ResidualI18n.html`<div class="table-scroll table-preview"><table class="preview-table"><caption>__R_u091__</caption><tbody>${rows.map((row,index) => `<tr class="${index + 1 === Number(ui.headerRow) ? 'header-candidate' : ''}"><td class="row-index">${index + 1}</td>${list(row).map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function importProgress() {const step = ui.preview ? 3 : ui.inspection ? 2 : 1;return ResidualI18n.html`<div class="import-progress" aria-label="__R_u095__">${[ResidualI18n.text("__R_u092__"),ResidualI18n.text("__R_u093__"),ResidualI18n.text("__R_u094__")].map((text,index) => `${index ? '<i aria-hidden="true"></i>' : ''}<span class="${step === index + 1 ? 'current' : ''}" ${step === index + 1 ? 'aria-current="step"' : ''}><b>${index + 1}</b>${text}</span>`).join('')}</div>`;}
function tableSelection() {
 const selected = list(ui.inspection.tables).find(item => item.id === ui.tableId);
 return ResidualI18n.html`<form id="table-preview-form"><div class="import-meta"><strong>${icon('file')} ${esc(ui.inspection.filename)}</strong><small>${esc(String(ui.inspection.format || '').toUpperCase())} · __R_u097__ ${number(ui.inspection.tables?.length)}</small></div><div class="form-row"><label class="field-label" for="import-table">__R_u098__<select id="import-table" ${disabled()}>${list(ui.inspection.tables).map(table => ResidualI18n.html`<option value="${esc(table.id)}" ${table.id === ui.tableId ? 'selected' : ''}>${esc(table.label)} · __R_u096__ ${number(table.row_count)} __R_u049__</option>`).join('')}</select></label><label class="field-label" for="header-row">__R_u099__<input id="header-row" type="number" min="1" step="1" value="${Number(ui.headerRow) || 1}" required ${disabled()}></label></div>${rawPreview(selected)}${warnings([...list(ui.inspection.warnings),...list(selected?.warnings)])}<div class="import-actions"><button type="button" class="text-button" data-action="reset-import" ${disabled()}>__R_u100__</button><button type="submit" class="btn primary" ${disabled(!selected)}>__R_u101__ ${icon('arrow')}</button></div></form>`;
}
function columnCard(column,index) {
 const profile = list(ui.preview.columns).find(item => item.id === column.id) || {};
 return ResidualI18n.html`<div class="column-card ${column.role === 'ignore' ? 'ignored' : ''}"><div class="column-title"><div><strong><code>${esc(column.id)}</code>${esc(profile.source_name)}</strong><small>__R_u103__ ${list(profile.sample).length ? list(profile.sample).map(esc).join(' · ') : ResidualI18n.text("__R_u102__")}</small></div><span class="column-stats">__R_u104__ ${number(profile.missing_count)}<br>__R_u105__ ${number(profile.unique_count)}</span></div><div class="column-fields"><label class="field-label" for="column-label-${index}">__R_u106__<input id="column-label-${index}" data-column="${index}" data-field="label" value="${esc(column.label)}" maxlength="120" required ${disabled()}></label><label class="field-label" for="column-role-${index}">__R_u107__<select id="column-role-${index}" data-column="${index}" data-field="role" ${disabled()}>${Object.entries(roles).map(([role,label]) => `<option value="${role}" ${column.role === role ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field-label" for="column-unit-${index}">__R_u108__<input id="column-unit-${index}" data-column="${index}" data-field="unit" value="${esc(column.unit)}" placeholder="__R_u109__" maxlength="60" ${disabled(column.role !== 'number')}></label><label class="field-label" for="column-decimal-${index}">__R_u110__<select id="column-decimal-${index}" data-column="${index}" data-field="decimal_separator" ${disabled(column.role !== 'number')}><option value="." ${column.decimal_separator === '.' ? 'selected' : ''}>__R_u111__</option><option value="," ${column.decimal_separator === ',' ? 'selected' : ''}>__R_u112__</option></select></label></div><details class="column-missing"><summary>__R_u113__</summary><label class="field-label" for="column-missing-${index}">__R_u114__<input id="column-missing-${index}" data-column="${index}" data-field="missing_values" value="${esc(list(column.missing_values).join('; '))}" placeholder="__R_u115__" maxlength="1700" ${disabled(column.role === 'ignore' || column.role === 'identifier')}></label><p class="field-hint">__R_u116__</p></details></div>`;
}
function passportPanel() {
 const form = ui.passport;
 return ResidualI18n.html`<form id="passport-form"><div class="import-meta"><strong>${esc(ui.inspection.filename)} / ${esc(ui.preview.table_label || '')}</strong><small>${number(ui.preview.row_count)} __R_u118__ ${number(form.columns.length)} __R_u119__</small></div><p class="field-hint">__R_u120__</p><div class="passport-context"><label class="field-label wide" for="dataset-label">__R_u121__<input id="dataset-label" value="${esc(form.label)}" maxlength="120" required ${disabled()}></label><label class="field-label" for="observation-unit">__R_u122__<small>__R_u123__</small><input id="observation-unit" value="${esc(form.observation_unit)}" placeholder="__R_u124__" maxlength="120" required ${disabled()}></label><label class="field-label" for="dataset-period">__R_u125__<small>__R_u126__</small><input id="dataset-period" value="${esc(form.period)}" placeholder="__R_u127__" maxlength="80" ${disabled()}></label></div><label class="confirm-label"><input id="dataset-synthetic" type="checkbox" ${form.declared_synthetic ? 'checked' : ''} ${disabled(ui.inspection.synthetic_data)}>__R_u128__</label><div class="passport-heading"><h3>__R_u129__</h3><span>__R_u130__</span></div><div class="column-list">${form.columns.map(columnCard).join('')}</div>${warnings(ui.preview.warnings)}<details class="column-details"><summary>__R_u131__</summary><div class="table-scroll table-preview"><table class="preview-table"><thead><tr>${form.columns.map(column => `<th scope="col">${esc(column.label)}</th>`).join('')}</tr></thead><tbody>${list(ui.preview.preview).map(row => `<tr>${list(row).map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details><label class="confirm-label"><input id="confirm-passport" type="checkbox" required ${ui.confirmed ? 'checked' : ''} ${disabled()}>__R_u132__</label><div class="import-actions"><button class="text-button" type="button" data-action="back-table" ${disabled()}>__R_u133__</button><button class="btn primary" id="register-dataset" type="submit" ${disabled(!ui.confirmed || !form.columns.some(column => column.role === 'number'))}>__R_u134__ ${icon('arrow')}</button></div>${!form.columns.some(column => column.role === 'number') ? ResidualI18n.text("<p class=\"field-hint\">__R_u117__</p>") : ''}</form>`;
}
function datasetPanel() {
 const selected = dataset();
 if (ui.importing || !selected) return `<section class="panel import-panel" id="import-panel">${heading('01',ResidualI18n.text("__R_u135__"),ResidualI18n.text("__R_u136__"))}${importProgress()}${ui.preview ? passportPanel() : ui.inspection ? tableSelection() : startPanel()}${selected ? ResidualI18n.html`<div class="dataset-actions"><button class="text-button" data-action="cancel-import" ${disabled()}>__R_u137__</button></div>` : ''}</section>`;
 return ResidualI18n.html`<section class="panel dataset-panel">${heading('01',ResidualI18n.text("__R_u138__"),ResidualI18n.text("__R_u139__"))}<div class="dataset-heading-row"><label class="field-label" for="dataset-select">__R_u143__</label><button class="text-button" data-action="new-import" ${disabled()}>${icon('upload')}__R_u144__</button></div><select id="dataset-select" ${disabled()}>${list(state.datasets).map(item => `<option value="${esc(item.id)}" ${item.id === selected.id ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select>${syntheticBadge(selected.synthetic_data)}<div class="dataset-metadata"><span>${icon('data')}${number(selected.row_count)} __R_u049__</span><span>__R_u145__ ${esc(selected.observation_unit)}</span>${selected.period ? `<span>${esc(selected.period)}</span>` : ''}</div><details class="column-details"><summary>__R_u146__</summary><dl>${list(selected.columns).filter(column => column.role !== 'ignore').map(column => `<div><dt>${esc(column.label)}</dt><dd>${esc(roles[column.role] || column.role)}${column.unit ? ` · ${esc(column.unit)}` : ''}${column.missing_count ? ResidualI18n.html` · __R_u140__ ${number(column.missing_count)}` : ''}${column.invalid_count ? ResidualI18n.html` · __R_u141__ ${number(column.invalid_count)}` : ''}${column.missing_values?.length ? ResidualI18n.html` · __R_u142__ ${column.missing_values.map(esc).join('; ')}` : ''}</dd></div>`).join('')}</dl><p class="field-hint">__R_u147__</p></details></section>`;
}
function examples() {
 const selected=dataset(),numeric=list(selected?.columns).filter(column=>column.role==='number'),category=list(selected?.columns).find(column=>column.role==='category');
 if(!numeric.length)return [];
 const parameters={measure:numeric[0].label,group:category?.label||''};
 return [ResidualI18n.t('question_mean',parameters),ResidualI18n.t(category?'question_group_median':'question_median',parameters)];
}

function planCard(plan=ui.plan,report=ui.report) {
 if (!plan) return '';
 const ready = plan.status === 'ready', completed = Boolean(report && report.plan?.id === plan.id);
 return `<div id="table-plan" class="plan-card ${ready ? '' : 'plan-paused'}" tabindex="-1"><div class="plan-title"><span class="label-pill">${icon(ready ? 'check' : 'info')}${ready ? (completed ? ResidualI18n.text("__R_u153__") : ResidualI18n.text("__R_u154__")) : plan.status === 'clarify' ? ResidualI18n.text("__R_u155__") : ResidualI18n.text("__R_u156__")}</span><small>${esc(plan.model || state.provider?.model || '')}</small></div><p class="plan-reason">${esc(plan.reason || (ready ? ResidualI18n.text("__R_u157__") : ResidualI18n.text("__R_u158__")))}</p>${ready ? ResidualI18n.html`<dl class="plan-fields"><div><dt>__R_u164__</dt><dd>${list(plan.metric_details).length ? list(plan.metric_details).map(item => `${esc(item.label)}${item.unit ? ` (${esc(item.unit)})` : ''}`).join(' · ') : list(plan.metrics).map(id => esc(metricInfo(id).label)).join(' · ')}</dd></div><div><dt>__R_u165__</dt><dd>${esc(aggregation(plan.aggregation))}</dd></div><div><dt>__R_u166__</dt><dd>${plan.group_by ? ResidualI18n.html`__R_u159__${esc(plan.group_label || list(dataset()?.columns).find(column => column.id === plan.group_by)?.label || plan.group_by)}»` : ResidualI18n.text("__R_u160__")}</dd></div><div><dt>__R_u167__</dt><dd>${esc(plan.observation_unit || dataset()?.observation_unit || '')}</dd></div><div><dt>__R_u168__</dt><dd>${esc(plan.period || dataset()?.period || ResidualI18n.text("__R_u161__"))}</dd></div></dl><div class="plan-approval"><p>__R_u169__</p>${completed ? ResidualI18n.text("<p class=\"saved-plan-note\">__R_u162__</p>") : ResidualI18n.html`<button class="btn primary" data-action="execute" ${disabled()}>__R_u163__ ${icon('arrow')}</button>`}</div>` : ResidualI18n.text("<p class=\"field-hint\">__R_u170__</p>")}</div>`;
}
function questionPanel() {
 if (ui.importing || !dataset()) return '';
 const questions = examples();
 return ResidualI18n.html`<section class="panel question-panel">${heading('02',ResidualI18n.text("__R_u171__"),ResidualI18n.text("__R_u172__"))}<form id="question-form"><label class="field-label" for="table-question">__R_u173__</label><textarea id="table-question" rows="3" maxlength="2000" placeholder="__R_u174__" required ${disabled()}>${esc(ui.question)}</textarea><div class="examples">${questions.map((question,index) => `<button type="button" data-example="${index}" ${disabled()}>${esc(question)}</button>`).join('')}</div><div class="question-footer"><p>__R_u175__</p><button class="btn primary" id="prepare-plan" type="submit" ${disabled(!ui.question.trim())}>${icon('spark')}__R_u176__</button></div></form>${planCard()}</section>`;
}
function chart(report,metricId) {
 const rows = list(report.table).slice(0,24), info = metricInfo(metricId);
 if (!rows.length) return ResidualI18n.text("<p class=\"empty-result\">__R_u177__</p>");
 const values = rows.map(row => row.values?.[metricId]).filter(value => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
 if (!values.length) return ResidualI18n.text("<p class=\"empty-result\">__R_u178__</p>");
 let minimum = Math.min(0,...values), maximum = Math.max(0,...values);
 if (minimum === maximum) maximum = minimum + 1;
 const left = 205,width = 420,zero = left + (0-minimum)/(maximum-minimum)*width,height = rows.length*58 + 22;
 const mobileChart = ResidualI18n.html`<div class="mobile-chart" role="img" aria-label="${esc(info.label)} __R_u180__">${rows.map(row => {const raw = row.values?.[metricId],valid = raw !== null && raw !== undefined && Number.isFinite(Number(raw)),value = valid ? Number(raw) : 0,zeroPercent = (0-minimum)/(maximum-minimum)*100,valuePercent = (value-minimum)/(maximum-minimum)*100;return `<div class="mobile-chart-row"><span class="mobile-chart-label">${esc(row.group ?? ResidualI18n.text("__R_u179__"))}</span><span class="mobile-chart-track"><i class="mobile-chart-zero" style="left:${zeroPercent}%"></i>${valid ? `<i class="mobile-chart-bar ${value < 0 ? 'negative' : ''}" style="left:${Math.min(zeroPercent,valuePercent)}%;width:${Math.abs(valuePercent-zeroPercent)}%"></i>` : ''}</span><strong>${esc(number(raw))}</strong></div>`;}).join('')}</div>`;
 return ResidualI18n.html`${mobileChart}<svg class="report-chart" viewBox="0 0 800 ${height}" role="img" aria-label="${esc(info.label)} __R_u184__"><line class="chart-zero" x1="${zero}" x2="${zero}" y1="6" y2="${height-5}"/>${rows.map((row,index) => {const raw = row.values?.[metricId],valid = raw !== null && raw !== undefined && Number.isFinite(Number(raw)),value = valid ? Number(raw) : 0,coordinate = left + (value-minimum)/(maximum-minimum)*width,y = index*58+15,label = String(row.group ?? ResidualI18n.text("__R_u179__")),short = label.length > 27 ? label.slice(0,25)+'…' : label;return `<g><title>${esc(label)}: ${number(raw)}${info.unit ? ` ${esc(info.unit)}` : ''}</title><text x="0" y="${y+21}" fill="#657b52" font-size="14">${esc(short)}</text>${valid ? `<rect class="${value < 0 ? 'chart-negative' : 'chart-bar'}" x="${Math.min(zero,coordinate)}" y="${y}" width="${Math.abs(coordinate-zero)}" height="30" rx="4"/>` : ''}<text x="650" y="${y+21}" fill="#496437" font-size="16">${esc(number(raw))}</text></g>`;}).join('')}</svg>${report.table.length > rows.length ? ResidualI18n.html`<p class="preview-note">__R_u181__ ${rows.length} __R_u182__ ${number(report.table.length)} __R_u183__</p>` : ''}`;
}
function reportPanel(report=ui.report) {
 if (!report) return '';
 const metrics = list(report.plan?.metrics), metricId = metrics.includes(ui.chartMetric) ? ui.chartMetric : metrics[0], bad = Object.entries(report.quality?.invalid_numeric || {});
 return ResidualI18n.html`<section class="panel report-panel" id="table-report" tabindex="-1">${heading('03',ResidualI18n.text("__R_u185__"),ResidualI18n.text("__R_u186__"))}${syntheticBadge(report.dataset?.synthetic_data)}<div class="report-intro"><h3>${esc(report.question)}</h3><p>${esc(report.dataset?.label || dataset()?.label || '')} · ${esc(date(report.created_at))}</p></div><div class="report-summary">${list(report.summary).map(text => `<p>${esc(text)}</p>`).join('')}</div><div class="chart-block"><div class="chart-heading"><div><h3>${esc(aggregation(report.plan?.aggregation))} __R_u198__</h3><p>${esc(metricInfo(metricId).unit || ResidualI18n.text("__R_u187__"))}</p></div>${metrics.length > 1 ? ResidualI18n.html`<label class="chart-select-label" for="chart-metric">__R_u188__<select id="chart-metric">${metrics.map(id => `<option value="${esc(id)}" ${id === metricId ? 'selected' : ''}>${esc(metricInfo(id).label)}</option>`).join('')}</select></label>` : ''}</div>${metricId ? chart(report,metricId) : ''}</div><div class="table-scroll"><table class="report-table"><caption>__R_u199__</caption><thead><tr><th scope="col">${esc(report.plan?.group_label || ResidualI18n.text("__R_u189__"))}</th><th scope="col">__R_u200__</th>${metrics.map(id => `<th scope="col">${esc(metricInfo(id).label)}<small>${esc(metricInfo(id).unit || '')}</small></th>`).join('')}</tr></thead><tbody>${list(report.table).map(row => `<tr><th scope="row">${esc(row.group ?? ResidualI18n.text("__R_u179__"))}</th><td>${number(row.rows)}</td>${metrics.map(id => ResidualI18n.html`<td>${number(row.values?.[id])}<small>__R_u191__ ${number(row.valid_counts?.[id])}${row.missing_counts?.[id] ? ResidualI18n.html` · __R_u190__ ${number(row.missing_counts[id])}` : ''}</small></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="report-support"><details open><summary>__R_u201__</summary><dl class="quality-grid"><div><dt>__R_u202__</dt><dd>${number(report.quality?.total_rows)}</dd></div><div><dt>__R_u203__</dt><dd>${number(report.quality?.grouping_missing_rows)}</dd></div></dl>${bad.length ? `<p>${bad.map(([id,value]) => ResidualI18n.html`${esc(metricInfo(id).label)}: __R_u192__ ${number(value)}`).join('<br>')}</p>` : ''}<p>${esc(report.methodology || '')}</p><dl class="formula-list">${metrics.map(id => `<div><dt>${esc(metricInfo(id).label)}</dt><dd>${esc(formulaDescription(report.plan?.aggregation))}</dd></div>`).join('')}</dl></details><details><summary>__R_u204__</summary>${list(report.sources).map(source => `<div class="source-item"><strong>${esc(source.filename || '')}</strong><span>${esc(source.table || '')}</span>${source.sha256 ? `<code>SHA-256 ${esc(source.sha256)}</code>` : ''}</div>`).join('')}<p>__R_u205__ ${esc(report.plan?.model || '')}<br>__R_u206__ ${esc(report.id)}</p><p>__R_u207__</p></details><details open><summary>__R_u208__</summary><ul class="limitations">${list(report.limitations).map(text => `<li>${humanText(text)}</li>`).join('')}</ul></details></div><div class="export-bar"><span>${icon('download')}__R_u209__</span><div>${[['html',ResidualI18n.text("__R_u193__")],['csv',ResidualI18n.text("__R_u194__")],['python',ResidualI18n.text("__R_u195__")],['source',ResidualI18n.text("CSV __R_u196__")],['json',ResidualI18n.text("__R_u197__")]].map(([format,label]) => `<a class="btn small-btn" href="/api/tables/export?id=${encodeURIComponent(report.id)}&format=${format}" download>${label}</a>`).join('')}</div></div></section>`;
}
function modelSetupGuide(config) {
 if (config.provider !== 'ollama') return ResidualI18n.text("<div class=\"setup-note\"><strong>__R_u210__</strong><p>__R_u211__</p></div>");
 return ResidualI18n.text("<div class=\"setup-note\"><strong>__R_u212__</strong><ol><li>__R_u213__ <code>setup_local_ai.cmd</code> __R_u214__</li><li>__R_u215__</li><li>__R_u216__</li></ol><p>__R_u217__</p></div>");
}
function settingsPanel() {
 const config = ui.config,status = modelStatus();
 return ResidualI18n.html`<section class="panel settings-page" aria-labelledby="settings-title"><div class="modal-head"><div><span class="eyebrow">__R_u225__</span><h2 id="settings-title">__R_u226__</h2><p>__R_u227__</p></div></div><div class="modal-body"><div class="connection-status" role="status"><span class="status-dot ${status.kind}"></span><div><strong>${status.text}</strong><p>${esc(ui.probe?.message || ResidualI18n.text("__R_u218__"))}</p></div></div><form id="provider-form"><label class="field-label" for="provider-kind">__R_u228__</label><select id="provider-kind" ${disabled()}><option value="ollama" ${config.provider === 'ollama' ? 'selected' : ''}>Ollama · __R_u229__</option><option value="openai_compatible" ${config.provider === 'openai_compatible' ? 'selected' : ''}>__R_u230__</option></select><details class="model-help"><summary>__R_u231__</summary>${modelSetupGuide(config)}</details><label class="field-label" for="provider-url">__R_u232__</label><input id="provider-url" type="url" value="${esc(config.base_url)}" required ${disabled()}><label class="field-label" for="provider-model">__R_u233__</label><input id="provider-model" value="${esc(config.model)}" maxlength="200" required ${disabled()}>${config.provider === 'openai_compatible' ? ResidualI18n.html`<label class="field-label" for="provider-key">__R_u221__</label><input id="provider-key" type="password" autocomplete="new-password" maxlength="4096" placeholder="${config.api_key_set ? ResidualI18n.text("__R_u219__") : ResidualI18n.text("__R_u220__")}" ${disabled()}><p class="field-hint">__R_u222__</p><label class="checkbox-label"><input id="allow-external" type="checkbox" ${config.allow_external ? 'checked' : ''} ${disabled()}>__R_u223__</label>` : ''}<p class="privacy-note">__R_u234__</p><div class="button-row settings-actions"><button class="btn primary" type="submit" ${disabled()}>__R_u235__</button><button class="btn" type="button" data-action="probe" ${disabled(ui.configDirty)}>__R_u236__</button></div></form>${ui.probe?.models?.length ? ResidualI18n.html`<details class="models-list"><summary>__R_u224__</summary><p>${ui.probe.models.map(esc).join('<br>')}</p></details>` : ''}${ui.error ? `<div class="error-banner" role="alert">${esc(ui.error)}</div>` : ''}${ui.busy ? `<p class="busy-inline" role="status"><span class="spinner"></span>${esc(ui.busy)}</p>` : ''}</div></section>`;
}
function render() {
 if (!state) {root.innerHTML = `<div class="boot"><img src="/assets/residual-mark.png" alt="Residual" width="64" height="64"><p>${esc(ui.error || ResidualI18n.text("__R_u237__"))}</p>${ui.error ? ResidualI18n.text("<button class=\"btn\" data-action=\"retry\">__R_u238__</button>") : '<span class="spinner"></span>'}</div>`;return;}
 root.innerHTML = ResidualI18n.html`${navigation()}<div class="app table-app studio-app view-${ui.view}">${header()}<div class="workspace"><main class="content" id="main-content" tabindex="-1">${ui.error && ui.view !== 'model' ? `<div class="error-banner" role="alert">${icon('info')}<span>${esc(ui.error)}</span></div>` : ''}${ui.notice ? `<div class="notice-banner" role="status">${icon('check')}<span>${esc(ui.notice)}</span></div>` : ''}${ui.busy && ui.view !== 'model' ? `<div class="busy-banner" role="status"><span class="spinner"></span><div><strong>${esc(ui.busy)}</strong><p>${ui.busy.includes(ResidualI18n.text("__R_u239__")) ? ResidualI18n.text("__R_u240__") : ResidualI18n.text("__R_u241__")}</p></div></div>` : ''}${pageContent()}<footer class="footer"><span>residual © 2026</span><span>__R_u242__</span></footer></main></div></div>`;

}

async function inspectFile(file) {
 if (!file) return;
 if (file.size > 10*1024*1024) {ui.error = ResidualI18n.text("__R_u243__");render();return;}
 if (!/\.(csv|tsv|xlsx|xls|html|htm)$/i.test(file.name)) {ui.error = ResidualI18n.text("__R_u244__");render();return;}
 await action(ResidualI18n.text("__R_u245__"),async () => {
  const content = await new Promise((resolve,reject) => {const reader = new FileReader();reader.onload = () => resolve(String(reader.result).split(',')[1]);reader.onerror = () => reject(new Error(ResidualI18n.text("__R_u246__")));reader.readAsDataURL(file);});
  const result = await api('inspect',{filename:file.name,content_base64:content});
  if (!result.tables?.length) throw new Error(ResidualI18n.text("__R_u247__"));
  setView('data');ui.inspection = result;ui.tableId = result.tables[0].id;ui.headerRow = 1;ui.preview = null;ui.passport = null;ui.confirmed = false;ui.importing = true;resetResult();
 });
}
async function preparePassport(event) {
 event.preventDefault();
 if (!ui.inspection) return;
 await action(ResidualI18n.text("__R_u248__"),async () => {
  ui.preview = await api('preview',{import_id:ui.inspection.id,table_id:ui.tableId,header_row:Number(ui.headerRow)});
  ui.passport = {label:ui.inspection.filename.replace(/\.[^.]+$/,''),observation_unit:'',period:'',declared_synthetic:Boolean(ui.inspection.synthetic_data),columns:list(ui.preview.columns).map(column => ({id:column.id,label:column.source_name,role:column.inferred_role || 'ignore',unit:'',decimal_separator:column.suggested_decimal_separator === ',' ? ',' : '.',missing_values:[]}))};ui.confirmed = false;
 });
 document.querySelector('#dataset-label')?.focus({preventScroll:true});
}
async function registerDataset(event) {
 event.preventDefault();
 if (!ui.confirmed || !ui.passport) return;
 if (!ui.passport.observation_unit.trim()) {ui.error = ResidualI18n.text("__R_u249__");render();return;}
 await action(ResidualI18n.text("__R_u250__"),async () => {
  const result = await api('register',{import_id:ui.inspection.id,table_id:ui.tableId,header_row:Number(ui.headerRow),...ui.passport});
  await refresh();ui.datasetId = (result.dataset || result).id;ui.importing = false;ui.inspection = null;ui.preview = null;ui.passport = null;resetResult(true);setView('analysis');ui.notice = ResidualI18n.text("__R_u251__");
 });
 document.querySelector('#table-question')?.focus({preventScroll:true});
}
async function preparePlan(event) {
 event.preventDefault();
 if (!dataset() || !ui.question.trim()) return;
 await action(ResidualI18n.text("__R_u252__"),async () => {
  ui.plan = null;ui.report = null;ui.plan = await api('plan',{dataset_id:ui.datasetId,question:ui.question.trim()});if (ui.plan.status === 'ready' && ui.plan.model) ui.probe = {ok:true,message:ResidualI18n.text("__R_u253__"),selected_model:ui.plan.model};
 });
 document.querySelector('#table-plan')?.focus({preventScroll:true});
}
async function execute() {
 if (ui.plan?.status !== 'ready') return;
 await action(ResidualI18n.text("__R_u254__"),async () => {ui.report = await api('execute',{plan_id:ui.plan.id});ui.savedReport = null;ui.showReportList = false;ui.chartMetric = '';await refresh();setView('reports');ui.notice = ResidualI18n.text("__R_u255__");});
 document.querySelector('#table-report')?.scrollIntoView({behavior:'smooth',block:'start'});
}
async function configure(event) {
 event.preventDefault();
 const secret = document.querySelector('#provider-key'),body = {provider:ui.config.provider,base_url:document.querySelector('#provider-url').value.trim(),model:document.querySelector('#provider-model').value.trim(),allow_external:ui.config.provider === 'openai_compatible' && Boolean(document.querySelector('#allow-external')?.checked)};
 if (secret?.value) body.api_key = secret.value;
 if (secret) secret.value = '';
 await action(ResidualI18n.text("__R_u256__"),async () => {await api('configure',body,'research');ui.configDirty = false;ui.probe = null;await refresh();ui.notice = ResidualI18n.text("__R_u257__");});
}
function dirtyConfig() {ui.configDirty = true;const button = document.querySelector('[data-action="probe"]');if (button) button.disabled = true;}

root.addEventListener('click',async event => {
 const button = event.target.closest('button');
 if (!button || button.disabled || ui.busy) return;
 if (button.dataset.view) {goTo(button.dataset.view);return;}
 if (button.dataset.example !== undefined) {ui.question = examples()[Number(button.dataset.example)] || '';resetResult();render();document.querySelector('#table-question')?.focus();return;}
 if (button.dataset.report) {await action(ResidualI18n.text("__R_u258__"),async () => {ui.savedReport = await api('report?id='+encodeURIComponent(button.dataset.report));ui.showReportList = false;ui.chartMetric = '';setView('reports');});return;}
 switch(button.dataset.action) {
  case 'begin':goTo(dataset() && !ui.importing ? 'analysis' : 'data');break;
  case 'all-reports':ui.showReportList = true;render();break;
  case 'resume-dataset':if (list(state.datasets).some(item => item.id === ui.resumeDatasetId)) {ui.datasetId = ui.resumeDatasetId;ui.resumeDatasetId = '';setView('analysis');ui.importing = false;ui.inspection = null;ui.preview = null;ui.passport = null;resetResult(true);render();document.querySelector('#table-question')?.focus({preventScroll:true});}break;
  case 'new':resetResult(true);ui.importing = !dataset();setView(dataset() ? 'analysis' : 'data');render();document.querySelector('#table-question')?.focus();break;
  case 'new-import':ui.importing = true;setView('data');ui.inspection = null;ui.preview = null;ui.passport = null;render();break;
  case 'cancel-import':ui.importing = false;ui.error = '';render();break;
  case 'reset-import':ui.inspection = null;ui.preview = null;ui.passport = null;ui.error = '';render();break;
  case 'back-table':ui.preview = null;ui.passport = null;ui.confirmed = false;ui.error = '';render();break;
  case 'example-excel':{
   let file;setView('data');
   await action(ResidualI18n.text("__R_u259__"),async () => {const response = await fetch('/examples/import/schools.xlsx');if (!response.ok) throw new Error(ResidualI18n.text("__R_u260__"));file = new File([await response.blob()],'schools.xlsx');});
   if (file) await inspectFile(file);break;
  }
  case 'execute':await execute();break;
  case 'settings':goTo('model');break;
  case 'close':goTo('home');break;
  case 'probe':await action(ResidualI18n.text("__R_u261__"),async () => {try {ui.probe = await api('probe',{},'research');} catch(error) {ui.probe = {ok:false,message:error.message};throw error;}});break;
  case 'retry':await action(ResidualI18n.text("__R_u262__"),refresh);break;
 }
});
root.addEventListener('input',event => {
 const target = event.target,{id,value} = target;
 if (id === 'table-question') {ui.question = value;const button = document.querySelector('#prepare-plan');if (button) button.disabled = Boolean(ui.busy || !value.trim());if (ui.plan || ui.report) {ui.plan = null;ui.report = null;document.querySelector('#table-plan')?.remove();document.querySelector('#table-report')?.remove();}ui.notice = '';}
 if (id === 'header-row') {ui.headerRow = value;document.querySelectorAll('.preview-table tbody tr').forEach((row,index) => row.classList.toggle('header-candidate',index+1 === Number(value)));}
 if (ui.passport && ['dataset-label','observation-unit','dataset-period'].includes(id)) ui.passport[{'dataset-label':'label','observation-unit':'observation_unit','dataset-period':'period'}[id]] = value;
 if (target.dataset.column !== undefined && ui.passport) {ui.passport.columns[Number(target.dataset.column)][target.dataset.field] = target.dataset.field === 'missing_values' ? value.split(';').map(code => code.trim()).filter(Boolean) : value;ui.confirmed = false;const checkbox = document.querySelector('#confirm-passport');if (checkbox) checkbox.checked = false;const save = document.querySelector('#register-dataset');if (save) save.disabled = true;}
 if (id === 'provider-url') {ui.config.base_url = value;dirtyConfig();}
 if (id === 'provider-model') {ui.config.model = value;dirtyConfig();}
 if (id === 'provider-key') dirtyConfig();
});
root.addEventListener('change',async event => {
 const target = event.target,{id,value} = target;
 if (id === 'table-file') await inspectFile(target.files?.[0]);
 if (id === 'import-table') {ui.tableId = value;ui.headerRow = 1;render();}
 if (id === 'dataset-select') {ui.datasetId = value;resetResult(true);render();}
 if (id === 'saved-dataset-select') {ui.resumeDatasetId = value;const button = document.querySelector('[data-action="resume-dataset"]');if (button) button.disabled = Boolean(ui.busy || !value);}
 if (id === 'chart-metric') {ui.chartMetric = value;render();}
 if (id === 'dataset-synthetic' && ui.passport) {ui.passport.declared_synthetic = target.checked;ui.confirmed = false;render();}
 if (id === 'confirm-passport') {ui.confirmed = target.checked;const button = document.querySelector('#register-dataset');if (button) button.disabled = !ui.confirmed || !ui.passport.columns.some(column => column.role === 'number');}
 if (target.dataset.field === 'role' && ui.passport) {ui.passport.columns[Number(target.dataset.column)].role = value;ui.confirmed = false;render();document.querySelector('#'+id)?.focus({preventScroll:true});}
 if (id === 'provider-kind') {ui.config.provider = value;ui.config.allow_external = false;ui.config.base_url = value === 'ollama' ? defaults.base_url : '';ui.config.model = value === 'ollama' ? defaults.model : '';ui.configDirty = true;render();}
 if (id === 'allow-external') {ui.config.allow_external = target.checked;dirtyConfig();}
});
root.addEventListener('submit',event => {if (event.target.id === 'table-preview-form') preparePassport(event);if (event.target.id === 'passport-form') registerDataset(event);if (event.target.id === 'question-form') preparePlan(event);if (event.target.id === 'provider-form') configure(event);});
window.addEventListener('hashchange',() => goTo(initialView(),false));
refresh().then(render).catch(error => {ui.error = error.message;render();});

window.addEventListener("residual:language", () => {
roles = {number:ResidualI18n.text("__R_u001__"),category:ResidualI18n.text("__R_u002__"),identifier:ResidualI18n.text("__R_u003__"),ignore:ResidualI18n.text("__R_u004__")};
views = {home:ResidualI18n.text("__R_u014__"),data:ResidualI18n.text("__R_u015__"),analysis:ResidualI18n.text("__R_u016__"),reports:ResidualI18n.text("__R_u017__"),model:ResidualI18n.text("__R_u018__")};
ui.error='';ui.notice='';render();
});
