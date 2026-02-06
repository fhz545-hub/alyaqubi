import { Store } from './db.js';
import { sendSMS } from './sms.js';
import { BEHAVIOR_RULES, DEFAULT_ACTIONS } from './rules.js';

// Barcode helper is loaded as a classic script (assets/barcode.js)
// and exposes window.code39Canvas(canvasEl, text)
const code39CanvasSafe = (cv, text) => {
  try {
    if (window.code39Canvas) window.code39Canvas(cv, text);
  } catch {
    /* ignore */
  }
};

// ---------------- DOM helpers
const $ = (q)=>document.querySelector(q);
const $$ = (q)=>Array.from(document.querySelectorAll(q));

function escapeHTML(s){
  return String(s??'').replace(/[&<>"]/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}

function toast(msg, ok=true){
  const t = $('#toast');
  t.textContent = msg;
  t.style.borderColor = ok ? 'rgba(var(--moe-rgb), .25)' : 'rgba(220,38,38,.35)';
  t.classList.add('show');
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=>t.classList.remove('show'), 2400);
}

function nowTime(){
  const d=new Date();
  return d.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'});
}
function fmtDT(iso){
  const d=new Date(iso);
  return d.toLocaleString('ar-SA',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function todayAr(){
  return new Date().toLocaleDateString('ar-SA',{year:'numeric',month:'2-digit',day:'2-digit'});
}

// ---------------- App state
let currentTab = 'home';
let selectedNid = null;
let editingNid = null;
let syncTimer = null;
let syncInFlight = false;

function getSelectedStudent(){
  if(!selectedNid) return null;
  return Store.state.students.find(s=>String(s.nid)===String(selectedNid)) || null;
}

// ---------------- Tabs
function setTab(tab){
  currentTab = tab;
  $$('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  $$('.page').forEach(p=>p.hidden = p.id!==tab);
  // replicate student card on behavior tab
  if(tab==='behavior') renderStudentCard(getSelectedStudent());
}

// ---------------- Search / Selection
function renderSearchResults(list){
  const box = $('#searchResults');
  if(!list?.length){ box.innerHTML=''; return; }
  box.innerHTML = `
    <div class="results">
      ${list.map(s=>`
        <button class="result" data-action="select-student" data-nid="${escapeHTML(s.nid)}">
          <div class="rmain">
            <div class="rname">${escapeHTML(s.name)}</div>
            <div class="rmeta">${escapeHTML(s.grade||'—')} • ${escapeHTML(s.section||'—')}</div>
          </div>
          <div class="rid">${escapeHTML(s.nid)}</div>
        </button>
      `).join('')}
    </div>
  `;
}

function selectStudentByNid(nid){
  selectedNid = String(nid||'').trim();
  const s = getSelectedStudent();
  if(!s){
    selectedNid = null;
    toast('لم يتم العثور على الطالب', false);
  }
  renderStudentCard(getSelectedStudent());
  renderLogs();
}

// ---------------- Student card
function renderStudentCard(student){
  const box = $('#studentCard');
  const box2 = $('#studentCardBeh');

  if(!student){
    const html = `<div class="help">ابحث بالاسم أو الهوية لاختيار الطالب.</div>`;
    box.innerHTML = html;
    box2.innerHTML = html;
    $('#stats_late').textContent = '0';
    $('#stats_absent').textContent = '0';
    $('#stats_behavior').textContent = '0';
    return;
  }

  const counts = Store.getCounts(student.nid);
  $('#stats_late').textContent = String(counts.LATE||0);
  $('#stats_absent').textContent = String(counts.ABSENT||0);
  $('#stats_behavior').textContent = String(counts.BEHAVIOR||0);

  const html = `
    <div class="stu">
      <div class="stu__top">
        <div>
          <div class="stu__name">${escapeHTML(student.name)}</div>
          <div class="stu__meta">الهوية: <b>${escapeHTML(student.nid)}</b> • الصف: <b>${escapeHTML(student.grade||'—')}</b> • الشعبة: <b>${escapeHTML(student.section||'—')}</b></div>
          <div class="stu__meta">الجوال: <b>${escapeHTML(student.phone||'—')}</b></div>
        </div>
        <div class="stu__actions">
          <button class="btn" data-action="edit-student" data-nid="${escapeHTML(student.nid)}">تعديل</button>
          <button class="btn danger" data-action="delete-student" data-nid="${escapeHTML(student.nid)}">حذف</button>
        </div>
      </div>

      <div class="hr"></div>

      <div class="stu__grid">
        <div class="kpi">
          <div class="mini">تأخرات</div>
          <div class="kpi__v">${counts.LATE||0}</div>
        </div>
        <div class="kpi">
          <div class="mini">غيابات</div>
          <div class="kpi__v">${counts.ABSENT||0}</div>
        </div>
        <div class="kpi">
          <div class="mini">سلوك</div>
          <div class="kpi__v">${counts.BEHAVIOR||0}</div>
        </div>
        <div class="barcodeBox">
          <div class="mini">باركود الهوية (Code39)</div>
          <canvas id="bc" width="520" height="80"></canvas>
        </div>
      </div>
    </div>
  `;
  box.innerHTML = html;
  box2.innerHTML = html;

  // draw barcode
  const cv = $('#bc');
  if(cv){
    code39CanvasSafe(cv, String(student.nid||''));
  }
}

// ---------------- Logs
function renderLogs(){
  const box = $('#logList');
  const student = getSelectedStudent();
  if(!student){
    box.innerHTML = `<div class="small">اختر طالبًا لعرض السجل.</div>`;
    return;
  }
  const logs = Store.state.logs.filter(l=>String(l.nid)===String(student.nid)).slice(0, 30);
  if(!logs.length){
    box.innerHTML = `<div class="small">لا يوجد سجل مسجل لهذا الطالب حتى الآن.</div>`;
    return;
  }
  box.innerHTML = `
    <ul class="list">
      ${logs.map(l=>{
        const label = l.type==='LATE' ? 'تأخر' : l.type==='ABSENT' ? 'غياب' : l.type==='SMS' ? 'رسالة' : 'سلوك';
        const pill = l.type==='LATE' ? 'pill warn' : l.type==='ABSENT' ? 'pill bad' : l.type==='SMS' ? 'pill' : 'pill';
        return `
          <li>
            <div>
              <div><span class="${pill}">${label}</span> <span class="meta">${fmtDT(l.at)}</span></div>
              <div class="meta">${escapeHTML(l.note||'')}</div>
            </div>
            <div class="meta">${escapeHTML(l.by||'')}</div>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

// ---------------- Attendance / Behavior
async function addAttendance(type){
  const student = getSelectedStudent();
  if(!student) return toast('اختر طالبًا أولًا', false);

  const note = (type==='LATE' ? $('#late_note').value : $('#abs_note').value).trim();
  const by = $('#actor').value.trim();

  await Store.addLog({
    type,
    nid: student.nid,
    name: student.name,
    grade: student.grade,
    section: student.section,
    note: note || (type==='LATE' ? 'تسجيل تأخر' : 'تسجيل غياب'),
    by
  });

  toast(type==='LATE' ? 'تم تسجيل التأخر' : 'تم تسجيل الغياب');
  $('#late_note').value='';
  $('#abs_note').value='';

  renderStudentCard(getSelectedStudent());
  renderLogs();
  await maybeAutoSync();
}

function hydrateBehavior(){
  const sel = $('#beh_rule');
  sel.innerHTML = `<option value="">اختر المخالفة</option>` +
    BEHAVIOR_RULES.map(r=>`<option value="${escapeHTML(r.code)}">${escapeHTML(r.code)} — ${escapeHTML(r.title)} (${escapeHTML(r.severity)})</option>`).join('');
  sel.addEventListener('change', onBehaviorChange);
}

function onBehaviorChange(){
  const code = $('#beh_rule').value;
  const r = BEHAVIOR_RULES.find(x=>x.code===code);
  if(!r){
    $('#beh_actions').value='';
    $('#beh_sev').textContent='—';
    return;
  }
  $('#beh_sev').textContent = r.severity;
  $('#beh_actions').value = (DEFAULT_ACTIONS[r.severity]||[]).join('، ');
}

async function addBehavior(){
  const student = getSelectedStudent();
  if(!student) return toast('اختر طالبًا أولًا', false);

  const code = $('#beh_rule').value;
  const r = BEHAVIOR_RULES.find(x=>x.code===code);
  if(!r) return toast('اختر المخالفة أولًا', false);

  const note = $('#beh_note').value.trim();
  const actions = $('#beh_actions').value.trim();
  const by = $('#actor').value.trim();

  await Store.addLog({
    type: 'BEHAVIOR',
    nid: student.nid,
    name: student.name,
    grade: student.grade,
    section: student.section,
    ruleCode: r.code,
    ruleTitle: r.title,
    severity: r.severity,
    actions,
    note: note || `${r.code} — ${r.title}`,
    by
  });

  toast('تم تسجيل المخالفة السلوكية');
  $('#beh_note').value='';

  renderStudentCard(getSelectedStudent());
  renderLogs();
  await maybeAutoSync();
}

// ---------------- Printing
function openPrintWindow(html, title='طباعة'){
  const w = window.open('', '_blank');
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  w.focus();
}

async function getBarcodeLibText(){
  const res = await fetch('assets/barcode.js');
  return await res.text();
}

async function printSheet(type){
  const s = Store.state.settings;
  const grade = $('#sheet_grade').value.trim();
  const section = $('#sheet_section').value.trim();
  const date = $('#sheet_date').value || new Date().toISOString().slice(0,10);

  let list = Store.state.students.slice();
  if(grade) list = list.filter(x=>String(x.grade||'')===grade);
  if(section) list = list.filter(x=>String(x.section||'')===section);
  list.sort((a,b)=>(a.name||'').localeCompare(b.name||'', 'ar'));

  if(!list.length) return toast('لا يوجد طلاب مطابقين للفلاتر', false);

  const title = type==='LATE' ? 'كشف متابعة تأخر الطلاب' : 'كشف متابعة غياب الطلاب';
  const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'];
  const barcodeLib = await getBarcodeLibText();

  const html = `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  @page { size: A4 landscape; margin: 9mm; }
  body{font-family:Tajawal, Arial, sans-serif; direction:rtl; margin:0; color:#111;}
  .hdr{border:1px solid #222; padding:8px 10px; margin:0 0 10px;}
  .hdrTop{display:flex; justify-content:space-between; align-items:flex-end; gap:10px}
  .school{font-weight:900; font-size:14px}
  .office{font-size:12px}
  .ttl{font-weight:900; font-size:16px; text-align:center; margin:8px 0 6px}
  .meta{display:flex; gap:10px; justify-content:center; flex-wrap:wrap; font-size:12.5px}
  .meta span{border:1px solid #222; padding:4px 8px}
  table{width:100%; border-collapse:collapse; table-layout:fixed}
  th,td{border:1px solid #222; padding:4px 5px; text-align:center; font-size:12px}
  th{background:#e9ecef; font-weight:900}
  td.name{font-weight:800; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  th.day{writing-mode:vertical-rl; transform:rotate(180deg); width:32px}
  th.bar{width:240px}
  td.bar{padding:0 6px}
  canvas{width:100%; height:46px}
</style>
</head>
<body>
  <div class="hdr">
    <div class="hdrTop">
      <div>
        <div class="office">${escapeHTML(s.educationOffice)}</div>
        <div class="school">${escapeHTML(s.schoolName)}</div>
      </div>
      <div style="text-align:left;font-size:12px">
        التاريخ: <b>${escapeHTML(date)}</b><br/>
        الوقت: <b>${escapeHTML(nowTime())}</b>
      </div>
    </div>
    <div class="ttl">${title}</div>
    <div class="meta">
      <span>الصف: <b>${escapeHTML(grade||'—')}</b></span>
      <span>الشعبة: <b>${escapeHTML(section||'—')}</b></span>
      <span>الفصل الدراسي: <b>${escapeHTML(s.term)}</b></span>
      <span>العام: <b>${escapeHTML(s.hijriYear)}هـ</b></span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:46px">م</th>
        <th>اسم الطالب</th>
        ${days.map(d=>`<th class="day">${d}</th>`).join('')}
        <th class="bar">باركود الهوية</th>
      </tr>
    </thead>
    <tbody>
      ${list.map((st,idx)=>`
        <tr>
          <td>${idx+1}</td>
          <td class="name">${escapeHTML(st.name)}</td>
          ${days.map(()=>`<td></td>`).join('')}
          <td class="bar"><canvas data-bc="${escapeHTML(st.nid)}" width="520" height="70"></canvas></td>
        </tr>
      `).join('')}
    </tbody>
  </table>

<script>
${barcodeLib}
document.querySelectorAll('canvas[data-bc]').forEach(cv=>{
  try{ code39Canvas(cv, cv.getAttribute('data-bc')); }catch(e){}
});
window.onload=()=>{ setTimeout(()=>window.print(), 350); };
</script>
</body>
</html>`;

  openPrintWindow(html, title);
}

function buildReceipt80mm({title, lines, nid}){
  const s = Store.state.settings;
  // 80mm thermal receipt style
  return `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHTML(title)}</title>
<style>
  @page{ size: 80mm auto; margin: 5mm; }
  body{font-family:Tajawal, Arial, sans-serif; margin:0; color:#111;}
  .h{font-weight:900; font-size:14px; text-align:center}
  .sub{font-size:11px; text-align:center; margin-top:2px}
  .box{border:1px dashed #111; padding:8px; margin-top:8px}
  .ln{display:flex; justify-content:space-between; gap:10px; font-size:12px; margin:2px 0}
  .k{color:#444}
  canvas{width:100%; height:46px; margin-top:6px}
  .foot{font-size:10px; text-align:center; margin-top:8px; color:#555}
</style>
</head>
<body>
  <div class="h">${escapeHTML(s.schoolName)}</div>
  <div class="sub">${escapeHTML(s.educationOffice)} • ${escapeHTML(s.hijriYear)}هـ</div>

  <div class="box">
    <div class="h" style="font-size:13px">${escapeHTML(title)}</div>
    ${lines.map(([k,v])=>`<div class="ln"><span class="k">${escapeHTML(k)}</span><span><b>${escapeHTML(v)}</b></span></div>`).join('')}
    <canvas id="bc" width="520" height="70"></canvas>
  </div>

  <div class="foot">تم الطباعة: ${escapeHTML(todayAr())} ${escapeHTML(nowTime())}</div>

<script>
${''}
</script>
</body>
</html>`;
}

async function printEntryCard(kind){
  const student = getSelectedStudent();
  if(!student) return toast('اختر طالبًا أولًا', false);

  const counts = Store.getCounts(student.nid);
  const title = kind==='BEHAVIOR' ? 'إشعار مخالفة سلوكية' : 'ورقة إذن دخول/استئذان';

  let note = '';
  if(kind==='BEHAVIOR'){
    const code = $('#beh_rule').value;
    const r = BEHAVIOR_RULES.find(x=>x.code===code);
    note = (r ? `${r.code} — ${r.title}` : '') || $('#beh_note').value.trim() || '—';
  }else{
    note = $('#late_note').value.trim() || $('#abs_note').value.trim() || '—';
  }

  const lines = [
    ['الطالب', student.name],
    ['الصف/الشعبة', `${student.grade||'—'} / ${student.section||'—'}`],
    ['الهوية', student.nid],
    ['تأخرات', String(counts.LATE||0)],
    ['غيابات', String(counts.ABSENT||0)],
    ['ملاحظة', note]
  ];

  const barcodeLib = await getBarcodeLibText();

  const html = `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHTML(title)}</title>
<style>
  @page{ size: 80mm auto; margin: 5mm; }
  body{font-family:Tajawal, Arial, sans-serif; margin:0; color:#111;}
  .h{font-weight:900; font-size:14px; text-align:center}
  .sub{font-size:11px; text-align:center; margin-top:2px}
  .box{border:1px dashed #111; padding:8px; margin-top:8px}
  .ln{display:flex; justify-content:space-between; gap:10px; font-size:12px; margin:2px 0}
  .k{color:#444}
  canvas{width:100%; height:46px; margin-top:6px}
  .foot{font-size:10px; text-align:center; margin-top:8px; color:#555}
</style>
</head>
<body>
  <div class="h">${escapeHTML(Store.state.settings.schoolName)}</div>
  <div class="sub">${escapeHTML(Store.state.settings.educationOffice)} • ${escapeHTML(Store.state.settings.hijriYear)}هـ</div>

  <div class="box">
    <div class="h" style="font-size:13px">${escapeHTML(title)}</div>
    ${lines.map(([k,v])=>`<div class="ln"><span class="k">${escapeHTML(k)}</span><span><b>${escapeHTML(v)}</b></span></div>`).join('')}
    <canvas id="bc" width="520" height="70"></canvas>
  </div>

  <div class="foot">تم الطباعة: ${escapeHTML(todayAr())} ${escapeHTML(nowTime())}</div>

<script>
${barcodeLib}
try{ code39Canvas(document.getElementById('bc'), ${JSON.stringify(String(student.nid||''))}); }catch(e){}
window.onload=()=>{ setTimeout(()=>window.print(), 250); };
</script>
</body>
</html>`;

  openPrintWindow(html, title);
}

// ---------------- Settings
function hydrateSettingsForm(){
  const s = Store.state.settings;
  $('#set_schoolName').value = s.schoolName || '';
  $('#set_educationOffice').value = s.educationOffice || '';
  $('#set_hijriYear').value = s.hijriYear || '';
  $('#set_term').value = s.term || 'الأول';

  $('#set_proxyUrl').value = s.proxyUrl || '';
  $('#set_proxyKey').value = s.proxyKey || '';
  $('#set_smsSender').value = s.smsSender || 'Mobile.SA';

  const c = Store.state.cloud;
  $('#set_cloudUrl').value = c.url || '';
  $('#set_userToken').value = c.token || '';

  updateCloudUI();
}

async function saveSettingsFromForm(){
  const s = {
    schoolName: $('#set_schoolName').value.trim() || 'ثانوية اليعقوبي',
    educationOffice: $('#set_educationOffice').value.trim() || 'الإدارة العامة للتعليم بالمنطقة الشرقية • قطاع التعليم بالخبر',
    hijriYear: $('#set_hijriYear').value.trim() || '1447',
    term: $('#set_term').value,
    proxyUrl: $('#set_proxyUrl').value.trim(),
    proxyKey: $('#set_proxyKey').value.trim(),
    smsSender: $('#set_smsSender').value.trim() || 'Mobile.SA'
  };

  await Store.saveSettings(s);

  // keep cloud inputs (do not auto-enable unless user presses connect)
  toast('تم حفظ الإعدادات');
}

// ---------------- Cloud sync UI
function updateCloudUI(){
  const c = Store.state.cloud;
  $('#cloud_status').value = c.enabled ? (c.connected ? 'متصل' : 'مفعّل') : 'غير متصل';
  $('#cloud_role').value = c.role || '—';
  $('#adminPanel').hidden = !(c.enabled && c.connected && c.role==='admin');
}

async function cloudConnect(){
  const url = $('#set_cloudUrl').value.trim();
  const token = $('#set_userToken').value.trim();
  if(!url || !token) return toast('أدخل Cloud URL والتوكن', false);

  await Store.setCloudConfig({url, token, enabled:true});

  try{
    await Store.whoami();
    updateCloudUI();
    toast('تم التحقق من التوكن');
    await syncNow(true);
    startAutoSync();
  }catch(e){
    updateCloudUI();
    toast(e?.message || 'تعذر الاتصال', false);
  }
}

async function cloudDisconnect(){
  await Store.disconnectCloud();
  stopAutoSync();
  updateCloudUI();
  toast('تم فصل المزامنة');
}

async function syncNow(silent=false){
  if(!Store.state.cloud.enabled) return toast('المزامنة غير مفعلة', false);
  if(syncInFlight) return;
  syncInFlight = true;
  try{
    const res = await Store.syncNow();
    if(!silent) toast(`تمت المزامنة • رفع ${res.pushed||0} • تنزيل ${res.pulled||0}`);
    updateCloudUI();
  }catch(e){
    if(!silent) toast(e?.message || 'فشل المزامنة', false);
  }finally{
    syncInFlight = false;
  }
}

function startAutoSync(){
  stopAutoSync();
  if(!Store.state.cloud.enabled) return;
  syncTimer = setInterval(()=>{
    if(navigator.onLine) syncNow(true);
  }, 45000);
}

function stopAutoSync(){
  if(syncTimer){ clearInterval(syncTimer); syncTimer=null; }
}

async function maybeAutoSync(){
  if(Store.state.cloud.enabled && Store.state.cloud.connected && navigator.onLine){
    // do a light sync soon
    setTimeout(()=>syncNow(true), 350);
  }
}

// ---------------- Admin endpoints
async function adminFetch(path, method='GET', body=null){
  const c = Store.state.cloud;
  if(!c.enabled || !c.url) throw new Error('فعّل المزامنة أولًا');
  const url = c.url.replace(/\/$/, '') + path;
  const headers = {
    'Accept': 'application/json',
    ...Store.cloudHeaders()
  };
  if(body) headers['Content-Type']='application/json';
  const res = await fetch(url, {method, headers, body: body?JSON.stringify(body):undefined});
  const js = await res.json().catch(()=>null);
  if(!res.ok || !js?.ok) throw new Error(js?.error || `HTTP ${res.status}`);
  return js;
}

async function adminCreateUser(){
  const name = $('#admin_newUserName').value.trim();
  const role = $('#admin_newUserRole').value;
  if(!name) return toast('اكتب اسم المستخدم', false);

  try{
    const js = await adminFetch('/admin/users/create','POST',{name, role});
    const token = js.token;
    await adminRefreshUsers(true);

    // show token (one-time)
    $('#admin_newUserName').value='';
    const out = `تم إنشاء توكن للمستخدم: ${name}\nالصلاحية: ${role}\n\nTOKEN:\n${token}`;
    try{ await navigator.clipboard.writeText(token); toast('تم نسخ التوكن'); }catch{ toast('تم إنشاء التوكن'); }
    alert(out);
  }catch(e){
    toast(e.message || 'تعذر الإنشاء', false);
  }
}

async function adminRefreshUsers(silent=false){
  try{
    const js = await adminFetch('/admin/users/list','GET');
    const users = js.users || [];
    const box = $('#admin_usersList');
    if(!users.length){ box.innerHTML = '<div class="small">لا يوجد مستخدمون.</div>'; return; }
    box.innerHTML = `
      <div class="small" style="margin-bottom:8px">عدد المستخدمين: <b>${users.length}</b></div>
      <div class="table">
        <div class="tr th"><div>الاسم</div><div>الدور</div><div>الحالة</div><div>تاريخ</div></div>
        ${users.map(u=>`
          <div class="tr"><div>${escapeHTML(u.name||'')}</div><div>${escapeHTML(u.role||'')}</div><div>${u.active?'<b>نشط</b>':'موقوف'}</div><div>${escapeHTML(String(u.created_at||'').slice(0,10))}</div></div>
        `).join('')}
      </div>
      <div class="small" style="margin-top:8px;color:var(--muted)">إيقاف المستخدم يتم من لوحة المشرف داخل Worker أو بإضافة زر لاحقًا.</div>
    `;
    if(!silent) toast('تم تحديث قائمة المستخدمين');
  }catch(e){
    if(!silent) toast(e.message || 'تعذر التحديث', false);
  }
}

// ---------------- Student modal CRUD
function openStudentForm(student=null){
  const m = $('#modalStudent');
  editingNid = student ? String(student.nid) : null;

  $('#mTitle').textContent = student ? 'تعديل بيانات الطالب' : 'إضافة طالب';
  $('#mHint').textContent = student ? 'عدّل الحقول ثم احفظ' : 'أدخل بيانات الطالب ثم احفظ';

  $('#stu_name').value = student?.name || '';
  $('#stu_nid').value = student?.nid || '';
  $('#stu_phone').value = student?.phone || '';
  $('#stu_grade').value = student?.grade || '';
  $('#stu_section').value = student?.section || '';

  m.hidden = false;
  $('#stu_name').focus();
}

function closeStudentForm(){
  $('#modalStudent').hidden = true;
  editingNid = null;
}

function sanitizeDigits(s){
  return String(s||'').replace(/\D+/g,'');
}

async function saveStudentForm(){
  const name = $('#stu_name').value.trim();
  const nid = sanitizeDigits($('#stu_nid').value);
  const phoneRaw = $('#stu_phone').value.trim();
  const grade = $('#stu_grade').value.trim();
  const section = $('#stu_section').value.trim();

  if(!name) return toast('اسم الطالب مطلوب', false);
  if(!nid || nid.length!==10) return toast('رقم الهوية يجب أن يكون 10 أرقام', false);

  // phone optional
  let phone = phoneRaw.replace(/\s+/g,'');
  if(phone && !/^\+?\d{9,15}$/.test(phone.replace(/^\+/,''))){
    // allow 05xxxxxxxx
    if(!/^05\d{8}$/.test(phone)) return toast('رقم الجوال غير صحيح', false);
  }

  // role guard: if cloud enabled and role is staff, allow add/edit ONLY (no bulk import)
  const st = {
    name,
    nid,
    phone,
    grade,
    section
  };

  // if editing and nid changed: delete old
  if(editingNid && editingNid!==nid){
    await Store.deleteStudent(editingNid);
  }

  await Store.upsertStudent(st);
  toast('تم حفظ بيانات الطالب');
  closeStudentForm();
  selectStudentByNid(nid);
  refreshFilters();
  await maybeAutoSync();
}

async function deleteStudent(nid){
  const student = Store.state.students.find(s=>String(s.nid)===String(nid));
  if(!student) return;
  if(!confirm(`حذف الطالب: ${student.name} ؟`)) return;
  await Store.deleteStudent(student.nid);
  if(selectedNid===String(student.nid)) selectedNid=null;
  toast('تم حذف الطالب');
  renderStudentCard(getSelectedStudent());
  renderLogs();
  refreshFilters();
  await maybeAutoSync();
}

// ---------------- CSV import / Backup
function parseCSV(text){
  const lines = text.replace(/\r/g,'').split('\n').filter(Boolean);
  if(!lines.length) return [];
  const header = splitCSVLine(lines[0]).map(h=>h.trim());
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const cols = splitCSVLine(lines[i]);
    if(!cols.length) continue;
    const obj={};
    header.forEach((h,idx)=>obj[h]=cols[idx]??'');
    rows.push(obj);
  }
  return rows;
}
function splitCSVLine(line){
  const out=[]; let cur=''; let q=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(q && line[i+1]==='"'){ cur+='"'; i++; }
      else q=!q;
      continue;
    }
    if(ch===',' && !q){ out.push(cur); cur=''; continue; }
    cur+=ch;
  }
  out.push(cur);
  return out;
}

function mapStudentsFromRows(rows){
  const find = (obj, keys)=>{
    for(const k of Object.keys(obj)){
      const nk=k.replace(/\s+/g,'').toLowerCase();
      if(keys.includes(nk)) return obj[k];
    }
    return '';
  };

  return rows.map(r=>{
    const name = find(r, ['اسمالطالب','الاسم','studentname','name']).trim();
    const nid = sanitizeDigits(find(r, ['رقمالطالب','رقمالهوية','الهوية','nid','nationalid','id']));
    const phone = (find(r, ['الجوال','رقمالجوال','phone','mobile']).trim());
    const grade = find(r, ['رقمالصف','الصف','grade']).trim();
    const section = find(r, ['الفصل','الشعبة','section','class']).trim();
    if(!name || !nid) return null;
    return {name, nid, phone, grade, section};
  }).filter(Boolean);
}

async function importStudentsCSV(file){
  // guard when cloud enabled (to avoid overriding others)
  const c = Store.state.cloud;
  if(c.enabled && c.connected && c.role!=='admin'){
    return toast('استيراد الطلاب متاح للمشرف فقط عند تفعيل السحابة', false);
  }

  const text = await file.text();
  const rows = parseCSV(text);
  const list = mapStudentsFromRows(rows);
  if(!list.length) throw new Error('لم يتم التعرف على الأعمدة. تأكد أن CSV يحتوي: اسم الطالب، رقم الطالب/الهوية، الجوال، رقم الصف، الفصل');

  await Store.setStudents(list);
  refreshFilters();
  toast(`تم استيراد ${list.length} طالب`);
  await maybeAutoSync();
}

async function exportBackup(){
  const data = Store.exportBackup();
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download = `alyaqubi-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

async function importBackup(file){
  const c = Store.state.cloud;
  if(c.enabled && c.connected && c.role!=='admin'){
    return toast('استيراد النسخة الاحتياطية متاح للمشرف فقط عند تفعيل السحابة', false);
  }
  const obj = JSON.parse(await file.text());
  await Store.importBackup(obj);
  refreshFilters();
  toast('تم استيراد النسخة الاحتياطية');
  await maybeAutoSync();
}

async function clearAll(){
  if(!confirm('سيتم حذف جميع البيانات من هذا الجهاز. هل أنت متأكد؟')) return;
  await Store.clearAll();
  selectedNid = null;
  renderStudentCard(null);
  renderLogs();
  refreshFilters();
  toast('تم مسح البيانات');
}

function refreshFilters(){
  const grades = Array.from(new Set(Store.state.students.map(s=>String(s.grade||'')).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ar'));
  const sections = Array.from(new Set(Store.state.students.map(s=>String(s.section||'')).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ar'));
  $('#sheet_grade').innerHTML = `<option value="">كل الصفوف</option>` + grades.map(g=>`<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join('');
  $('#sheet_section').innerHTML = `<option value="">كل الشعب</option>` + sections.map(sec=>`<option value="${escapeHTML(sec)}">${escapeHTML(sec)}</option>`).join('');

  $('#stats_students').textContent = String(Store.state.students.length||0);
  $('#stats_logs').textContent = String(Store.state.logs.length||0);
}

// ---------------- SMS
async function sendSMSForSelected(){
  const student = getSelectedStudent();
  if(!student) return toast('اختر طالبًا أولًا', false);

  const phone = (student.phone||'').trim();
  if(!phone) return toast('لا يوجد رقم جوال مسجل', false);

  const s = Store.state.settings;
  if(!s.proxyUrl || !s.proxyKey) return toast('أكمل إعدادات SMS في صفحة الإعدادات', false);

  const body = $('#sms_body').value.trim() || `نفيدكم بتسجيل ${todayAr()} للطالب ${student.name}. نأمل المتابعة.`;

  let number = phone;
  if(number.startsWith('05')) number = '966' + number.slice(1);
  if(number.startsWith('5') && number.length===9) number = '966' + number;
  number = number.replace(/^\+/, '');

  $('#btnSendSMS').disabled = true;
  try{
    await sendSMS({
      proxyUrl: s.proxyUrl,
      proxyKey: s.proxyKey,
      number,
      senderName: s.smsSender,
      messageBody: body
    });

    await Store.addLog({
      type:'SMS',
      nid: student.nid,
      name: student.name,
      grade: student.grade,
      section: student.section,
      note: `SMS: ${body}`,
      by: $('#actor').value.trim()
    });

    toast('تم إرسال الرسالة');
    renderLogs();
    await maybeAutoSync();
  }catch(e){
    toast(e?.message || 'فشل الإرسال', false);
  }finally{
    $('#btnSendSMS').disabled = false;
  }
}

// ---------------- Defaults
async function ensureDefaultStudents(){
  if(Store.state.students.length) return;
  try{
    const res = await fetch('assets/students_default.json');
    if(!res.ok) return;
    const data = await res.json();
    if(Array.isArray(data) && data.length){
      await Store.setStudents(data);
      refreshFilters();
    }
  }catch{ /* ignore */ }
}

// ---------------- Events
function bindEvents(){
  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const act = btn.dataset.action;

    try{
      if(act==='tab') return setTab(btn.dataset.tab);
      if(act==='select-student') return selectStudentByNid(btn.dataset.nid);

      if(act==='open-student-form') return openStudentForm(null);
      if(act==='edit-student'){
        const nid = btn.dataset.nid || selectedNid;
        if(!nid) return toast('اختر طالبًا أولًا', false);
        const st = Store.state.students.find(s=>String(s.nid)===String(nid));
        return openStudentForm(st||null);
      }
      if(act==='delete-student'){
        const nid = btn.dataset.nid || selectedNid;
        if(!nid) return toast('اختر طالبًا أولًا', false);
        return await deleteStudent(nid);
      }
      if(act==='close-student-form') return closeStudentForm();
      if(act==='save-student-form') return await saveStudentForm();

      if(act==='add-late') return await addAttendance('LATE');
      if(act==='add-absent') return await addAttendance('ABSENT');
      if(act==='add-behavior') return await addBehavior();

      if(act==='print-late-sheet') return await printSheet('LATE');
      if(act==='print-abs-sheet') return await printSheet('ABSENT');
      if(act==='print-entry-card') return await printEntryCard('ENTRY');
      if(act==='print-behavior-card') return await printEntryCard('BEHAVIOR');

      if(act==='save-settings') return await saveSettingsFromForm();

      if(act==='cloud-connect') return await cloudConnect();
      if(act==='cloud-disconnect') return await cloudDisconnect();
      if(act==='sync-now') return await syncNow(false);
      if(act==='admin-create-user') return await adminCreateUser();
      if(act==='admin-refresh-users') return await adminRefreshUsers(false);

      if(act==='export-backup') return await exportBackup();
      if(act==='import-backup') return $('#backupFile').click();
      if(act==='clear-all') return await clearAll();

      if(act==='send-sms') return await sendSMSForSelected();
      if(act==='import-students') return $('#studentsFile').click();
    }catch(err){
      toast(err?.message || 'حدث خطأ', false);
    }
  });

  $('#q').addEventListener('input', ()=>{
    const q = $('#q').value.trim();
    if(q.length < 2){ $('#searchResults').innerHTML=''; return; }
    renderSearchResults(Store.searchStudents(q, 20));
  });

  $('#studentsFile').addEventListener('change', async (e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    try{ await importStudentsCSV(f); }catch(err){ toast(err.message||'فشل الاستيراد', false); }
    e.target.value='';
  });

  $('#backupFile').addEventListener('change', async (e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    try{ await importBackup(f); }catch(err){ toast('ملف النسخة غير صالح', false); }
    e.target.value='';
  });

  window.addEventListener('online', ()=>{ if(Store.state.cloud.enabled) syncNow(true); });
}

// ---------------- Init
async function init(){
  await Store.load();

  // Subscribe to Store changes
  Store.on(()=>{
    refreshFilters();
    hydrateSettingsForm();
    renderStudentCard(getSelectedStudent());
    renderLogs();
  });

  hydrateBehavior();
  bindEvents();

  // defaults
  $('#sheet_date').value = new Date().toISOString().slice(0,10);
  hydrateSettingsForm();
  refreshFilters();

  await ensureDefaultStudents();

  // If cloud is enabled, try whoami (silent)
  if(Store.state.cloud.enabled && Store.state.cloud.url && Store.state.cloud.token){
    try{ await Store.whoami(); updateCloudUI(); startAutoSync(); }catch{ updateCloudUI(); }
  }

  setTab('home');
  renderStudentCard(null);
  renderLogs();
}

document.addEventListener('DOMContentLoaded', init);
