"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Copy, Plus, Trash2, X } from "lucide-react";
import { DAYS, SHORT_DAYS, emptyStore } from "@/lib/data";
import type { Activity, Plan, Store } from "@/lib/types";

const KEY = "sema-planner-v1";
const PALETTE = ["#818cf8", "#34d399", "#facc15", "#f87171", "#22d3ee", "#f472b6", "#2dd4bf", "#fb923c", "#a78bfa", "#a3e635"];
const colorCls = ["color-0", "color-1", "color-2", "color-3", "color-4", "color-5", "color-6", "color-7", "color-8", "color-9"];
type VirtualBlock = { id: string; activityId: string; name: string; day: number; start: number; duration: number; color: string; source?: "predefined" | "custom"; portion: "full" | "first" | "second"; originalStart: number; originalDuration: number; originalDay: number };
const t = { weeks:"Mis semanas", add:"Agregar actividad", loading:"Cargando tu semana…", newWeek:"Nueva semana", blank:"Semana vacía", copyWeek:"Copiar semana actual", create:"Crear semana", cancel:"Cancelar", weekName:"Nombre de la semana", blocks:"bloques", active:"Activa", edit:"Editar actividad", custom:"Nueva actividad", name:"Nombre", start:"Inicio", duration:"Duración", save:"Guardar", remove:"Eliminar", days:"Días", drag:"Arrastrá para mover · tirá del borde inferior para agrandar", removeThis:"Eliminar solo esta", removeAllName:"Eliminar todas", removeAllNameTime:"Eliminar todas a esta hora" };
const activityNames: Record<string, string> = { Sleep:"Sueño", Exercise:"Ejercicio", "Friends & family":"Amigos y familia", "Creative time":"Tiempo creativo", Lectura:"Lectura" };
const cn = (...v: (string | false | undefined)[]) => v.filter(Boolean).join(" ");
const snap = (n: number) => Math.round(n / 15) * 15;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const fmt = (m: number) => new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(2026, 0, 1, Math.floor(m / 60) % 24, m % 60));
const mins = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
const activityName = (name: string) => activityNames[name] ?? name;
const migrate = (raw: unknown): Store => { const incoming = raw as Partial<Store>; const s: Store = { ...emptyStore(), ...incoming, version: 2, preferences: { hintDismissed: incoming.preferences?.hintDismissed ?? false } }; if (!s.plans.length) return emptyStore(); if (!s.plans.some(p => p.id === s.activePlanId)) s.activePlanId = s.plans[0].id; return s; };

function IconButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} aria-label={label} title={label} className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:border-primary hover:text-foreground">{children}</button>; }

function expand(act: Activity): VirtualBlock[] {
  if (act.start + act.duration <= 1440) return [{ ...act, activityId: act.id, portion: "full", originalStart: act.start, originalDuration: act.duration, originalDay: act.day }];
  const first: VirtualBlock = { ...act, activityId: act.id, duration: 1440 - act.start, portion: "first", originalStart: act.start, originalDuration: act.duration, originalDay: act.day };
  const overflow = act.start + act.duration - 1440;
  const overflowDay = act.day === 6 ? 0 : act.day + 1; // Sunday overflow wraps to next week's Monday
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
  return <main className="flex h-dvh min-h-0 bg-background text-foreground">
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-3 md:px-5"><span className="text-xl font-semibold tracking-tight text-primary">sema</span><div className="ml-auto flex items-center gap-2"><button onClick={() => { setEditing({ id: crypto.randomUUID(), name: "", day: mobileDay, start: 540, duration: 60, color: PALETTE[3], source: "custom" }); setInitialDays([mobileDay]); }} className="flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground max-md:flex-1 max-md:justify-center"><Plus />{t.add}</button></div></header>
      <PlannerView plan={plan} store={store} setStore={setStore} mobileDay={mobileDay} setMobileDay={setMobileDay} save={saveActivity} edit={setEditing} setInitialDays={setInitialDays} onNewWeek={() => setNewWeek(true)} editingPlanName={editingPlanName} setEditingPlanName={setEditingPlanName} planNameInput={planNameInput} setPlanNameInput={setPlanNameInput} commitPlanName={commitPlanName} />
    </section>
    {editing && <EditActivity activity={editing} initialDays={initialDays} close={() => setEditing(null)} save={saveActivity} plan={plan} updateActivities={updateActivities} />}
    {newWeek && <NewWeekDialog close={() => setNewWeek(false)} create={createPlan} />}
  </main>;
}

function PlannerView({ plan, store, setStore, mobileDay, setMobileDay, save, edit, setInitialDays, onNewWeek, editingPlanName, setEditingPlanName, planNameInput, setPlanNameInput, commitPlanName }: { plan: Plan; store: Store; setStore: React.Dispatch<React.SetStateAction<Store>>; mobileDay: number; setMobileDay: (n: number) => void; save: (a: Activity) => void; edit: (a: Activity) => void; setInitialDays: (d: number[]) => void; onNewWeek: () => void; editingPlanName: boolean; setEditingPlanName: (b: boolean) => void; planNameInput: string; setPlanNameInput: (s: string) => void; commitPlanName: () => void }) {
  const hour = 48;
  const range = { start: 0, end: 1440 };
  const gridHeight = 24 * hour;
  const [isMobile, setIsMobile] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const mq = window.matchMedia("(max-width: 767px)"); setIsMobile(mq.matches); const h = (e: MediaQueryListEvent) => setIsMobile(e.matches); mq.addEventListener("change", h); return () => mq.removeEventListener("change", h); }, []);
  const visible = assignColumns(plan.activities.filter(a => a.start + a.duration > range.start && a.start < range.end).flatMap(expand));
  const [selection, setSelection] = useState<{ day: number; anchor: number; current: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selRef = useRef<{ pointerId: number; el: HTMLElement; x: number; y: number; lastY: number; day: number; started: boolean; timer: number | null; loop: number | null } | null>(null);
  const blockerRef = useRef<((e: TouchEvent) => void) | null>(null);
  const pointerToMinute = (e: React.PointerEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); return clamp(snap(range.start + (e.clientY - r.top) / r.height * (range.end - range.start)), range.start, range.end); };
  const finishSelection = () => { if (!selection) return; const start = Math.min(selection.anchor, selection.current); const duration = Math.max(15, Math.abs(selection.current - selection.anchor)); if (duration >= 15) { setInitialDays([selection.day]); edit({ id: crypto.randomUUID(), name: "", day: selection.day, start, duration, color: PALETTE[3], source: "custom" }); } setSelection(null); };
  const armBlocker = () => { if (blockerRef.current || !scrollRef.current) return; const fn = (e: TouchEvent) => e.preventDefault(); blockerRef.current = fn; scrollRef.current.addEventListener("touchmove", fn, { passive: false }); };
  const releaseBlocker = () => { if (blockerRef.current && scrollRef.current) scrollRef.current.removeEventListener("touchmove", blockerRef.current); blockerRef.current = null; };
  const edgeScroll = (clientY: number) => { const el = scrollRef.current; if (!el) return; const r = el.getBoundingClientRect(); const zone = 64; const step = 26; if (clientY < r.top + zone) el.scrollTop = Math.max(0, el.scrollTop - step); else if (clientY > r.bottom - zone) el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + step); };
  const minuteAt = (el: HTMLElement, clientY: number) => { const r = el.getBoundingClientRect(); return clamp(snap(range.start + (clientY - r.top) / r.height * (range.end - range.start)), range.start, range.end); };
  const colDown = (e: React.PointerEvent<HTMLDivElement>, day: number) => { if (e.button !== 0) return; const s: NonNullable<typeof selRef.current> = selRef.current = { pointerId: e.pointerId, el: e.currentTarget, x: e.clientX, y: e.clientY, lastY: e.clientY, day, started: false, timer: null, loop: null }; if (!isMobile) return; s.timer = window.setTimeout(() => { if (selRef.current !== s || s.started) return; s.started = true; try { s.el.setPointerCapture(s.pointerId); } catch {} armBlocker(); const m = minuteAt(s.el, s.y); setSelection({ day: s.day, anchor: m, current: m }); const loop = () => { if (selRef.current !== s) return; edgeScroll(s.lastY); s.loop = requestAnimationFrame(loop); }; s.loop = requestAnimationFrame(loop); }, 260); };
  const colMove = (e: React.PointerEvent<HTMLDivElement>, day: number) => { const s = selRef.current; if (!s) return; if (isMobile) { if (!s.started) { if (Math.abs(e.clientX - s.x) > 8 || Math.abs(e.clientY - s.y) > 8) { if (s.timer) clearTimeout(s.timer); selRef.current = null; } return; } s.lastY = e.clientY; if (selection?.day === day) setSelection({ ...selection, current: minuteAt(e.currentTarget, e.clientY) }); return; } if (s.started) { if (selection?.day === day) setSelection({ ...selection, current: pointerToMinute(e) }); return; } const dx = Math.abs(e.clientX - s.x); const dy = Math.abs(e.clientY - s.y); if (dy > 10 || dx > 10) { s.started = true; e.currentTarget.setPointerCapture(e.pointerId); const m = pointerToMinute(e); setSelection({ day: s.day, anchor: m, current: m }); } };
  const colUp = () => { const s = selRef.current; if (!s) return; if (s.timer) clearTimeout(s.timer); if (s.loop) cancelAnimationFrame(s.loop); selRef.current = null; releaseBlocker(); if (s.started) finishSelection(); };
  const colCancel = () => { const s = selRef.current; if (!s) return; if (s.timer) clearTimeout(s.timer); if (s.loop) cancelAnimationFrame(s.loop); selRef.current = null; releaseBlocker(); setSelection(null); };
  return <div className="flex min-h-0 flex-1 flex-col p-3 md:p-4">
    <div className="mb-3 flex items-center gap-3"><div className="min-w-0 flex-1">{editingPlanName ? <input autoFocus value={planNameInput} onChange={e => setPlanNameInput(e.target.value)} onBlur={commitPlanName} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitPlanName(); } }} className="w-full rounded-md border border-border bg-background px-2 py-1 text-lg font-semibold" /> : <h1 className="cursor-pointer truncate text-lg font-semibold hover:underline" onClick={() => { setEditingPlanName(true); setPlanNameInput(plan.name); }}>{plan.name}</h1>}</div><WeeksDropdown store={store} setStore={setStore} onNew={onNewWeek} /><button onClick={onNewWeek} className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:border-primary shrink-0"><Plus />{t.newWeek}</button></div>
    <div className="mb-2 flex items-center justify-between md:hidden"><IconButton label="Anterior" onClick={() => setMobileDay((mobileDay + 6) % 7)}><ChevronLeft /></IconButton><strong className="text-sm">{DAYS[mobileDay]}</strong><IconButton label="Siguiente" onClick={() => setMobileDay((mobileDay + 1) % 7)}><ChevronRight /></IconButton></div>
    <div ref={scrollRef} className="scrollbar min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card"><div className="relative md:min-w-[760px] lg:min-w-[940px]" style={{ height: isMobile ? gridHeight : gridHeight + 56 }}>
      <div className="sticky top-0 z-20 hidden h-14 border-b border-border bg-card md:grid" style={{ gridTemplateColumns: "40px repeat(7,minmax(0,1fr))" }}><div />{DAYS.map((d, i) => <div key={d} className={cn("border-l border-border px-2 py-2", i !== mobileDay && "max-md:hidden")}><div className="text-xs font-semibold">{SHORT_DAYS[i]}</div></div>)}</div>
      <div className="absolute inset-x-0 md:top-14" style={{ height: gridHeight }}>
        {Array.from({ length: 25 }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-border" style={{ top: i * hour }}><span className="absolute left-0 w-[36px] -translate-y-1/2 text-right pr-2 font-mono text-[10px] text-muted-foreground">{fmt(range.start + i * 60)}</span></div>)}
        <div className="absolute inset-y-0 left-[40px] right-0 grid grid-cols-7 max-md:grid-cols-1">{DAYS.map((_, day) => <div key={day} className={cn("relative max-md:touch-auto touch-none border-l border-border", day !== mobileDay && "max-md:hidden")} onPointerDown={e => colDown(e, day)} onPointerMove={e => colMove(e, day)} onPointerUp={colUp} onPointerCancel={colCancel}>
          {selection?.day === day && <div className="pointer-events-none absolute inset-x-1 rounded-md border border-dashed border-primary bg-primary/15" style={{ top: (Math.min(selection.anchor, selection.current) - range.start) / 60 * hour, height: Math.max(12, Math.abs(selection.current - selection.anchor) / 60 * hour) }}><span className="px-2 text-[10px] text-primary">{fmt(Math.min(selection.anchor, selection.current))} – {fmt(Math.max(selection.anchor, selection.current))}</span></div>}
        </div>)}</div>
        {visible.map(a => <ActivityBlock key={`${a.activityId}-${a.day}-${a.start}-${a.duration}`} activity={a} range={range} hour={hour} edit={edit} save={save} col={a.col} cols={a.cols} isMobile={isMobile} setMobileDay={setMobileDay} scrollRef={scrollRef} />)}
      </div>
    </div></div>
  </div>;
}

function ActivityBlock({ activity, range, hour, edit, save, col, cols, isMobile, setMobileDay, scrollRef }: { activity: VirtualBlock; range: { start: number; end: number }; hour: number; edit: (a: Activity) => void; save: (a: Activity) => void; col: number; cols: number; isMobile: boolean; setMobileDay: (n: number) => void; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; activity: VirtualBlock; mode: "move" | "resize"; moved: boolean } | null>(null);
  const [preview, setPreview] = useState(activity);
  // Keep the rendered preview in sync when the persisted activity changes
  // (e.g. rename from the edit dialog); the render key ignores the name, so
  // without this the block would keep the stale label until reload.
  // Compare VALUES, not object identity: drag re-renders create a fresh
  // `activity` prop each time, so an identity effect would clobber the live
  // drag preview on every render (setMobileDay re-renders every block).
  const lastActivityRef = useRef(activity);
  useEffect(() => {
    const a = activity; const last = lastActivityRef.current;
    if (a.id !== last.id || a.name !== last.name || a.day !== last.day || a.start !== last.start || a.duration !== last.duration || a.color !== last.color) setPreview(a);
    lastActivityRef.current = a;
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [activity]);
  const [dragging, setDragging] = useState(false);
  const [ghost, setGhost] = useState(0);
  const ci = PALETTE.indexOf(activity.color);
  const effectiveCol = dragging ? 0 : col;
  const effectiveCols = dragging ? 1 : cols;
  const edgeScroll = (clientY: number) => { const el = scrollRef.current; if (!el) return; const r = el.getBoundingClientRect(); const zone = 64; const step = 26; if (clientY < r.top + zone) el.scrollTop = Math.max(0, el.scrollTop - step); else if (clientY > r.bottom - zone) el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + step); };
  const down = (e: React.PointerEvent, mode: "move" | "resize") => { e.stopPropagation(); drag.current = { x: e.clientX, y: e.clientY, activity: preview, mode, moved: false }; };
  const move = (e: React.PointerEvent) => { if (!drag.current) return; e.stopPropagation(); const dy = snap((e.clientY - drag.current.y) / hour * 60); const dx = e.clientX - drag.current.x; if (!drag.current.moved) { drag.current.moved = Math.abs(dy) >= 15 || Math.abs(dx) > 20; if (!drag.current.moved) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDragging(true); } if (drag.current.mode === "resize") { const orig = drag.current.activity; const newDuration = clamp(orig.originalDuration + dy, 15, 1440); // at most one day; overflow renders as a next-day block
  setPreview({ ...orig, duration: orig.portion === "first" ? Math.min(newDuration, 1440 - orig.start) : newDuration, originalDuration: newDuration }); } else { const width = ref.current?.parentElement?.parentElement?.clientWidth ?? 700; const dayBase = drag.current.activity.day; let newDay = dayBase; if (isMobile) { newDay = clamp(dayBase + Math.round(dx / width), 0, 6); setGhost(dx - (newDay - dayBase) * width); setMobileDay(newDay); } else { newDay = dayBase + Math.round(dx / (width / 7)); } let newStart = drag.current.activity.start + dy; while (newStart < 0) { newStart += 1440; newDay--; } while (newStart >= 1440) { newStart -= 1440; newDay++; } newDay = clamp(newDay, 0, 6); setPreview({ ...drag.current.activity, day: newDay, start: newStart }); edgeScroll(e.clientY); } };
  const up = (e: React.PointerEvent) => { if (!drag.current) return; e.stopPropagation(); const moved = drag.current.moved; drag.current = null; setDragging(false); setGhost(0); if (moved) { const p = preview; save({ id: p.activityId, name: p.name, day: p.day, start: p.start, duration: p.originalDuration, color: p.color, source: p.source }); } else { const fullActivity: Activity = { id: preview.activityId, name: preview.name, day: preview.originalDay, start: preview.originalStart, duration: preview.originalDuration, color: preview.color, source: preview.source }; edit(fullActivity); } };
  const cancel = () => { if (!drag.current) return; drag.current = null; setDragging(false); setGhost(0); setPreview(activity); };
  const gutter = 40;
  const dayOffset = isMobile ? 0 : preview.day;
  const numCols = isMobile ? 1 : effectiveCols;
  const colIdx = isMobile ? 0 : effectiveCol;
  const colArea = isMobile ? "100%" : `(100% - ${gutter}px) / 7`;
  return <button ref={ref} onPointerDown={e => down(e, "move")} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} className={cn("group absolute z-10 touch-none overflow-hidden rounded-md border px-2 py-1 text-left shadow-sm", isMobile ? "transition-none active:scale-105" : "transition hover:brightness-110", ci >= 0 ? colorCls[ci] : colorCls[0])} style={{ left: `calc(${gutter}px + ${dayOffset} * ((100% - ${gutter}px) / 7) + 4px + ${colIdx} * (${colArea} / ${numCols}))`, width: `calc(${colArea} / ${numCols} - 8px)`, top: (preview.start - range.start) / 60 * hour, height: Math.max(18, preview.duration / 60 * hour), transform: isMobile && dragging && ghost ? `translateX(${ghost}px)` : undefined }} aria-label={`${activityName(preview.name)}, ${fmt(preview.start)}`}>
    <span className="block truncate text-xs font-semibold">{activityName(preview.name || t.custom)}</span><span className="block truncate text-[10px] opacity-70">{fmt(preview.start)} · {mins(preview.duration)}</span><span onPointerDown={e => down(e, "resize")} className={cn("absolute inset-x-0 bottom-0 flex items-end justify-center cursor-ns-resize", isMobile ? "h-5 opacity-100" : "h-3 opacity-0 group-hover:opacity-100")}><span className={cn("rounded bg-current", isMobile ? "mb-1 h-1 w-9 opacity-70" : "mb-0.5 h-0.5 w-7")} /></span>
  </button>;
}

function EditActivity({ activity, initialDays, close, save, plan, updateActivities }: { activity: Activity; initialDays: number[]; close: () => void; save: (a: Activity) => void; plan: Plan; updateActivities: (a: Activity[]) => void }) { const isNew = !plan.activities.some(x => x.id === activity.id); const [a, setA] = useState(activity); const [days, setDays] = useState(isNew ? initialDays : [activity.day]); const [editingStart, setEditingStart] = useState(false); const [deleteMenu, setDeleteMenu] = useState(false); const [editAll, setEditAll] = useState(false); const removeOne = () => { updateActivities(plan.activities.filter(x => x.id !== activity.id)); close(); }; const removeAllName = () => { updateActivities(plan.activities.filter(x => x.name !== activity.name)); close(); }; const removeAllNameTime = () => { updateActivities(plan.activities.filter(x => !(x.name === activity.name && x.start === activity.start))); close(); }; const handleSave = () => { const name = a.name || t.custom; if (isNew && days.length > 0) { const newActivities = days.map(day => ({ ...a, id: crypto.randomUUID(), name, day, source: "custom" as const })); updateActivities([...plan.activities, ...newActivities]); } else if (editAll) { updateActivities(plan.activities.map(x => x.name === activity.name ? { ...x, name, start: a.start, duration: a.duration, color: a.color } : x)); } else { save({ ...a, name }); } close(); }; return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4"><form onSubmit={e => { e.preventDefault(); handleSave(); }} className="w-full max-w-full md:max-w-md rounded-xl border border-border bg-card p-3 md:p-5"><div className="flex justify-between"><div><h2 className="text-xl font-semibold">{activity.name ? t.edit : t.custom}</h2><p className="mt-1 text-xs text-muted-foreground">{t.drag}</p></div><IconButton label="Cerrar" onClick={close}><X /></IconButton></div><div className="mt-5 flex flex-col gap-4"><label className="text-sm">{t.name}<input autoFocus value={a.name} onChange={e => setA({ ...a, name: e.target.value })} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2" /></label><label className="text-sm">{t.start}{editingStart ? <input type="time" autoFocus step="900" value={`${String(Math.floor(a.start / 60)).padStart(2, "0")}:${String(a.start % 60).padStart(2, "0")}`} onChange={e => { const [h, m] = e.target.value.split(":").map(Number); setA({ ...a, start: h * 60 + m }); }} onBlur={() => setEditingStart(false)} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2" /> : <button type="button" onClick={() => setEditingStart(true)} className="mt-1 flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary"><Clock className="size-4 shrink-0 text-muted-foreground" />{fmt(a.start)}</button>}</label><label className="text-sm">{t.duration}<input type="range" min="15" max="480" step="15" value={a.duration} onChange={e => setA({ ...a, duration: Number(e.target.value) })} className="mt-2 w-full accent-[var(--primary)]" /><span className="text-xs text-muted-foreground">{mins(a.duration)} · {fmt(a.start)}–{fmt(a.start + a.duration)}</span></label><fieldset className="mt-1"><legend className="text-sm font-semibold mb-2">Color</legend><div className="flex gap-2">{PALETTE.map((hex, i) => <button type="button" key={hex} onClick={() => setA({ ...a, color: hex })} className={cn("size-7 rounded-full border-2 transition", a.color === hex ? "border-foreground scale-110" : "border-transparent")} style={{ backgroundColor: hex }} aria-label={`Color ${i + 1}`} />)}</div></fieldset></div>{isNew && <fieldset className="mt-4"><legend className="text-sm font-semibold">{t.days}</legend><div className="mt-2 flex flex-wrap gap-2">{SHORT_DAYS.map((d, i) => <button type="button" key={d} aria-pressed={days.includes(i)} onClick={() => setDays(days.includes(i) ? days.filter(x => x !== i) : [...days, i].sort())} className={cn("rounded-md border px-3 py-2 text-xs", days.includes(i) ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{d}</button>)}</div></fieldset>}{!isNew && activity.name && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={editAll} onChange={e => setEditAll(e.target.checked)} className="accent-[var(--primary)]" /><span>Aplicar a todas &quot;{activityName(activity.name)}&quot;</span></label>}<div className="mt-6 flex justify-between"><div className="relative"><button type="button" onClick={() => setDeleteMenu(!deleteMenu)} className="text-sm text-danger">{t.remove}</button>{deleteMenu && <div className="absolute bottom-full left-0 z-10 mb-1 w-56 rounded-md border border-border bg-card p-1 shadow-lg">{activity.name && <button type="button" onClick={removeAllName} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">{t.removeAllName} &quot;{activityName(activity.name)}&quot;</button>}{activity.name && <button type="button" onClick={removeAllNameTime} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">{t.removeAllNameTime}</button>}<hr className="my-1 border-border" /><button type="button" onClick={removeOne} className="block w-full rounded px-3 py-2 text-left text-sm text-danger hover:bg-muted">{t.removeThis}</button></div>}</div><button disabled={isNew && days.length === 0} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">{t.save}</button></div></form></div>; }

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
