"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Copy, Download, Plus, Trash2, X } from "lucide-react";
import { DAYS, SHORT_DAYS, emptyStore } from "@/lib/data";
import type { Activity, Plan, Store } from "@/lib/types";
import { SegmentPlanner } from "@/components/segment-planner";

const KEY = "sema-planner-v1";
const PALETTE = ["#818cf8", "#34d399", "#facc15", "#f87171", "#22d3ee", "#f472b6", "#2dd4bf", "#fb923c", "#a78bfa", "#a3e635"];
const colorCls = ["color-0", "color-1", "color-2", "color-3", "color-4", "color-5", "color-6", "color-7", "color-8", "color-9"];
type VirtualBlock = Activity & { activityId: string; portion: "full" | "first" | "second"; originalStart: number; originalDuration: number; originalDay: number };
const t = { weeks:"Mis semanas", add:"Agregar actividad", loading:"Cargando tu semana…", newWeek:"Nueva semana", blank:"Semana vacía", copyWeek:"Copiar semana actual", create:"Crear semana", cancel:"Cancelar", weekName:"Nombre de la semana", blocks:"bloques", active:"Activa", edit:"Editar actividad", custom:"Nueva actividad", name:"Nombre", start:"Inicio", duration:"Duración", save:"Guardar", remove:"Eliminar", days:"Días", drag:"Arrastrá para mover · tirá del borde inferior para agrandar", removeThis:"Eliminar solo esta", removeAllName:"Eliminar todas", removeAllNameTime:"Eliminar todas a esta hora" };
const activityNames: Record<string, string> = { Sleep:"Sueño", Exercise:"Ejercicio", "Friends & family":"Amigos y familia", "Creative time":"Tiempo creativo", Lectura:"Lectura" };
const cn = (...v: (string | false | undefined)[]) => v.filter(Boolean).join(" ");
const snap = (n: number) => Math.round(n / 15) * 15;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const plannedMinutes = (a: Activity) => (a.segments ?? []).reduce((end, segment) => Math.max(end, segment.start + segment.duration), 0);
const boundActivity = (a: Activity): Activity => { const day = clamp(a.day, 0, 6); const minimum = Math.max(15, plannedMinutes(a)); const start = clamp(a.start, 0, day === 6 ? 1440 - minimum : 1439); return { ...a, day, start, duration: clamp(a.duration, minimum, Math.min(1440, 10080 - day * 1440 - start)) }; };
const fmt = (m: number) => new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(2026, 0, 1, Math.floor(m / 60) % 24, m % 60));
const mins = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
const activityName = (name: string) => activityNames[name] ?? name;
const migrate = (raw: unknown): Store => {
  const incoming = raw as Partial<Store>;
  const s: Store = { ...emptyStore(), ...incoming, version: 2, preferences: { hintDismissed: incoming.preferences?.hintDismissed ?? false } };
  if (!s.plans.length) return emptyStore();
  s.plans = s.plans.map(plan => ({ ...plan, activities: plan.activities.map(activity => {
    if (!activity.segments) return activity;
    let end = 0;
    return { ...activity, segments: activity.segments.map(segment => {
      const positioned = { ...segment, id: segment.id ?? crypto.randomUUID(), start: segment.start ?? end };
      end = positioned.start + positioned.duration;
      return positioned;
    }) };
  }) }));
  if (!s.plans.some(p => p.id === s.activePlanId)) s.activePlanId = s.plans[0].id;
  return s;
};

function IconButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} aria-label={label} title={label} className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:border-primary hover:text-foreground">{children}</button>; }

function expand(act: Activity): VirtualBlock[] {
  if (act.start + act.duration <= 1440) return [{ ...act, activityId: act.id, portion: "full", originalStart: act.start, originalDuration: act.duration, originalDay: act.day }];
  const first: VirtualBlock = { ...act, activityId: act.id, duration: 1440 - act.start, portion: "first", originalStart: act.start, originalDuration: act.duration, originalDay: act.day };
  const overflow = act.start + act.duration - 1440;
  if (act.day === 6) return [first];
  const overflowDay = act.day + 1;
  const second: VirtualBlock = { ...act, activityId: act.id, id: `${act.id}-2`, day: overflowDay, start: 0, duration: overflow, portion: "second", originalStart: act.start, originalDuration: act.duration, originalDay: act.day };
  return [first, second];
}
function assignColumns(blocks: VirtualBlock[]): (VirtualBlock & { col: number; cols: number })[] {
  const byDay = new Map<number, (VirtualBlock & { col: number; cols: number })[]>();
  for (const b of blocks) { const arr = byDay.get(b.day) ?? []; arr.push({ ...b, col: 0, cols: 1 }); byDay.set(b.day, arr); }
  for (const dayBlocks of byDay.values()) {
    dayBlocks.sort((a, b) => a.start - b.start || a.duration - b.duration);
    const clusters: ((VirtualBlock & { col: number; cols: number })[])[] = [];
    for (const b of dayBlocks) {
      let placed = false;
      for (const cluster of clusters) { for (const c of cluster) { if (b.start < c.start + c.duration && c.start < b.start + b.duration) { cluster.push(b); placed = true; break; } } if (placed) break; }
      if (!placed) clusters.push([b]);
    }
    for (const cluster of clusters) {
      const columns: number[] = [];
      for (const b of cluster) { let c = 0; while (c < columns.length && columns[c] > b.start) c++; if (c === columns.length) columns.push(0); columns[c] = b.start + b.duration; b.col = c; }
      const numCols = columns.length; for (const b of cluster) b.cols = numCols;
    }
  }
  return Array.from(byDay.values()).flat();
}

export function PlannerApp() {
  const [store, setStore] = useState<Store>(emptyStore);
  const [ready, setReady] = useState(false);
  const [mobileDay, setMobileDay] = useState(0);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [initialDays, setInitialDays] = useState<number[]>([]);
  const [newWeek, setNewWeek] = useState(false);
  const [editingPlanName, setEditingPlanName] = useState(false);
  const [planNameInput, setPlanNameInput] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { const raw = localStorage.getItem(KEY); if (raw) setStore(migrate(JSON.parse(raw))); } catch {} setReady(true); }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(store)); }, [ready, store]);
  const plan = store.plans.find(p => p.id === store.activePlanId) ?? store.plans[0];
  const update = (fn: (s: Store) => Store) => setStore(fn);
  const updateActivities = (activities: Activity[]) => update(s => ({ ...s, plans: s.plans.map(p => p.id === plan.id ? { ...p, activities } : p) }));
  const saveActivity = (activity: Activity) => {
    const existing = plan.activities.some(a => a.id === activity.id);
    if (existing) updateActivities(plan.activities.map(a => a.id === activity.id ? activity : a));
    else updateActivities([...plan.activities, activity]);
  };
  const createPlan = (name: string, date: string, mode: "blank" | "copy") => { const id = crypto.randomUUID(); const p: Plan = { id, name: name || t.newWeek, weekOf: date || new Date().toLocaleDateString("es-AR", { month: "short", day: "numeric", year: "numeric" }), activities: mode === "copy" ? plan.activities.map(a => ({ ...a, id: crypto.randomUUID() })) : [] }; update(s => ({ ...s, activePlanId: id, plans: [...s.plans, p] })); setNewWeek(false); };
  const commitPlanName = () => { if (planNameInput.trim()) { update(s => ({ ...s, plans: s.plans.map(p => p.id === plan.id ? { ...p, name: planNameInput.trim() } : p) })); } setEditingPlanName(false); };
  if (!ready) return <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">{t.loading}</div>;
  return <main className="planner-shell flex h-dvh min-h-0 bg-background text-foreground">
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-3 md:px-5"><span className="text-xl font-semibold tracking-tight text-primary">sema</span></header>
      <PlannerView key={plan.id} plan={plan} store={store} setStore={setStore} mobileDay={mobileDay} setMobileDay={setMobileDay} save={saveActivity} edit={setEditing} setInitialDays={setInitialDays} onNewWeek={() => setNewWeek(true)} editingPlanName={editingPlanName} setEditingPlanName={setEditingPlanName} planNameInput={planNameInput} setPlanNameInput={setPlanNameInput} commitPlanName={commitPlanName} />
    </section>
    {editing && <EditActivity activity={editing} initialDays={initialDays} close={() => setEditing(null)} plan={plan} updateActivities={updateActivities} />}
    {newWeek && <NewWeekDialog close={() => setNewWeek(false)} create={createPlan} />}
    <PrintWeek plan={plan} />
  </main>;
}

function PlannerView({ plan, store, setStore, mobileDay, setMobileDay, save, edit, setInitialDays, onNewWeek, editingPlanName, setEditingPlanName, planNameInput, setPlanNameInput, commitPlanName }: { plan: Plan; store: Store; setStore: React.Dispatch<React.SetStateAction<Store>>; mobileDay: number; setMobileDay: (n: number) => void; save: (a: Activity) => void; edit: (a: Activity) => void; setInitialDays: (d: number[]) => void; onNewWeek: () => void; editingPlanName: boolean; setEditingPlanName: (b: boolean) => void; planNameInput: string; setPlanNameInput: (s: string) => void; commitPlanName: () => void }) {
  const hour = 48;
  const range = { start: 0, end: 1440 };
  const gridHeight = 24 * hour;
  const [isMobile, setIsMobile] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const mq = window.matchMedia("(max-width: 767px)"); setIsMobile(mq.matches); const h = (e: MediaQueryListEvent) => setIsMobile(e.matches); mq.addEventListener("change", h); return () => mq.removeEventListener("change", h); }, []);
  const [preview, setPreview] = useState<Activity | null>(null);
  const visible = assignColumns(plan.activities.map(a => preview?.id === a.id ? preview : a).filter(a => a.start + a.duration > range.start && a.start < range.end).flatMap(expand));
  const gridRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{ pointerId: number; x: number; y: number; lastX: number; lastY: number; scrollTop: number; width: number; activity: Activity; draft: Activity; portionDay: number; mobileDay: number; mode: "move" | "resize"; moved: boolean; loop: number | null } | null>(null);
  const [selection, setSelection] = useState<{ day: number; anchor: number; current: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selRef = useRef<{ pointerId: number; el: HTMLElement; x: number; y: number; lastY: number; day: number; started: boolean; timer: number | null; loop: number | null } | null>(null);
  const blockerRef = useRef<((e: TouchEvent) => void) | null>(null);
  useEffect(() => () => { const g = gestureRef.current; if (g?.loop != null) cancelAnimationFrame(g.loop); const s = selRef.current; if (s?.timer != null) clearTimeout(s.timer); if (s?.loop != null) cancelAnimationFrame(s.loop); }, []);
  const pointerToMinute = (e: React.PointerEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); return clamp(snap(range.start + (e.clientY - r.top) / r.height * (range.end - range.start)), range.start, range.end); };
  const finishSelection = () => { if (!selection) return; const start = Math.min(selection.anchor, selection.current); const duration = Math.max(15, Math.abs(selection.current - selection.anchor)); setInitialDays([selection.day]); edit(boundActivity({ id: crypto.randomUUID(), name: "", day: selection.day, start, duration, color: PALETTE[3], source: "custom" })); setSelection(null); };
  const armBlocker = () => { if (blockerRef.current || !scrollRef.current) return; const fn = (e: TouchEvent) => e.preventDefault(); blockerRef.current = fn; scrollRef.current.addEventListener("touchmove", fn, { passive: false }); };
  const releaseBlocker = () => { if (blockerRef.current && scrollRef.current) scrollRef.current.removeEventListener("touchmove", blockerRef.current); blockerRef.current = null; };
  const edgeScroll = (clientY: number) => { const el = scrollRef.current; if (!el) return; const r = el.getBoundingClientRect(); const zone = 64; const step = 26; if (clientY < r.top + zone) el.scrollTop = Math.max(0, el.scrollTop - step); else if (clientY > r.bottom - zone) el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + step); };
  const updateGesture = () => {
    const g = gestureRef.current; if (!g) return;
    const dy = snap((g.lastY - g.y + (scrollRef.current?.scrollTop ?? 0) - g.scrollTop) / hour * 60);
    const dx = g.lastX - g.x;
    if (!g.moved) { g.moved = Math.abs(dy) >= 15 || Math.abs(dx) > 20; if (!g.moved) return; }
    const original = g.activity; const absoluteStart = original.day * 1440 + original.start;
    if (g.mode === "resize") {
      g.draft = boundActivity({ ...original, duration: original.duration + dy });
      if (isMobile) setMobileDay(clamp(g.portionDay, g.draft.day, Math.floor((g.draft.day * 1440 + g.draft.start + g.draft.duration - 1) / 1440)));
    } else {
      const start = clamp(absoluteStart + Math.round(dx / g.width) * 1440 + dy, 0, 10080 - original.duration);
      g.draft = { ...original, day: Math.floor(start / 1440), start: start % 1440 };
      if (isMobile) setMobileDay(clamp(g.portionDay + g.draft.day - original.day, g.draft.day, Math.floor((start + original.duration - 1) / 1440)));
    }
    setPreview(g.draft);
  };
  const blockDown = (e: React.PointerEvent<HTMLButtonElement | HTMLSpanElement>, block: VirtualBlock, mode: "move" | "resize") => {
    e.stopPropagation(); if (e.button !== 0 || gestureRef.current) return;
    const activity = plan.activities.find(a => a.id === block.activityId); if (!activity || !gridRef.current) return;
    gestureRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, scrollTop: scrollRef.current?.scrollTop ?? 0, width: (gridRef.current.clientWidth - 40) / (isMobile ? 1 : 7), activity, draft: activity, portionDay: block.day, mobileDay, mode, moved: false, loop: null };
    // Split portions may disappear; the grid owns capture and the ref holds the latest draft.
    gridRef.current.setPointerCapture(e.pointerId);
  };
  const blockMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current; if (!g || g.pointerId !== e.pointerId) return;
    e.stopPropagation(); g.lastX = e.clientX; g.lastY = e.clientY; updateGesture();
    if (g.moved && g.loop === null) { const loop = () => { if (gestureRef.current !== g) return; edgeScroll(g.lastY); updateGesture(); g.loop = requestAnimationFrame(loop); }; g.loop = requestAnimationFrame(loop); }
  };
  const blockEnd = (e: React.PointerEvent<HTMLDivElement>, cancel = false) => {
    const g = gestureRef.current; if (!g || g.pointerId !== e.pointerId) return;
    e.stopPropagation(); if (g.loop !== null) cancelAnimationFrame(g.loop);
    gestureRef.current = null; setPreview(null);
    if (gridRef.current?.hasPointerCapture(e.pointerId)) gridRef.current.releasePointerCapture(e.pointerId);
    if (cancel) { if (isMobile) setMobileDay(g.mobileDay); } else if (g.moved) save(g.draft); else edit(g.activity);
  };
  const minuteAt = (el: HTMLElement, clientY: number) => { const r = el.getBoundingClientRect(); return clamp(snap(range.start + (clientY - r.top) / r.height * (range.end - range.start)), range.start, range.end); };
  const colDown = (e: React.PointerEvent<HTMLDivElement>, day: number) => { if (e.button !== 0) return; const s: NonNullable<typeof selRef.current> = selRef.current = { pointerId: e.pointerId, el: e.currentTarget, x: e.clientX, y: e.clientY, lastY: e.clientY, day, started: false, timer: null, loop: null }; if (!isMobile) return; s.timer = window.setTimeout(() => { if (selRef.current !== s || s.started) return; s.started = true; try { s.el.setPointerCapture(s.pointerId); } catch {} armBlocker(); const m = minuteAt(s.el, s.y); setSelection({ day: s.day, anchor: m, current: m }); const loop = () => { if (selRef.current !== s) return; edgeScroll(s.lastY); s.loop = requestAnimationFrame(loop); }; s.loop = requestAnimationFrame(loop); }, 260); };
  const colMove = (e: React.PointerEvent<HTMLDivElement>, day: number) => { const s = selRef.current; if (!s) return; if (isMobile) { if (!s.started) { if (Math.abs(e.clientX - s.x) > 8 || Math.abs(e.clientY - s.y) > 8) { if (s.timer) clearTimeout(s.timer); selRef.current = null; } return; } s.lastY = e.clientY; if (selection?.day === day) setSelection({ ...selection, current: minuteAt(e.currentTarget, e.clientY) }); return; } if (s.started) { if (selection?.day === day) setSelection({ ...selection, current: pointerToMinute(e) }); return; } const dx = Math.abs(e.clientX - s.x); const dy = Math.abs(e.clientY - s.y); if (dy > 10 || dx > 10) { s.started = true; e.currentTarget.setPointerCapture(e.pointerId); const m = pointerToMinute(e); setSelection({ day: s.day, anchor: m, current: m }); } };
  const colUp = () => { const s = selRef.current; if (!s) return; if (s.timer) clearTimeout(s.timer); if (s.loop) cancelAnimationFrame(s.loop); selRef.current = null; releaseBlocker(); if (s.started) finishSelection(); };
  const colCancel = () => { const s = selRef.current; if (!s) return; if (s.timer) clearTimeout(s.timer); if (s.loop) cancelAnimationFrame(s.loop); selRef.current = null; releaseBlocker(); setSelection(null); };
  return <div className="flex min-h-0 flex-1 flex-col p-3 md:p-4">
    <div className="mb-3 flex items-center gap-3"><div className="mr-auto min-w-0">{editingPlanName ? <input autoFocus value={planNameInput} onChange={e => setPlanNameInput(e.target.value)} onBlur={commitPlanName} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitPlanName(); } }} className="w-full rounded-md border border-border bg-background px-2 py-1 text-lg font-semibold" /> : <h1 className="w-fit max-w-full cursor-pointer truncate text-lg font-semibold hover:underline" onClick={() => { setEditingPlanName(true); setPlanNameInput(plan.name); }}>{plan.name}</h1>}</div><WeeksDropdown store={store} setStore={setStore} onNew={onNewWeek} /><DownloadMenu /></div>
    <div className="mb-2 flex items-center justify-between md:hidden"><IconButton label="Anterior" onClick={() => setMobileDay((mobileDay + 6) % 7)}><ChevronLeft /></IconButton><strong className="text-sm">{DAYS[mobileDay]}</strong><IconButton label="Siguiente" onClick={() => setMobileDay((mobileDay + 1) % 7)}><ChevronRight /></IconButton></div>
    <div ref={scrollRef} className="scrollbar min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card"><div className="relative md:min-w-[760px] lg:min-w-[940px]" style={{ height: isMobile ? gridHeight : gridHeight + 56 }}>
      <div className="sticky top-0 z-20 hidden h-14 border-b border-border bg-card md:grid" style={{ gridTemplateColumns: "40px repeat(7,minmax(0,1fr))" }}><div />{DAYS.map((d, i) => <div key={d} className={cn("border-l border-border px-2 py-2", i !== mobileDay && "max-md:hidden")}><div className="text-xs font-semibold">{SHORT_DAYS[i]}</div></div>)}</div>
      <div ref={gridRef} className="absolute inset-x-0 md:top-14" style={{ height: gridHeight }} onPointerMove={blockMove} onPointerUp={e => blockEnd(e)} onPointerCancel={e => blockEnd(e, true)} onLostPointerCapture={e => blockEnd(e, true)}>
        {Array.from({ length: 25 }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-border" style={{ top: i * hour }}><span className="absolute left-0 w-[36px] -translate-y-1/2 text-right pr-2 font-mono text-[10px] text-muted-foreground">{fmt(range.start + i * 60)}</span></div>)}
        <div className="absolute inset-y-0 left-[40px] right-0 grid grid-cols-7 max-md:grid-cols-1">{DAYS.map((_, day) => <div key={day} className={cn("relative max-md:touch-auto touch-none border-l border-border", day !== mobileDay && "max-md:hidden")} onPointerDown={e => colDown(e, day)} onPointerMove={e => colMove(e, day)} onPointerUp={colUp} onPointerCancel={colCancel}>
          {selection?.day === day && <div className="pointer-events-none absolute inset-x-1 rounded-md border border-dashed border-primary bg-primary/15" style={{ top: (Math.min(selection.anchor, selection.current) - range.start) / 60 * hour, height: Math.max(12, Math.abs(selection.current - selection.anchor) / 60 * hour) }}><span className="px-2 text-[10px] text-primary">{fmt(Math.min(selection.anchor, selection.current))} – {fmt(Math.max(selection.anchor, selection.current))}</span></div>}
        </div>)}</div>
        {visible.map(a => <ActivityBlock key={`${a.activityId}-${a.portion === "second" ? "second" : "main"}`} activity={a} range={range} hour={hour} col={a.col} cols={a.cols} isMobile={isMobile} mobileDay={mobileDay} down={blockDown} />)}
      </div>
    </div></div>
  </div>;
}

function ActivityBlock({ activity, range, hour, col, cols, isMobile, mobileDay, down }: { activity: VirtualBlock; range: { start: number; end: number }; hour: number; col: number; cols: number; isMobile: boolean; mobileDay: number; down: (e: React.PointerEvent<HTMLButtonElement | HTMLSpanElement>, a: VirtualBlock, mode: "move" | "resize") => void }) {
  const [tooltip, setTooltip] = useState<{ text: string; left: number; top: number } | null>(null);
  const showTooltip = (target: HTMLElement, text: string) => {
    const rect = target.getBoundingClientRect();
    setTooltip({ text, left: clamp(rect.right + 8, 8, Math.max(8, window.innerWidth - 288)), top: clamp(rect.top, 8, Math.max(8, window.innerHeight - 104)) });
  };
  useEffect(() => {
    if (!tooltip) return;
    const dismiss = () => setTooltip(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => { window.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss); };
  }, [tooltip]);
  const ci = PALETTE.indexOf(activity.color);
  const gutter = 40;
  const dayOffset = isMobile ? 0 : activity.day;
  const colArea = `(100% - ${gutter}px) / ${isMobile ? 1 : 7}`;
  const offset = activity.portion === "second" ? 1440 - activity.originalStart : 0;
  const lanes: number[] = [];
  const marks = [...(activity.segments ?? [])].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)).map(segment => {
    let lane = lanes.findIndex(end => end <= segment.start);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = segment.start + segment.duration;
    return { segment, lane };
  });
  const descriptionId = `segments-${activity.id}`;
  const details = marks.map(({ segment }) => `${segment.name}: ${fmt(activity.originalStart + segment.start)} · ${mins(segment.duration)}`).join("; ");
  const compact = activity.duration / 60 * hour < 34;
  return <><button onPointerDown={e => { setTooltip(null); down(e, activity, "move"); }} onMouseLeave={() => setTooltip(null)} onFocus={e => { if (details && e.currentTarget.matches(":focus-visible")) showTooltip(e.currentTarget, details); }} onBlur={() => setTooltip(null)} onKeyDown={e => { if (e.key === "Escape") setTooltip(null); }} className={cn("activity-block group absolute z-10 touch-none overflow-hidden rounded-md border px-2 text-left shadow-sm hover:brightness-110", compact ? "py-0.5" : "py-1", activity.day !== mobileDay && "max-md:hidden", ci >= 0 ? colorCls[ci] : colorCls[0])} style={{ left: `calc(${gutter}px + ${dayOffset} * (${colArea}) + 4px + ${col} * (${colArea} / ${cols}))`, width: `calc(${colArea} / ${cols} - 8px)`, top: (activity.start - range.start) / 60 * hour, height: Math.min(range.end - activity.start, Math.max(18 / hour * 60, activity.duration)) / 60 * hour }} aria-label={`${activityName(activity.name)}, ${fmt(activity.start)}`} aria-describedby={marks.length ? descriptionId : undefined} title={details || undefined}>
    {marks.length > 0 && <span className="segment-timeline" aria-hidden="true">{marks.map(({ segment, lane }) => {
      const top = (Math.max(segment.start, offset) - offset) / activity.duration * 100;
      const height = Math.max(0, Math.min(segment.start + segment.duration, offset + activity.duration) - Math.max(segment.start, offset)) / activity.duration * 100;
      const tone = [...segment.id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % 6;
      const detail = `${segment.name}: ${fmt(activity.originalStart + segment.start)} · ${mins(segment.duration)}`;
      return <span key={segment.id} title={detail} data-segment-id={segment.id} onMouseEnter={e => { if (!e.buttons) showTooltip(e.currentTarget, detail); }} onMouseLeave={() => setTooltip(null)} className={`segment-mark segment-tone-${tone}`} style={{ top: `${top}%`, height: `${height}%`, left: `${lane * 100 / lanes.length}%`, width: `${100 / lanes.length}%`, display: height ? undefined : "none" }} />;
    })}</span>}
    <span className={cn("pointer-events-none relative block", marks.length > 0 && "pr-4")}>
      <span className={cn("activity-heading block truncate text-xs font-semibold", compact && "leading-3")}>{activityName(activity.name || t.custom)}</span>
      <span className={compact ? "sr-only" : "activity-heading block truncate text-[10px] opacity-70"}>{fmt(activity.start)} · {mins(activity.duration)}</span>
    </span>
    <span id={descriptionId} className="sr-only">{details}</span>
    <span onPointerDown={e => down(e, activity, "resize")} className={cn("activity-resize absolute inset-x-0 bottom-0 flex items-end justify-center cursor-ns-resize", isMobile ? "h-5 opacity-100" : "h-3 opacity-0 group-hover:opacity-100")}><span className={cn("max-w-[calc(100%-36px)] rounded bg-current", compact && "invisible", isMobile ? "mb-1 h-1 w-9 opacity-70" : "mb-0.5 h-0.5 w-7")} /></span>
  </button>{tooltip && createPortal(<div role="tooltip" className="segment-tooltip" style={{ left: tooltip.left, top: tooltip.top }}>{tooltip.text}</div>, document.body)}</>;
}

function DownloadMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={root} className="relative shrink-0" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") setOpen(false);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const items = Array.from(root.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length]?.focus();
    }
  }}>
    <button ref={trigger} type="button" aria-label="Descargar" title="Descargar" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? "download-menu" : undefined} onClick={() => setOpen(value => !value)} className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:border-primary"><Download className="size-5" /><span className="hidden sm:inline">Descargar</span></button>
    {open && <div id="download-menu" role="menu" aria-label="Descargar semana" aria-describedby="pdf-hint" className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-border bg-card p-1 shadow-xl">
      <button type="button" role="menuitem" onClick={() => { close(); window.print(); }} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">Imprimir</button>
      <button type="button" role="menuitem" aria-describedby="pdf-hint" onClick={() => { close(); window.print(); }} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">Guardar como PDF</button>
      <p id="pdf-hint" className="px-3 py-2 text-xs text-muted-foreground">Para guardar un PDF, elegí «Guardar como PDF» (Save as PDF) como destino en el diálogo de impresión del navegador.</p>
    </div>}
  </div>;
}

function PrintWeek({ plan }: { plan: Plan }) {
  const blocks = assignColumns(plan.activities.flatMap(expand));
  const start = blocks.length ? Math.floor(Math.min(...blocks.map(a => a.start)) / 60) * 60 : 480;
  const end = blocks.length ? Math.ceil(Math.max(...blocks.map(a => a.start + a.duration)) / 60) * 60 : 1200;
  const duration = Math.max(60, end - start);
  const printTime = (minute: number) => minute === 1440 ? "24:00" : fmt(minute);
  return <section className="print-week" aria-label="Semana para imprimir">
    <header className="print-title"><h2>{plan.name}</h2><p>{plan.weekOf} · Semana completa · {printTime(start)}–{printTime(start + duration)}</p></header>
    <div className="print-days"><span />{DAYS.map(day => <strong key={day}>{day}</strong>)}</div>
    <div className="print-grid">
      {Array.from({ length: duration / 60 + 1 }, (_, hour) => <div key={hour} className="print-hour" style={{ top: `${hour * 60 / duration * 100}%` }}><span>{printTime(start + hour * 60)}</span></div>)}
      <div className="print-columns">{DAYS.map(day => <div key={day} />)}</div>
      {blocks.map(activity => {
        const height = activity.duration / duration * 170;
        const offset = activity.portion === "second" ? 1440 - activity.originalStart : 0;
        const segments = (activity.segments ?? []).filter(segment => segment.start < offset + activity.duration && segment.start + segment.duration > offset).sort((a, b) => a.start - b.start).slice(0, Math.max(0, Math.floor((height - 7) / 3)));
        return <div key={activity.id} className={cn("print-activity", height < 6 && "print-compact")} data-print-activity={activity.activityId} style={{ top: `min(${(activity.start - start) / duration * 100}%, calc(100% - 3mm))`, height: `${activity.duration / duration * 100}%`, left: `calc(10mm + (100% - 10mm) * ${(activity.day + activity.col / activity.cols) / 7})`, width: `calc((100% - 10mm) / ${7 * activity.cols})`, backgroundColor: `color-mix(in srgb, ${activity.color} 30%, white)`, borderColor: activity.color }}><b>{activityName(activity.name || t.custom)}</b><span>{printTime(activity.start)}–{printTime(activity.start + activity.duration)}</span>{segments.map(segment => <span key={segment.id} className="print-segment">{segment.name} · {fmt(activity.originalStart + segment.start)}</span>)}</div>;
      })}
    </div>
  </section>;
}

function EditActivity({ activity, initialDays, close, plan, updateActivities }: { activity: Activity; initialDays: number[]; close: () => void; plan: Plan; updateActivities: (a: Activity[]) => void }) {
  const isNew = !plan.activities.some(x => x.id === activity.id);
  const [a, setA] = useState(() => boundActivity(activity));
  const [days, setDays] = useState(isNew ? initialDays : [activity.day]);
  const [editingStart, setEditingStart] = useState(false);
  const [deleteMenu, setDeleteMenu] = useState(false);
  const [editAll, setEditAll] = useState(false);
  const [planning, setPlanning] = useState(false);
  const planningButton = useRef<HTMLButtonElement>(null);
  const removeOne = () => { updateActivities(plan.activities.filter(x => x.id !== activity.id)); close(); };
  const removeAllName = () => { updateActivities(plan.activities.filter(x => x.name !== activity.name)); close(); };
  const removeAllNameTime = () => { updateActivities(plan.activities.filter(x => !(x.name === activity.name && x.start === activity.start))); close(); };
  const lastDay = Math.max(0, ...days, ...(!isNew && editAll ? plan.activities.filter(x => x.id !== activity.id && x.name === activity.name).map(x => x.day) : []));
  const effective = { ...boundActivity({ ...a, segments: undefined, day: lastDay }), day: a.day, segments: a.segments };
  const durationMax = Math.min(1440, 10080 - lastDay * 1440 - effective.start);
  const plannedTotal = Math.max(plannedMinutes(a), ...(!isNew && editAll && !a.segments ? plan.activities.filter(x => x.name === activity.name).map(plannedMinutes) : []));
  const segmentsError = (a.segments ?? []).some(segment => !segment.name.trim() || !Number.isInteger(segment.start) || segment.start < 0 || !Number.isInteger(segment.duration) || segment.duration <= 0) ? "Cada segmento necesita un nombre, inicio válido y minutos enteros positivos." : plannedTotal > effective.duration ? "Los segmentos superan la duración de la actividad." : "";
  const handleSave = () => {
    if (!days.length || segmentsError) return;
    const name = a.name || t.custom;
    const fields = { name, start: effective.start, duration: effective.duration, color: a.color, ...(a.segments ? { segments: a.segments.map(segment => ({ ...segment, name: segment.name.trim() })) } : {}) };
    const copies = days.filter(day => isNew || day !== activity.day).map(day => ({ ...effective, ...fields, id: crypto.randomUUID(), day, source: "custom" as const }));
    const retained = !isNew && days.includes(activity.day) ? [{ ...effective, ...fields, id: activity.id, day: activity.day }] : [];
    // Keep the original's position and ID; day selection never targets same-name siblings.
    const activities = plan.activities.flatMap(x => x.id === activity.id ? retained : [!isNew && editAll && x.name === activity.name ? { ...x, ...fields } : x]);
    updateActivities([...activities, ...copies]);
    close();
  };
  return <><div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4" style={{ display: planning ? "none" : undefined }}><form role="dialog" aria-modal="true" aria-label={activity.name ? t.edit : t.custom} onSubmit={e => { e.preventDefault(); handleSave(); }} className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-full md:max-w-md rounded-xl border border-border bg-card p-3 md:p-5"><div className="flex justify-between"><div><h2 className="text-xl font-semibold">{activity.name ? t.edit : t.custom}</h2><p className="mt-1 text-xs text-muted-foreground">{t.drag}</p></div><IconButton label="Cerrar" onClick={close}><X /></IconButton></div>
    <div className="mt-5 flex flex-col gap-4">
      <label className="text-sm">{t.name}<input autoFocus value={a.name} onChange={e => setA({ ...a, name: e.target.value })} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2" /></label>
      <label className="text-sm">{t.start}{editingStart ? <input type="time" autoFocus step="900" value={`${String(Math.floor(effective.start / 60)).padStart(2, "0")}:${String(effective.start % 60).padStart(2, "0")}`} onChange={e => { if (!e.target.value) return; const [h, m] = e.target.value.split(":").map(Number); setA({ ...effective, start: h * 60 + m }); }} onBlur={() => setEditingStart(false)} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2" /> : <button type="button" onClick={() => setEditingStart(true)} className="mt-1 flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary"><Clock className="size-4 shrink-0 text-muted-foreground" />{fmt(effective.start)}</button>}</label>
      <label className="text-sm">{t.duration}<input type="range" min="15" max={durationMax} step="15" value={effective.duration} onChange={e => setA({ ...effective, duration: Math.min(durationMax, Math.max(Number(e.target.value), Math.ceil(plannedMinutes(a) / 15) * 15)) })} className="mt-2 w-full accent-[var(--primary)]" /><span className="text-xs text-muted-foreground">{mins(effective.duration)} · {fmt(effective.start)}–{fmt(effective.start + effective.duration)}</span></label>
      <fieldset className="mt-1"><legend className="text-sm font-semibold mb-2">Color</legend><div className="flex gap-2">{PALETTE.map((hex, i) => <button type="button" key={hex} onClick={() => setA({ ...a, color: hex })} className={cn("size-7 rounded-full border-2 transition", a.color === hex ? "border-foreground scale-110" : "border-transparent")} style={{ backgroundColor: hex }} aria-label={`Color ${i + 1}`} />)}</div></fieldset>
    </div>
    <fieldset className="mt-4"><legend className="text-sm font-semibold">{t.days}</legend><div className="mt-2 grid grid-cols-7 gap-1">{SHORT_DAYS.map((d, i) => <button type="button" key={d} aria-pressed={days.includes(i)} onClick={() => setDays(days.includes(i) ? days.filter(x => x !== i) : [...days, i].sort())} className={cn("min-w-0 rounded-md border px-0 py-2 text-xs", days.includes(i) ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{d}</button>)}</div></fieldset>
    <fieldset className="mt-4"><legend className="text-sm font-semibold">Planificación interna</legend><button ref={planningButton} type="button" onClick={() => setPlanning(true)} className="mt-2 w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary">Abrir calendario de segmentos · {a.segments?.length ?? 0} segmentos</button>{segmentsError && <p role="alert" className="mt-2 text-sm text-danger">{segmentsError}</p>}</fieldset>
    {!isNew && activity.name && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={editAll} onChange={e => setEditAll(e.target.checked)} className="accent-[var(--primary)]" /><span>Aplicar a todas &quot;{activityName(activity.name)}&quot;</span></label>}
    <div className="mt-6 flex justify-between"><div className="relative"><button type="button" onClick={() => setDeleteMenu(!deleteMenu)} className="text-sm text-danger">{t.remove}</button>{deleteMenu && <div className="absolute bottom-full left-0 z-10 mb-1 w-56 rounded-md border border-border bg-card p-1 shadow-lg">{activity.name && <button type="button" onClick={removeAllName} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">{t.removeAllName} &quot;{activityName(activity.name)}&quot;</button>}{activity.name && <button type="button" onClick={removeAllNameTime} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">{t.removeAllNameTime}</button>}<hr className="my-1 border-border" /><button type="button" onClick={removeOne} className="block w-full rounded px-3 py-2 text-left text-sm text-danger hover:bg-muted">{t.removeThis}</button></div>}</div><button disabled={days.length === 0 || !!segmentsError} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">{t.save}</button></div>
  </form></div>{planning && <SegmentPlanner start={effective.start} duration={effective.duration} segments={a.segments ?? []} change={segments => setA({ ...a, segments })} close={() => { setPlanning(false); requestAnimationFrame(() => planningButton.current?.focus()); }} />}</>;
}

function NewWeekDialog({ close, create }: { close: () => void; create: (n: string, d: string, m: "blank" | "copy") => void }) { const [name, setName] = useState(t.newWeek); const [mode, setMode] = useState<"blank" | "copy">("blank"); return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4"><form onSubmit={e => { e.preventDefault(); create(name, new Date().toLocaleDateString("es-AR", { month: "short", day: "numeric", year: "numeric" }), mode); }} className="w-full max-w-full md:max-w-md rounded-xl border border-border bg-card p-3 md:p-5"><div className="flex justify-between"><h2 className="text-xl font-semibold">{t.newWeek}</h2><IconButton label="Cerrar" onClick={close}><X /></IconButton></div><div className="mt-5 flex flex-col gap-4"><label className="text-sm">{t.weekName}<input value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2" /></label><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setMode("blank")} className={cn("rounded-md border p-3 text-sm", mode === "blank" ? "border-primary bg-primary/10" : "border-border")}>{t.blank}</button><button type="button" onClick={() => setMode("copy")} className={cn("rounded-md border p-3 text-sm", mode === "copy" ? "border-primary bg-primary/10" : "border-border")}><Copy className="mx-auto mb-1" />{t.copyWeek}</button></div></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={close} className="rounded-md border border-border px-4 py-2 text-sm">{t.cancel}</button><button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">{t.create}</button></div></form></div>; }


function WeeksDropdown({ store, setStore, onNew }: { store: Store; setStore: React.Dispatch<React.SetStateAction<Store>>; onNew: () => void }) {
  const [open, setOpen] = useState(false);
  const switchTo = (id: string) => { setStore(s => ({ ...s, activePlanId: id })); setOpen(false); };
  const remove = (id: string) => { if (store.plans.length <= 1) return; const p = store.plans.find(q => q.id === id); if (p && !window.confirm(`¿Eliminar "${p.name}"?`)) return; setStore(s => { const plans = s.plans.filter(q => q.id !== id); return { ...s, plans, activePlanId: s.activePlanId === id ? (plans[0]?.id ?? "") : s.activePlanId }; }); setOpen(false); };
  return <div className="relative shrink-0">
    <button onClick={() => setOpen(o => !o)} aria-label={t.weeks} title={t.weeks} className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:border-primary"><CalendarDays /><span className="hidden sm:inline">{t.weeks}</span></button>
    {open && <>
      <div className="fixed inset-0 z-20" onMouseDown={() => setOpen(false)} />
      <div className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <p className="border-b border-border px-4 py-2 text-xs font-semibold text-muted-foreground">{t.weeks}</p>
        <div className="max-h-80 overflow-auto p-1">
          {store.plans.map(p => <div key={p.id} className={cn("flex items-center gap-2 rounded-md p-2", p.id === store.activePlanId && "bg-muted")}><button onClick={() => switchTo(p.id)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{p.weekOf} · {p.activities.length} {t.blocks}</span></button>{p.id === store.activePlanId && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">{t.active}</span>}<button onClick={() => remove(p.id)} disabled={store.plans.length <= 1} className="shrink-0 text-muted-foreground hover:text-danger disabled:cursor-not-allowed disabled:opacity-30" aria-label={t.remove}><Trash2 className="size-4" /></button></div>)}
        </div>
        <button onClick={() => { setOpen(false); onNew(); }} className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-sm font-medium text-primary hover:bg-muted"><Plus />{t.newWeek}</button>
      </div>
    </>}
  </div>;
}
