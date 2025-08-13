(() => {
  const listEl = document.getElementById("list");
  const formEl = document.getElementById("newTaskForm");
  const taskInput = document.getElementById("taskInput");
  const dueInput = document.getElementById("dueInput");
  const priorityInput = document.getElementById("priorityInput");
  const searchEl = document.getElementById("search");
  const sortEl = document.getElementById("sort");
  const controlsToggle = document.getElementById("controlsToggle");
  const controls = document.getElementById("toolbarControls");

  dueInput.addEventListener("focus", () => {
    if (typeof dueInput.showPicker === "function") {
      setTimeout(() => { try { dueInput.showPicker(); } catch {} }, 10);
    }
  });
  controlsToggle.addEventListener("click", () => {
    const collapsed = controls.classList.toggle("collapsed");
    controlsToggle.setAttribute("aria-expanded", String(!collapsed));
  });

  const clearCompletedBtn = document.getElementById("clearCompleted");
  const wipeAllBtn = document.getElementById("wipeAll");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const filePicker = document.getElementById("filePicker");
  const template = document.getElementById("itemTemplate");

  const STORAGE_KEY = "pro_todo_v1";
  /** @type {Array<{id:string,title:string,completed:boolean,created:number,due?:string,priority:'low'|'med'|'high',order?:number}>} */
  let tasks = [];
  let filter = "all";

  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  const load = () => {
    try { tasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { tasks = []; }
  };
  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined,{ year:"numeric", month:"short", day:"numeric" }).format(d);
  };
  const shortDate = (iso) => {
    if (!iso) return "";
    const target = new Date(iso + 'T00:00:00');
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.round((target - startToday) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays > 1 && diffDays < 7) return target.toLocaleDateString(undefined,{ weekday:'short'});
    const sameYear = target.getFullYear() === today.getFullYear();
    return target.toLocaleDateString(undefined,{ day:'numeric', month:'short', ...(sameYear?{}:{ year:'2-digit'}) });
  };
  const isCompact = () => window.matchMedia('(max-width:560px)').matches;
  let lastCompact = isCompact();

  const priScore = (p) => (p === 'high' ? 3 : p === 'med' ? 2 : 1);
  const compare = {
    createdDesc:(a,b)=>b.created-a.created,
    createdAsc:(a,b)=>a.created-b.created,
    dueAsc:(a,b)=>(a.due?new Date(a.due).getTime():Infinity)-(b.due?new Date(b.due).getTime():Infinity),
    priorityDesc:(a,b)=>priScore(b.priority)-priScore(a.priority),
    manual:(a,b)=>(a.order??0)-(b.order??0),
  };

  function render(){
    const q = searchEl.value.trim().toLowerCase();
    const sort = sortEl.value;
    const filtered = tasks.filter(t=>{
      if (filter==='active' && t.completed) return false;
      if (filter==='completed' && !t.completed) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    }).sort(compare[sort]);
    listEl.innerHTML='';
    for (const t of filtered) listEl.appendChild(renderItem(t));
  }

  function renderItem(task){
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = task.id;
    node.classList.toggle('completed', task.completed);
    const toggle = node.querySelector('.toggle');
    const title = node.querySelector('.title');
    const meta = node.querySelector('.meta');
    const del = node.querySelector('.delete');
    const edit = node.querySelector('.edit');
    const handle = node.querySelector('.handle');

    toggle.checked = task.completed;
    title.textContent = task.title;
    meta.innerHTML='';
    const pri = document.createElement('span');
    pri.className='badge';
    pri.innerHTML = `<span class="priority ${task.priority==='high'?'p-high':task.priority==='med'?'p-med':'p-low'}"></span>${task.priority[0].toUpperCase()+task.priority.slice(1)}`;
    meta.appendChild(pri);
    meta.appendChild(buildDueBadge(task));

    toggle.addEventListener('change',()=>{ task.completed=toggle.checked; save(); render(); });
    del.addEventListener('click',()=>{ tasks = tasks.filter(x=>x.id!==task.id); save(); render(); });
    const startEdit = ()=> startEditTitle(title, task);
    edit.addEventListener('click', startEdit);
    title.addEventListener('dblclick', startEdit);

    handle.addEventListener('pointerdown', ()=>{ node.setAttribute('draggable','true'); });
    window.addEventListener('pointerup', ()=>{ node.setAttribute('draggable','false'); }, { once:true });

    node.addEventListener('dragstart', e => {
      node.classList.add('dragging');
      if (e.dataTransfer){ try { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed='move'; } catch {} }
    });
    node.addEventListener('dragend', ()=>{
      node.classList.remove('dragging');
      listEl.querySelectorAll('.item').forEach(li=>li.classList.remove('insert-before'));
    });
    return node;
  }

  function startEditTitle(titleEl, task){
    titleEl.setAttribute('contenteditable','true');
    titleEl.focus();
    const sel = window.getSelection();
    const r = document.createRange(); r.selectNodeContents(titleEl); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
    const finish = () => {
      titleEl.removeAttribute('contenteditable');
      const newVal = titleEl.textContent.trim();
      if (newVal) { task.title=newVal; save(); render(); } else { titleEl.textContent = task.title; }
      document.removeEventListener('keydown', onKey); titleEl.removeEventListener('blur', finish);
    };
    const onKey = e => { if (e.key==='Enter'){ e.preventDefault(); finish(); } if (e.key==='Escape'){ titleEl.textContent=task.title; finish(); } };
    document.addEventListener('keydown', onKey); titleEl.addEventListener('blur', finish);
  }

  function buildDueBadge(task){
    const due = document.createElement('span');
    due.className = `badge due-edit${task.due? ' due':''}`;
    due.tabIndex = 0; due.setAttribute('role','button');
    due.setAttribute('aria-label', task.due? 'Edit due date':'Add due date');
    due.style.cursor='pointer';
    if (task.due) due.textContent = isCompact()? shortDate(task.due):`Due ${fmtDate(task.due)}`; else due.textContent = isCompact()? '+ Due': '+ Due date';
    const activate = ()=> startDueEdit(due, task);
    due.addEventListener('click', activate);
    due.addEventListener('keydown', e=>{ if (e.key==='Enter'||e.key===' '){ e.preventDefault(); activate(); } });
    return due;
  }

  function startDueEdit(el, task){
    const input = document.createElement('input');
    input.type='date'; input.value = task.due || ''; input.className='badge'; input.style.padding='4px 8px'; input.setAttribute('aria-label','Select due date');
    el.replaceWith(input); input.focus();
    if (typeof input.showPicker === 'function'){ setTimeout(()=>{ try { input.showPicker(); } catch {} }, 10); }
    const saveDue = ()=>{ const val = input.value.trim(); task.due = val || undefined; save(); render(); };
    const cancel = ()=>{ render(); };
    input.addEventListener('change', saveDue);
    input.addEventListener('blur', saveDue);
    input.addEventListener('keydown', e=>{ if (e.key==='Enter'){ e.preventDefault(); saveDue(); } else if (e.key==='Escape'){ e.preventDefault(); cancel(); }});
  }

  listEl.addEventListener('dragover', e => {
    e.preventDefault();
    const after = getDragAfterElement(listEl, e.clientY);
    const dragging = document.querySelector('.item.dragging');
    if (!dragging) return;
    listEl.querySelectorAll('.item').forEach(li=>li.classList.remove('insert-before'));
    if (after == null){ listEl.appendChild(dragging); } else { after.classList.add('insert-before'); listEl.insertBefore(dragging, after); }
  });
  listEl.addEventListener('drop', e => {
    e.preventDefault();
    listEl.querySelectorAll('.item').forEach(li=>li.classList.remove('insert-before'));
    const ids = Array.from(listEl.children).map(li=>li.dataset.id);
    ids.forEach((id, idx)=>{ const t = tasks.find(x=>x.id===id); if (t) t.order = idx+1; });
    if (sortEl.value !== 'manual') sortEl.value = 'manual';
    save(); render();
  });
  function getDragAfterElement(container,y){
    const els = [...container.querySelectorAll('.item:not(.dragging)')];
    return els.reduce((closest,child)=>{ const box = child.getBoundingClientRect(); const offset = y - box.top - box.height/2; if (offset < 0 && offset > closest.offset){ return { offset, element: child }; } else return closest; }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  formEl.addEventListener('submit', e => {
    e.preventDefault();
    const title = taskInput.value.trim(); if (!title) return;
    addTask({ title, due: dueInput.value || undefined, priority: /** @type any */ (priorityInput.value) });
    formEl.reset(); render();
  });
  function nextOrder(){ return tasks.length ? Math.max(...tasks.map(t=>t.order ?? 0)) + 1 : 1; }
  function addTask({ title, due, priority = 'med', completed = false }){
    const task = { id: uid(), title, completed, created: Date.now(), due, priority, order: nextOrder() };
    tasks.unshift(task); save(); return task;
  }

  document.querySelectorAll('.filters .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filters .chip').forEach(b=>b.setAttribute('aria-pressed','false'));
      btn.setAttribute('aria-pressed','true');
      filter = btn.dataset.filter; render();
    });
  });

  searchEl.addEventListener('input', render);
  sortEl.addEventListener('change', render);
  clearCompletedBtn.addEventListener('click', ()=>{ tasks = tasks.filter(t=>!t.completed); save(); render(); });
  wipeAllBtn.addEventListener('click', ()=>{ if (confirm('Delete ALL tasks? This cannot be undone.')){ tasks = []; save(); render(); } });

  window.addEventListener('resize', ()=>{ const c = isCompact(); if (c !== lastCompact){ lastCompact = c; render(); } });
  document.addEventListener('keydown', e => { if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); searchEl.focus(); } });

  function applyImportedData(data){
    if (!Array.isArray(data)) throw new Error('Invalid JSON format');
    tasks = data.filter(x=>x && typeof x.title==='string').map(x=>({
      id: x.id || uid(),
      title: String(x.title),
      completed: !!x.completed,
      created: Number(x.created) || Date.now(),
      due: x.due || undefined,
      priority: (x.priority === 'high' || x.priority === 'med') ? x.priority : 'low'
    }));
    save(); render(); return tasks.length;
  }

  exportBtn.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(tasks,null,2)], { type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href:url, download:`pro-todo-${new Date().toISOString().slice(0,10)}.json` });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
  });
  importBtn.addEventListener('click', ()=> filePicker.click());
  filePicker.addEventListener('change', async ()=>{
    const file = filePicker.files?.[0]; if (!file) return;
    try { const text = await file.text(); const data = JSON.parse(text); applyImportedData(data); } catch(err){ alert('Failed to import: '+err); }
    filePicker.value='';
  });

  load(); render();
})();
