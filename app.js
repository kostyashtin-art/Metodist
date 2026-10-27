(() => {
  "use strict";
  const state = { books: [], tasks: [], activePreview: null };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const number = (value) => new Intl.NumberFormat("ru-RU").format(value);
  const safeText = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));
  const toast = (message) => {
    const el = $("#toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
  };
  const sensitivePattern = /(паспорт|снилс|инн|карта|сч[её]т|реквизит|телефон|почт|email|e-mail|парол|password|логин|фио|фамил|имя родител|дата рождения|договор|адрес)/i;
  const categoryFor = (name) => {
    const s = name.toLowerCase();
    if (/отток|ушедш|выбыв/.test(s)) return "Отток";
    if (/распис|заняти|групп/.test(s)) return "Группы и расписание";
    if (/посещ|присутств/.test(s)) return "Посещаемость";
    if (/тьютор|сотруд|штат|преподав|зарплат/.test(s)) return "Сотрудники";
    if (/оплат|финанс|касс|счет|реквизит/.test(s)) return "Финансы";
    if (/модул|урок|обучен|проект/.test(s)) return "Обучение";
    if (/задач|план|мероприят|отчет|статист/.test(s)) return "Отчётность и задачи";
    return "Требует классификации";
  };
  const headerLooksSensitive = (headers, sheetName) =>
    sensitivePattern.test(sheetName) || headers.some(h => sensitivePattern.test(String(h ?? "")));
  const isSensitiveValue = (header) => sensitivePattern.test(String(header ?? ""));
  const maskValue = (value, header) => {
    if (value === null || value === undefined || value === "") return "";
    if (isSensitiveValue(header)) return "••••••";
    const s = String(value);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "••••@••••";
    if (/^\+?[\d\s()\-]{9,}$/.test(s)) return "••••••••";
    return s;
  };
  function setView(name) {
    $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
    $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    const titles = { overview:"Обзор", imports:"Импорт Excel", sheets:"Листы и данные", tasks:"Задачи и контроль" };
    $("#page-title").textContent = titles[name] || "Обзор";
  }
  function allSheets() { return state.books.flatMap(book => book.sheets.map(sheet => ({...sheet, fileName:book.name, bookId:book.id}))); }
  function updateDashboard() {
    const sheets = allSheets();
    $("#metric-files").textContent = number(state.books.length);
    $("#metric-sheets").textContent = number(sheets.length);
    $("#metric-rows").textContent = number(sheets.reduce((sum, s) => sum + Math.max(0, s.rows - 1), 0));
    $("#metric-review").textContent = number(sheets.filter(s => s.needsReview || s.sensitive).length);
    $("#last-import").textContent = state.books.length ? `Обновлено: ${new Date().toLocaleString("ru-RU")}` : "Файлы не загружены";
    $("#import-count").textContent = `${state.books.length} ${plural(state.books.length, "файл", "файла", "файлов")}`;
    renderRecent(); renderImports(); renderSheets(); renderTasks();
  }
  function plural(n, one, few, many) {
    const m10=n%10,m100=n%100;
    if(m10===1&&m100!==11)return one;
    if(m10>=2&&m10<=4&&(m100<12||m100>14))return few;
    return many;
  }
  function renderRecent() {
    const el = $("#recent-imports");
    if (!state.books.length) { el.className = "empty-state"; el.innerHTML = '<div class="empty-icon">⇧</div><strong>Пока нет загруженных файлов</strong><p>Загрузи «Елабуга.xlsx» и «Еженедельный отчет.xlsx».</p>'; return; }
    el.className = "table-wrap";
    el.innerHTML = `<table class="data-table"><thead><tr><th>Файл</th><th>Листы</th><th>Строки</th><th>Статус</th></tr></thead><tbody>${state.books.slice(-4).reverse().map(b=>`<tr><td class="file-name">${safeText(b.name)}</td><td>${number(b.sheets.length)}</td><td>${number(b.sheets.reduce((n,s)=>n+s.rows,0))}</td><td><span class="tag safe">Обработан</span></td></tr>`).join("")}</tbody></table>`;
  }
  function renderImports() {
    const el = $("#imports-list");
    if (!state.books.length) { el.innerHTML = '<div class="empty-state">Загруженных файлов пока нет.</div>'; return; }
    el.innerHTML = `<table class="data-table"><thead><tr><th>Имя файла</th><th>Размер</th><th>Листов</th><th>Время импорта</th><th></th></tr></thead><tbody>${state.books.map(b=>`<tr><td class="file-name">${safeText(b.name)}<span class="subtext">${safeText(b.type || "Excel")}</span></td><td>${(b.size/1024).toFixed(1)} КБ</td><td>${b.sheets.length}</td><td>${safeText(b.importedAt)}</td><td><button class="row-action" data-remove-book="${b.id}">Удалить</button></td></tr>`).join("")}</tbody></table>`;
  }
  function renderSheets() {
    const el = $("#sheets-table"); const search = ($("#sheet-search")?.value || "").toLowerCase(); const filter = $("#risk-filter")?.value || "all";
    const rows = allSheets().filter(s => `${s.fileName} ${s.name} ${s.category}`.toLowerCase().includes(search))
      .filter(s => filter==="all" || (filter==="review" && s.needsReview) || (filter==="sensitive" && s.sensitive));
    $("#export-inventory").disabled = !rows.length;
    if (!rows.length) { el.innerHTML = `<div class="empty-state">${state.books.length ? "По заданным фильтрам ничего не найдено." : "Сначала загрузи Excel-файлы."}</div>`; return; }
    el.innerHTML = `<table class="data-table"><thead><tr><th>Файл / лист</th><th>Категория</th><th>Размер</th><th>Проверка</th><th></th></tr></thead><tbody>${rows.map(s=>`<tr><td class="file-name">${safeText(s.name)}<span class="subtext">${safeText(s.fileName)}</span></td><td>${safeText(s.category)}</td><td>${number(s.rows)} строк × ${number(s.cols)} столб.</td><td>${s.sensitive?'<span class="tag danger">Возможны чувствительные данные</span>':s.needsReview?'<span class="tag warning">Проверить заголовки</span>':'<span class="tag safe">Базовая проверка</span>'}</td><td><button class="row-action" data-preview="${s.bookId}::${encodeURIComponent(s.name)}">Просмотр</button></td></tr>`).join("")}</tbody></table>`;
  }
  function renderPreview(bookId, encodedName) {
    const name = decodeURIComponent(encodedName);
    const book = state.books.find(b=>b.id===bookId); const sheet = book?.sheets.find(s=>s.name===name);
    if (!sheet) return;
    state.activePreview = {bookId, name};
    $("#preview-title").textContent = `${book.name} · ${name}`;
    const data = sheet.data.slice(0, 8);
    if (!data.length) { $("#preview-content").innerHTML = '<div class="empty-state">Лист пустой.</div>'; }
    else {
      const width = Math.min(10, Math.max(...data.map(r=>r.length), 1));
      const headers = Array.from({length:width}, (_,i)=>String(data[0]?.[i] ?? `Столбец ${i+1}`));
      const body = data.slice(1,8);
      $("#preview-content").innerHTML = `<table class="data-table"><thead><tr>${headers.map(h=>`<th>${safeText(h)}</th>`).join("")}</tr></thead><tbody>${body.map(row=>`<tr>${headers.map((h,i)=>`<td>${safeText(maskValue(row[i],h))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    $("#sheet-preview").classList.remove("hidden");
    $("#sheet-preview").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function renderTasks() {
    const el = $("#tasks-list");
    if (!state.tasks.length) { el.innerHTML = '<div class="task-empty">Задач пока нет. Добавь первую задачу выше.</div>'; return; }
    el.innerHTML = state.tasks.map(t=>`<div class="task-item ${t.done?"done":""}"><input type="checkbox" data-task-toggle="${t.id}" ${t.done?"checked":""} aria-label="Отметить выполненной"><div class="task-copy"><strong>${safeText(t.title)}</strong><small>${t.date?`Срок: ${safeText(t.date)}`:"Без срока"} · ${safeText(t.priority)}</small></div>${t.priority==="Высокий"?'<span class="tag warning">Высокий</span>':""}<button class="delete-task" data-task-delete="${t.id}" aria-label="Удалить задачу">×</button></div>`).join("");
  }
  async function readFile(file) {
    const id = `book-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const ext = file.name.split(".").pop().toLowerCase();
    let sheets = [];
    if (ext === "csv") {
      const text = await file.text();
      const rows = parseCSV(text);
      sheets = [makeSheet("Данные", rows)];
    } else {
      if (!window.XLSX) throw new Error("Не удалось загрузить библиотеку чтения Excel. Проверь интернет-соединение и обнови страницу.");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {type:"array", cellDates:true, dense:false});
      sheets = workbook.SheetNames.map(name => {
        const ws = workbook.Sheets[name];
        const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:"", raw:false, blankrows:false});
        return makeSheet(name, data);
      });
    }
    return {id,name:file.name,size:file.size,type:ext.toUpperCase(),importedAt:new Date().toLocaleString("ru-RU"),sheets};
  }
  function makeSheet(name, data) {
    const nonempty = data.filter(row => row.some(cell => String(cell ?? "").trim() !== ""));
    const headers = (nonempty[0] || []).map(v=>String(v ?? ""));
    const sensitive = headerLooksSensitive(headers, name);
    const rows = nonempty.length, cols = Math.max(0,...nonempty.map(r=>r.length));
    return {name, data:nonempty, rows, cols, category:categoryFor(name), sensitive, needsReview: !headers.length || headers.filter(Boolean).length < Math.min(3, cols) || categoryFor(name)==="Требует классификации"};
  }
  function parseCSV(text) {
    const rows=[]; let row=[], cell="", quote=false;
    for(let i=0;i<text.length;i++){
      const c=text[i], next=text[i+1];
      if(c==='"'&&quote&&next==='"'){cell+='"';i++;}
      else if(c==='"') quote=!quote;
      else if(c===","&&!quote){row.push(cell);cell="";}
      else if((c==="\n"||c==="\r")&&!quote){if(c==="\r"&&next==="\n")i++;row.push(cell);if(row.some(v=>v!==""))rows.push(row);row=[];cell="";}
      else cell+=c;
    }
    row.push(cell);if(row.some(v=>v!==""))rows.push(row);return rows;
  }
  async function handleFiles(files) {
    if (!files?.length) return;
    let loaded=0;
    for (const file of files) {
      try {
        const book = await readFile(file);
        state.books.push(book); loaded++;
      } catch (err) { toast(`${file.name}: ${err.message || "не удалось прочитать файл"}`); }
    }
    updateDashboard();
    if (loaded) { toast(`Обработано файлов: ${loaded}`); setView("sheets"); }
  }
  function exportCSV() {
    const rows = [["Файл","Лист","Категория","Строк","Столбцов","Чувствительные данные?","Требует проверки?"]];
    allSheets().forEach(s=>rows.push([s.fileName,s.name,s.category,s.rows,s.cols,s.sensitive?"Да":"Нет",s.needsReview?"Да":"Нет"]));
    const csv = "\uFEFF"+rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\r\n");
    downloadBlob(csv,"karta-listov.csv","text/csv;charset=utf-8");
  }
  function downloadBlob(content, name, type) {
    const blob = new Blob([content], {type}); const url = URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }
  function bind() {
    $$(".nav-item").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
    $$("[data-goto]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.goto)));
    $("#top-import").addEventListener("click",()=>setView("imports"));
    $("#welcome-import").addEventListener("click",()=>setView("imports"));
    $("#dropzone").addEventListener("click",e=>{if(e.target.id!=="file-input")$("#file-input").click();});
    $("#file-input").addEventListener("change",e=>{handleFiles([...e.target.files]);e.target.value="";});
    const dz=$("#dropzone");
    ["dragenter","dragover"].forEach(evt=>dz.addEventListener(evt,e=>{e.preventDefault();dz.classList.add("dragover");}));
    ["dragleave","drop"].forEach(evt=>dz.addEventListener(evt,e=>{e.preventDefault();dz.classList.remove("dragover");}));
    dz.addEventListener("drop",e=>handleFiles([...e.dataTransfer.files].filter(f=>/\.(xlsx|xls|csv)$/i.test(f.name))));
    $("#clear-imports").addEventListener("click",()=>{state.books=[];state.activePreview=null;$("#sheet-preview").classList.add("hidden");updateDashboard();toast("Импортированные данные очищены из текущей сессии.");});
    $("#sheet-search").addEventListener("input",renderSheets);$("#risk-filter").addEventListener("change",renderSheets);
    $("#export-inventory").addEventListener("click",exportCSV);
    $("#close-preview").addEventListener("click",()=>$("#sheet-preview").classList.add("hidden"));
    $("#task-form").addEventListener("submit",e=>{e.preventDefault();const title=$("#task-title").value.trim();if(!title)return;state.tasks.unshift({id:Date.now(),title,date:$("#task-date").value,priority:$("#task-priority").value,done:false});$("#task-title").value="";renderTasks();toast("Задача добавлена.");});
    document.addEventListener("click",e=>{
      const preview=e.target.closest("[data-preview]");
      if(preview){const [id,name]=preview.dataset.preview.split("::");renderPreview(id,name);return;}
      const remove=e.target.closest("[data-remove-book]");
      if(remove){state.books=state.books.filter(b=>b.id!==remove.dataset.removeBook);updateDashboard();toast("Файл удалён из текущей сессии.");return;}
      const del=e.target.closest("[data-task-delete]");
      if(del){state.tasks=state.tasks.filter(t=>String(t.id)!==del.dataset.taskDelete);renderTasks();return;}
    });
    document.addEventListener("change",e=>{const toggle=e.target.closest("[data-task-toggle]");if(toggle){const task=state.tasks.find(t=>String(t.id)===toggle.dataset.taskToggle);if(task)task.done=toggle.checked;renderTasks();}});
  }
  bind(); updateDashboard();
})();