import { useEffect, useRef, useState } from "react";
export type MapLocation = { latitude: number; longitude: number };
const INITIAL: MapLocation = { latitude: -21.36, longitude: -48.23 };
const TILE = 256;
function project(p: MapLocation, z: number) {
  const n = 2 ** z;
  const lat = (Math.max(-85.05112878, Math.min(85.05112878, p.latitude)) * Math.PI) / 180;
  return {
    x: ((p.longitude + 180) / 360) * n,
    y: ((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2) * n,
  };
}
function unproject(x: number, y: number, z: number): MapLocation {
  const n = 2 ** z;
  return {
    longitude: (x / n) * 360 - 180,
    latitude: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
  };
}
type Props = {
  value: MapLocation | null;
  onChange: (p: MapLocation) => void;
  polygon?: readonly MapLocation[];
  mode?: "point" | "polygon";
  recenterOnValueChange?: boolean;
};
/** Lightweight OSM selector. Eligibility is always decided again by the server. */
export function DeliveryMapPicker({
  value,
  onChange,
  polygon = [],
  mode = "point",
  recenterOnValueChange = true,
}: Props) {
  const [center, setCenter] = useState<MapLocation>(value ?? INITIAL);
  const [zoom, setZoom] = useState(16);
  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    if (recenterOnValueChange && value) setCenter(value);
  }, [recenterOnValueChange, value]);
  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;
    const update = () => setViewportWidth(node.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const tile = project(center, zoom),
    size = 2 ** zoom;
  const tiles = [] as { x: number; y: number; url: string; left: number; top: number }[];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = Math.floor(tile.x) + dx,
        y = Math.floor(tile.y) + dy;
      if (y < 0 || y >= size) continue;
      tiles.push({
        x,
        y,
        url: `https://tile.openstreetmap.org/${zoom}/${(x + size) % size}/${y}.png`,
        left: (x - tile.x) * TILE - TILE / 2,
        top: (y - tile.y) * TILE - TILE / 2,
      });
    }
  const choose = (clientX: number, clientY: number, rect: DOMRect) => {
    const x = tile.x + (clientX - rect.left - rect.width / 2) / TILE;
    const y = tile.y + (clientY - rect.top - rect.height / 2) / TILE;
    const p = unproject(x, y, zoom);
    onChange(p);
    if (mode === "point") setCenter(p);
  };
  const panByPixels = (dx: number, dy: number) => {
    const current = project(center, zoom);
    setCenter(unproject(current.x - dx / TILE, current.y - dy / TILE, zoom));
  };
  const screen = (p: MapLocation) => {
    const q = project(p, zoom);
    return { x: (q.x - tile.x) * TILE, y: (q.y - tile.y) * TILE };
  };
  const marker = value ? screen(value) : null;
  const polygonScreen = polygon.map(screen);
  const linePoints = polygonScreen.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <div className="space-y-2">
      <div
        ref={mapRef}
        className="relative h-64 w-full touch-none overflow-hidden rounded-xl border bg-secondary cursor-grab active:cursor-grabbing"
        role="application"
        aria-label={
          mode === "polygon"
            ? "Mapa para desenhar a área de entrega"
            : "Mapa para escolher o ponto de entrega"
        }
        onPointerDown={(e) => {
          dragRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          const dx = e.clientX - drag.x;
          const dy = e.clientY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) >= 3) drag.moved = true;
          if (dx !== 0 || dy !== 0) {
            panByPixels(dx, dy);
            drag.x = e.clientX;
            drag.y = e.clientY;
          }
        }}
        onPointerUp={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          const moved = drag.moved;
          dragRef.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (!moved) choose(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
        }}
        onPointerCancel={(e) => {
          if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
        }}
      >
        {tiles.map((t) => (
          <img
            key={`${zoom}-${t.x}-${t.y}`}
            src={t.url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute h-64 w-64 max-w-none select-none"
            style={{ left: `calc(50% + ${t.left}px)`, top: `calc(50% + ${t.top}px)` }}
          />
        ))}
        {mode === "polygon" && polygonScreen.length > 0 && (
          <svg
            className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
            aria-hidden="true"
            style={{ overflow: "visible" }}
          >
            <g transform={`translate(${viewportWidth / 2}, 128)`}>
              {polygonScreen.length >= 3 ? (
                <polygon
                  points={linePoints}
                  fill="currentColor"
                  fillOpacity="0.12"
                  stroke="currentColor"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <polyline
                  points={linePoints}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {polygonScreen.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill="currentColor"
                  stroke="white"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          </svg>
        )}
        {mode === "point" && marker && Math.abs(marker.x) < 1024 && Math.abs(marker.y) < 1024 && (
          <span
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full text-3xl drop-shadow"
            style={{ left: `calc(50% + ${marker.x}px)`, top: `calc(50% + ${marker.y}px)` }}
            aria-label="Ponto escolhido"
          >
            📍
          </span>
        )}
        <span className="pointer-events-none absolute bottom-1 right-1 z-20 bg-background/90 px-1 text-[10px]">
          © OpenStreetMap contributors
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => setZoom((z) => Math.min(19, z + 1))}
        >
          + Zoom
        </button>
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => setZoom((z) => Math.max(12, z - 1))}
        >
          − Zoom
        </button>
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => {
            setCenter(INITIAL);
            setZoom(16);
          }}
        >
          Guariba
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === "polygon"
          ? "Toque no mapa para adicionar os vértices do contorno em sequência."
          : "Arraste o mapa para navegar e toque no ponto exato da entrega. Confirme rua e número separadamente."}
      </p>
    </div>
  );
}
