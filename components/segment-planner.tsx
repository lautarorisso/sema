"use client";

import { useEffect, useRef, useState } from "react";
import type { Segment } from "@/lib/types";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const time = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const scale = 3; // Pixels per minute keep five-minute segments usable.
type Gesture = {
  pointer: number; x: number; y: number; anchor: number; scrollTop: number;
  mode: "select" | "move" | "resize"; segment?: Segment; draft?: Segment;
  end: number; active: boolean; moved: boolean; timer?: number;
};

export function SegmentPlanner({ start, duration, segments, change, close }: {
  start: number; duration: number; segments: Segment[];
  change: (segments: Segment[]) => void; close: () => void;
}) {
  const [editing, setEditing] = useState<Segment | null>(null);
  const [preview, setPreview] = useState<Segment | null>(null);
  const [selection, setSelection] = useState<{ anchor: number; end: number } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const blocker = useRef<((event: TouchEvent) => void) | null>(null);
  const cleanup = () => {
    const current = gesture.current;
    gesture.current = null;
    if (current?.timer) window.clearTimeout(current.timer);
    if (current && grid.current?.hasPointerCapture(current.pointer)) grid.current.releasePointerCapture(current.pointer);
    if (blocker.current) document.removeEventListener("touchmove", blocker.current);
    blocker.current = null;
  };
  useEffect(() => () => cleanup(), []);
  const minuteAt = (y: number) => clamp(Math.round((y - grid.current!.getBoundingClientRect().top) / scale), 0, duration - 1);
  const down = (event: React.PointerEvent, mode: "select" | "move" | "resize", segment?: Segment) => {
    event.stopPropagation();
    if (event.button !== 0 || gesture.current) return;
    const current: Gesture = {
      pointer: event.pointerId, x: event.clientX, y: event.clientY, anchor: minuteAt(event.clientY),
      scrollTop: scroll.current?.scrollTop ?? 0, mode, segment, draft: segment,
      end: minuteAt(event.clientY), active: false, moved: false,
    };
    gesture.current = current;
    const activate = () => {
      if (gesture.current !== current) return;
      current.active = true;
      try { grid.current?.setPointerCapture(current.pointer); } catch { cleanup(); return; }
      if (mode === "select") setSelection({ anchor: current.anchor, end: current.end });
      if (event.pointerType === "touch") {
        blocker.current = e => e.preventDefault();
        document.addEventListener("touchmove", blocker.current, { passive: false });
      }
    };
    if (mode === "select" && event.pointerType === "touch") current.timer = window.setTimeout(activate, 300);
    else activate();
  };
  const move = (event: React.PointerEvent) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    event.stopPropagation();
    if (!current.active) {
      if (Math.abs(event.clientY - current.y) > 8 || Math.abs(event.clientX - current.x) > 8) cleanup();
      return;
    }
    const delta = Math.round((event.clientY - current.y + (scroll.current?.scrollTop ?? 0) - current.scrollTop) / scale);
    current.moved ||= Math.abs(delta) >= 1;
    if (current.mode === "select") {
      current.end = minuteAt(event.clientY);
      setSelection({ anchor: current.anchor, end: current.end });
    } else {
      const segment = current.segment!;
      current.draft = current.mode === "move"
        ? { ...segment, start: clamp(segment.start + delta, 0, duration - segment.duration) }
        : { ...segment, duration: clamp(segment.duration + delta, 1, duration - segment.start) };
      setPreview(current.draft);
    }
  };
  const end = (event: React.PointerEvent, cancel = false) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    event.stopPropagation();
    cleanup(); setPreview(null); setSelection(null);
    if (cancel || !current.active) return;
    if (current.mode === "select") {
      const offset = Math.min(current.anchor, current.end);
      setEditing({ id: crypto.randomUUID(), name: "", start: offset, duration: Math.min(duration - offset, Math.max(5, Math.abs(current.end - current.anchor))) });
    } else if (current.moved) change(segments.map(segment => segment.id === current.segment!.id ? current.draft! : segment));
    else setEditing(current.segment!);
  };
  const shown = segments.map(segment => preview?.id === segment.id ? preview : segment).sort((a, b) => a.start - b.start);
  // Greedy lanes expose overlapping segments without changing their time positions.
  const lanes: number[] = [];
  const positioned = shown.map(segment => {
    let lane = lanes.findIndex(end => end <= segment.start);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = segment.start + segment.duration;
    return { segment, lane };
  });
  const button = "rounded-md border border-border px-3 py-2 text-sm hover:border-primary";
  const input = "mt-1 block w-full rounded-md border border-border bg-background px-3 py-2";
  const error = editing && (!editing.name.trim() || !Number.isInteger(editing.start) || editing.start < 0 || !Number.isInteger(editing.duration) || editing.duration <= 0 || editing.start + editing.duration > duration);
  const closeEditor = () => { setEditing(null); requestAnimationFrame(() => grid.current?.focus()); };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-3">
    <section role="dialog" aria-modal={!editing} aria-label="Calendario de segmentos" onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); if (editing) closeEditor(); else close(); }
      if (event.key === "Tab") {
        const root = editing ? event.currentTarget.querySelector("form")! : event.currentTarget;
        const controls = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]'));
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }} className="flex h-[min(720px,calc(100dvh-1.5rem))] w-full max-w-lg flex-col rounded-xl border border-border bg-card p-3">
      <div inert={!!editing} className="contents">
      <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Planificación interna</h2><button autoFocus type="button" className={button} onClick={close}>Volver a la actividad</button></header>
      <p className="my-2 text-xs text-muted-foreground">{time(start)}–{time(start + duration)} · Seleccioná un intervalo. En pantalla táctil, mantené presionado para seleccionar.</p>
      <button type="button" className={`${button} mb-3`} onClick={() => setEditing({ id: crypto.randomUUID(), name: "", start: 0, duration: Math.min(25, duration) })}>Nuevo segmento</button>
      <div ref={scroll} data-testid="segment-scroll" className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-md border border-border">
        <div ref={grid} tabIndex={-1} data-testid="segment-grid" className="relative ml-14 outline-none" style={{ height: duration * scale, touchAction: "pan-y" }} onPointerDown={e => down(e, "select")} onPointerMove={move} onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)} onLostPointerCapture={e => end(e, true)}>
          {Array.from({ length: Math.ceil(duration / 30) + 1 }, (_, i) => Math.min(i * 30, duration)).map(offset => <div key={offset} className="pointer-events-none absolute inset-x-0 border-t border-border" style={{ top: offset * scale }}><span className="absolute -left-14 w-12 -translate-y-1/2 text-right font-mono text-[10px] text-muted-foreground">{time(start + offset)}</span></div>)}
          {positioned.map(({ segment, lane }) => <button type="button" key={segment.id} data-segment-id={segment.id} aria-label={`${segment.name}, ${time(start + segment.start)}, ${segment.duration} minutos`} onPointerDown={e => down(e, "move", segment)} onClick={e => { if (e.detail === 0) setEditing(segment); }} className="absolute touch-none overflow-hidden rounded-md border border-primary bg-primary/20 px-2 text-left text-xs" style={{ top: segment.start * scale, height: segment.duration * scale, left: `calc(${lane * 100 / lanes.length}% + 2px)`, width: `calc(${100 / lanes.length}% - 4px)` }}>
            <span className="pointer-events-none">{segment.name} · {segment.duration}m</span>
            <span aria-label={`Redimensionar ${segment.name}`} onPointerDown={e => down(e, "resize", segment)} className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize border-b-2 border-primary" />
          </button>)}
          {selection && <div className="pointer-events-none absolute inset-x-0 border border-dashed border-primary bg-primary/15" style={{ top: Math.min(selection.anchor, selection.end) * scale, height: Math.max(5, Math.abs(selection.end - selection.anchor)) * scale }} />}
        </div>
      </div>
      </div>
      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3">
        <form role="dialog" aria-modal="true" aria-label="Editar segmento" onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (error) return; change([...segments.filter(segment => segment.id !== editing.id), { ...editing, name: editing.name.trim() }]); closeEditor(); }} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto rounded-xl border border-border bg-card p-4">
          <h3 className="text-lg font-semibold">Editar segmento</h3>
          <label className="mt-3 block text-sm">Nombre del segmento<input autoFocus required className={input} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
          <label className="mt-3 block text-sm">Inicio en minutos desde la actividad<input type="number" min="0" max={duration - 1} step="1" required className={input} value={editing.start} onChange={e => setEditing({ ...editing, start: Number(e.target.value) })} /></label>
          <label className="mt-3 block text-sm">Duración del segmento<input type="number" min="1" max={duration - editing.start} step="1" required className={input} value={editing.duration} onChange={e => setEditing({ ...editing, duration: Number(e.target.value) })} /></label>
          <p className="mt-2 text-xs text-muted-foreground">{time(start + editing.start)}–{time(start + editing.start + editing.duration)}</p>
          {error && <p role="alert" className="mt-2 text-sm text-danger">Ingresá un nombre, inicio no negativo y duración en minutos enteros dentro de la actividad.</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {segments.some(segment => segment.id === editing.id) && <button type="button" className={button} onClick={() => { change(segments.filter(segment => segment.id !== editing.id)); closeEditor(); }}>Eliminar segmento</button>}
            <button type="button" className={button} onClick={closeEditor}>Cancelar segmento</button>
            <button type="submit" disabled={!!error} className={`${button} bg-primary text-primary-foreground disabled:opacity-40`}>Guardar segmento</button>
          </div>
        </form>
      </div>}
    </section>
  </div>;
}
