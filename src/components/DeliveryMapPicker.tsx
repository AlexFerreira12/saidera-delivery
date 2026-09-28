import { useEffect, useState } from "react";
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
  useEffect(() => {
    if (recenterOnValueChange && value) setCenter(value);
  }, [recenterOnValueChange, value]);
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
        className="relative h-64 w-full overflow-hidden rounded-xl border bg-secondary"
        role="application"
        aria-label={
          mode === "polygon"
            ? "Mapa para desenhar a área de entrega"
            : "Mapa para escolher o ponto de entrega"
        }
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          choose(e.clientX, e.clientY, rect);
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
            <g transform="translate(50%, 128)">
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
          : "Toque no mapa para escolher o ponto exato. Confirme rua e número separadamente."}
      </p>
    </div>
  );
}
