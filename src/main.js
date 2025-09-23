/* main.js — fixed: restored buttons + import/export + correct screen↔world placement after pan/zoom */

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const jsonPreview = document.getElementById("jsonPreview");

/* --- config + state --- */
let tool = "draw";

// Grid: prefer the input value; fallback default = 5; enforce min = 1
let gridSize = parseInt(document.getElementById("gridSize").value, 10);
if (!Number.isFinite(gridSize)) gridSize = 5;
gridSize = Math.max(1, gridSize);
document.getElementById("gridSize").value = gridSize;
document.getElementById("gridLabel").innerText = gridSize;

// Zoom: smaller gridSize -> zoom in. (32 is an arbitrary reference)
let zoom = 32 / gridSize;

let panOffset = { x: 0, y: 0 };

/* --- UI wiring for tool buttons --- */
const toolButtons = {
  draw: document.getElementById("toolDraw"),
  spawn: document.getElementById("toolSpawn"),
  erase: document.getElementById("toolErase"),
  move: document.getElementById("toolMove"),
};
Object.entries(toolButtons).forEach(([k, btn]) => {
  if (!btn) return;
  btn.addEventListener("click", () => setTool(k));
});
function setTool(t) {
  tool = t;
  Object.values(toolButtons).forEach((b) => b && b.classList.remove("active"));
  if (toolButtons[t]) toolButtons[t].classList.add("active");
  canvas.style.cursor = t === "move" ? "grab" : "crosshair";
}

/* --- grid size / canvas size UI --- */
document.getElementById("gridSize").addEventListener("change", (e) => {
  // Enforce min 1, max 256; default fallback 5
  gridSize = parseInt(e.target.value, 10);
  if (!Number.isFinite(gridSize)) gridSize = 5;
  gridSize = Math.max(1, Math.min(256, gridSize));
  e.target.value = gridSize;
  document.getElementById("gridLabel").innerText = gridSize;
  // recalc zoom to keep the same "feel" (smaller grid -> zoomed in)
  zoom = 32 / gridSize;
  draw();
});

document.getElementById("canvasSize").addEventListener("change", (e) => {
  const s = parseInt(e.target.value, 10);
  if (Number.isFinite(s)) {
    canvas.width = s;
    canvas.height = s;
    draw();
  }
});

/* --- map data --- */
const map = {
  spawn: [
    { x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2) },
  ],
  walls: [],
};

/* --- undo/redo --- */
let history = [];
let historyPos = -1;

function pushHistory() {
  // deep clone
  history = history.slice(0, historyPos + 1);
  history.push(JSON.parse(JSON.stringify(map)));
  historyPos = history.length - 1;
  updateButtons();
  updatePreview();
}
function undo() {
  if (historyPos > 0) {
    historyPos--;
    Object.assign(map, JSON.parse(JSON.stringify(history[historyPos])));
    draw();
    updateButtons();
    updatePreview();
  }
}
function redo() {
  if (historyPos < history.length - 1) {
    historyPos++;
    Object.assign(map, JSON.parse(JSON.stringify(history[historyPos])));
    draw();
    updateButtons();
    updatePreview();
  }
}
function updateButtons() {
  const ub = document.getElementById("undoBtn");
  const rb = document.getElementById("redoBtn");
  if (ub) ub.disabled = historyPos <= 0;
  if (rb) rb.disabled = historyPos >= history.length - 1;
}

/* --- helpers: snapping + transforms --- */
function snap(v) {
  // v is in world coordinates; gridSize is world units per grid cell
  return Math.round(v / gridSize) * gridSize;
}

/* Convert a mouse event (or client coords) to world coordinates */
function screenToWorldFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  return {
    x: (sx - panOffset.x) / zoom,
    y: (sy - panOffset.y) / zoom,
  };
}
function screenToWorld(evt) {
  return screenToWorldFromClient(evt.clientX, evt.clientY);
}
function worldToScreenPoint(wx, wy) {
  return {
    x: wx * zoom + panOffset.x,
    y: wy * zoom + panOffset.y,
  };
}

/* --- interaction state --- */
let isDown = false,
  startPt = null,
  dragPt = null,
  panStart = null;

/* --- mouse handlers --- */
canvas.addEventListener("mousedown", (ev) => {
  ev.preventDefault();
  const worldPt = screenToWorld(ev);

  if (ev.button === 2) {
    // right click = erase nearest wall (threshold in world units)
    const idx = findNearestWall(worldPt, 12 / zoom);
    if (idx >= 0) {
      map.walls.splice(idx, 1);
      pushHistory();
      draw();
    }
    return;
  }

  isDown = true;
  startPt = worldPt;

  if (tool === "spawn") {
    // place single spawn (snap to grid)
    const s = { x: snap(startPt.x), y: snap(startPt.y) };
    map.spawn = [s];
    pushHistory();
    draw();
    isDown = false;
  } else if (tool === "move") {
    panStart = {
      x: ev.clientX,
      y: ev.clientY,
      ox: panOffset.x,
      oy: panOffset.y,
    };
    canvas.style.cursor = "grabbing";
  } else if (tool === "erase") {
    const idx = findNearestWall(worldPt, 12 / zoom);
    if (idx >= 0) {
      map.walls.splice(idx, 1);
      pushHistory();
      draw();
    }
    isDown = false;
  } else if (tool === "draw") {
    dragPt = worldPt;
  }
});

canvas.addEventListener("mousemove", (ev) => {
  const worldPt = screenToWorld(ev);
  if (tool === "move" && isDown && panStart) {
    panOffset.x = panStart.ox + (ev.clientX - panStart.x);
    panOffset.y = panStart.oy + (ev.clientY - panStart.y);
    draw();
    return;
  }
  if (isDown && tool === "draw") {
    dragPt = worldPt;
    draw();
  }
});

canvas.addEventListener("mouseup", (ev) => {
  if (ev.button === 2) return;
  const worldPt = screenToWorld(ev);

  if (tool === "draw" && startPt && dragPt) {
    const a = { x: snap(startPt.x), y: snap(startPt.y) };
    const b = { x: snap(worldPt.x), y: snap(worldPt.y) };
    // ignore zero-length
    if (!(a.x === b.x && a.y === b.y)) {
      map.walls.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      pushHistory();
    }
  }

  isDown = false;
  startPt = null;
  dragPt = null;
  panStart = null;
  canvas.style.cursor = tool === "move" ? "grab" : "crosshair";
  draw();
});

canvas.addEventListener("dblclick", (ev) => {
  // double click to place spawn
  const p = screenToWorld(ev);
  map.spawn = [{ x: snap(p.x), y: snap(p.y) }];
  pushHistory();
  draw();
});

// disable native context menu on canvas so right-click erase works
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

/* --- nearest wall search (world coords) --- */
function findNearestWall(pt, threshold = 16) {
  let best = { idx: -1, d2: Infinity };
  for (let i = 0; i < map.walls.length; i++) {
    const w = map.walls[i];
    const dx = w.x2 - w.x1,
      dy = w.y2 - w.y1;
    let den = dx * dx + dy * dy || 1;
    let t = ((pt.x - w.x1) * dx + (pt.y - w.y1) * dy) / den;
    t = Math.max(0, Math.min(1, t));
    const cx = w.x1 + t * dx,
      cy = w.y1 + t * dy;
    const d2 = (pt.x - cx) ** 2 + (pt.y - cy) ** 2;
    if (d2 < best.d2) best = { idx: i, d2 };
  }
  return best.d2 <= threshold * threshold ? best.idx : -1;
}

/* --- rendering --- */
function drawGrid() {
  const w = canvas.width,
    h = canvas.height;
  ctx.save();
  // draw in world space: apply pan + zoom
  ctx.translate(panOffset.x, panOffset.y);
  ctx.scale(zoom, zoom);

  ctx.lineWidth = 1 / Math.max(zoom, 1e-6);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  const step = gridSize;

  // compute visible bounds in world coordinates to avoid drawing too many lines
  const leftWorld = -panOffset.x / zoom;
  const topWorld = -panOffset.y / zoom;
  const rightWorld = (w - panOffset.x) / zoom;
  const bottomWorld = (h - panOffset.y) / zoom;

  const startX = Math.floor(leftWorld / step) * step - step * 2;
  const endX = Math.ceil(rightWorld / step) * step + step * 2;
  const startY = Math.floor(topWorld / step) * step - step * 2;
  const endY = Math.ceil(bottomWorld / step) * step + step * 2;

  for (let gx = startX; gx <= endX; gx += step) {
    ctx.beginPath();
    ctx.moveTo(gx, startY);
    ctx.lineTo(gx, endY);
    ctx.stroke();
  }
  for (let gy = startY; gy <= endY; gy += step) {
    ctx.beginPath();
    ctx.moveTo(startX, gy);
    ctx.lineTo(endX, gy);
    ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  // background
  ctx.fillStyle = "#07101a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // grid
  drawGrid();

  // world drawing
  ctx.save();
  ctx.translate(panOffset.x, panOffset.y);
  ctx.scale(zoom, zoom);

  // walls
  ctx.lineWidth = 3 / Math.max(zoom, 1e-6);
  for (const w of map.walls) {
    ctx.strokeStyle = "#b7c6d9";
    ctx.beginPath();
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
    ctx.stroke();

    // endpoints
    ctx.fillStyle = "#7fb5ff";
    ctx.beginPath();
    ctx.arc(w.x1, w.y1, 4 / Math.max(zoom, 1e-6), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w.x2, w.y2, 4 / Math.max(zoom, 1e-6), 0, Math.PI * 2);
    ctx.fill();
  }

  // spawns
  for (const s of map.spawn) {
    ctx.fillStyle = "#ffd064";
    ctx.beginPath();
    ctx.arc(s.x, s.y, gridSize * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#333";
    ctx.font = `${12 / Math.max(zoom, 1e-6)}px sans-serif`;
    // label: draw with world->screen fallback (small hack: draw without scaling)
    // simpler: draw text in transformed space but scaled down to readable size:
    ctx.save();
    ctx.scale(1 / Math.max(zoom, 1e-6), 1 / Math.max(zoom, 1e-6));
    const screen = worldToScreenPoint(s.x, s.y);
    ctx.restore();
    // (we keep label omitted inside transform for simplicity — it was mostly decorative)
  }

  // preview line if drawing
  if (isDown && tool === "draw" && startPt && dragPt) {
    ctx.strokeStyle = "#ffd27a";
    ctx.setLineDash([6 / Math.max(zoom, 1e-6), 6 / Math.max(zoom, 1e-6)]);
    ctx.lineWidth = 2 / Math.max(zoom, 1e-6);
    ctx.beginPath();
    ctx.moveTo(startPt.x, startPt.y);
    ctx.lineTo(dragPt.x, dragPt.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // show snapped endpoints
    const a = { x: snap(startPt.x), y: snap(startPt.y) };
    const b = { x: snap(dragPt.x), y: snap(dragPt.y) };
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(a.x, a.y, 4 / Math.max(zoom, 1e-6), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4 / Math.max(zoom, 1e-6), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  updatePreview();
}

/* --- preview JSON --- */
function updatePreview() {
  const out = {
    spawn: map.spawn.map((s) => ({ x: Math.round(s.x), y: Math.round(s.y) })),
    walls: map.walls.map((w) => ({
      x1: Math.round(w.x1),
      y1: Math.round(w.y1),
      x2: Math.round(w.x2),
      y2: Math.round(w.y2),
    })),
  };
  jsonPreview.value = JSON.stringify(out, null, 2);
}

/* --- UI button handlers that were missing --- */
const clearBtn = document.getElementById("clearBtn");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    map.walls = [];
    map.spawn = [];
    pushHistory();
    draw();
  });
}

const centerBtn = document.getElementById("centerSpawn");
if (centerBtn) {
  centerBtn.addEventListener("click", () => {
    // center in screen space -> convert to world
    const centerWorld = {
      x: (canvas.width / 2 - panOffset.x) / zoom,
      y: (canvas.height / 2 - panOffset.y) / zoom,
    };
    map.spawn = [{ x: snap(centerWorld.x), y: snap(centerWorld.y) }];
    pushHistory();
    draw();
  });
}

const exportBtn = document.getElementById("exportBtn");
if (exportBtn) {
  exportBtn.addEventListener("click", exportJSON);
}

const importBtn = document.getElementById("importBtn");
const fileInput = document.getElementById("fileInput");
if (importBtn && fileInput) {
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileImport);
}

function handleFileImport(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const m = JSON.parse(reader.result);
      if (Array.isArray(m.walls) || Array.isArray(m.spawn)) {
        map.walls = (m.walls || []).map((w) => ({
          x1: +w.x1,
          y1: +w.y1,
          x2: +w.x2,
          y2: +w.y2,
        }));
        map.spawn = (m.spawn || []).map((s) => ({ x: +s.x, y: +s.y }));
        pushHistory();
        draw();
      } else {
        alert("Invalid map format");
      }
    } catch (err) {
      alert("Failed to parse JSON: " + err.message);
    }
  };
  reader.readAsText(f);
  e.target.value = "";
}

function exportJSON() {
  const out = {
    spawn: map.spawn.map((s) => ({ x: Math.round(s.x), y: Math.round(s.y) })),
    walls: map.walls.map((w) => ({
      x1: Math.round(w.x1),
      y1: Math.round(w.y1),
      x2: Math.round(w.x2),
      y2: Math.round(w.y2),
    })),
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "map.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* --- undo/redo buttons --- */
const undoButton = document.getElementById("undoBtn");
const redoButton = document.getElementById("redoBtn");
if (undoButton) undoButton.addEventListener("click", undo);
if (redoButton) redoButton.addEventListener("click", redo);

/* --- keyboard shortcuts --- */
window.addEventListener("keydown", (e) => {
  // ctrl/cmd + z / y
  if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    undo();
  }
  if (e.key === "y" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    redo();
  }
  // tool shortcuts
  if (e.key === "1") setTool("draw");
  if (e.key === "2") setTool("spawn");
  if (e.key === "3") setTool("erase");
  if (e.key === "4") setTool("move");
});

/* --- init --- */
pushHistory();
document.getElementById("gridLabel").innerText = gridSize;
draw();
