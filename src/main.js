/* Map Editor with zoom + pan + min grid */
const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const jsonPreview = document.getElementById("jsonPreview");

let tool = "draw";
let gridSize = parseInt(document.getElementById("gridSize").value, 10) || 5;
gridSize = Math.max(1, gridSize); // enforce min
document.getElementById("gridSize").value = gridSize;
document.getElementById("gridLabel").innerText = gridSize;

// zoom factor: smaller gridSize = zoom in
let zoom = 32 / gridSize; // 32 is reference unit size

let panOffset = { x: 0, y: 0 };

// tools
const toolButtons = {
  draw: document.getElementById("toolDraw"),
  spawn: document.getElementById("toolSpawn"),
  erase: document.getElementById("toolErase"),
  move: document.getElementById("toolMove"),
};
Object.entries(toolButtons).forEach(([k, btn]) => {
  btn.addEventListener("click", () => setTool(k));
});
function setTool(t) {
  tool = t;
  Object.values(toolButtons).forEach((b) => b.classList.remove("active"));
  if (toolButtons[t]) toolButtons[t].classList.add("active");
  canvas.style.cursor = t === "move" ? "grab" : "crosshair";
}

// update grid size + zoom
document.getElementById("gridSize").addEventListener("change", (e) => {
  gridSize = Math.max(1, Math.min(256, parseInt(e.target.value, 10) || 5));
  zoom = 32 / gridSize;
  document.getElementById("gridLabel").innerText = gridSize;
  draw();
});

document.getElementById("canvasSize").addEventListener("change", (e) => {
  const s = parseInt(e.target.value, 10);
  canvas.width = s;
  canvas.height = s;
  draw();
});

// map data
const map = {
  spawn: [
    { x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2) },
  ],
  walls: [],
};

/* undo/redo (same as before) */
let history = [];
let historyPos = -1;
function pushHistory() {
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
  document.getElementById("undoBtn").disabled = historyPos <= 0;
  document.getElementById("redoBtn").disabled =
    historyPos >= history.length - 1;
}

// snapping
function snap(v) {
  return Math.round(v / gridSize) * gridSize;
}

/* coordinate transforms */
function screenToWorld(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  return {
    x: (sx - panOffset.x) / zoom,
    y: (sy - panOffset.y) / zoom,
  };
}
function worldToScreen(x, y) {
  return {
    x: x * zoom + panOffset.x,
    y: y * zoom + panOffset.y,
  };
}

/* interaction */
let isDown = false,
  startPt = null,
  dragPt = null,
  panStart = null;

canvas.addEventListener("mousedown", (ev) => {
  ev.preventDefault();
  const worldPt = screenToWorld(ev);

  if (ev.button === 2) {
    // right click erase
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
    map.spawn = [{ x: snap(startPt.x), y: snap(startPt.y) }];
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
  const p = screenToWorld(ev);
  map.spawn = [{ x: snap(p.x), y: snap(p.y) }];
  pushHistory();
  draw();
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

/* nearest wall (in world space) */
function findNearestWall(pt, threshold = 16) {
  let best = { idx: -1, d2: Infinity };
  for (let i = 0; i < map.walls.length; i++) {
    const w = map.walls[i];
    const dx = w.x2 - w.x1,
      dy = w.y2 - w.y1;
    let t =
      ((pt.x - w.x1) * dx + (pt.y - w.y1) * dy) / (dx * dx + dy * dy || 1);
    t = Math.max(0, Math.min(1, t));
    const cx = w.x1 + t * dx,
      cy = w.y1 + t * dy;
    const d2 = (pt.x - cx) ** 2 + (pt.y - cy) ** 2;
    if (d2 < best.d2) best = { idx: i, d2 };
  }
  return best.d2 <= threshold * threshold ? best.idx : -1;
}

/* rendering */
function drawGrid() {
  const w = canvas.width,
    h = canvas.height;
  ctx.save();
  ctx.translate(panOffset.x, panOffset.y);
  ctx.scale(zoom, zoom);

  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  const step = gridSize;
  const cols = Math.ceil(w / (step * zoom)) + 2;
  const rows = Math.ceil(h / (step * zoom)) + 2;
  for (
    let gx = -panOffset.x / zoom - step * 2;
    gx < w / zoom + step * 2;
    gx += step
  ) {
    ctx.beginPath();
    ctx.moveTo(gx, -10000);
    ctx.lineTo(gx, 10000);
    ctx.stroke();
  }
  for (
    let gy = -panOffset.y / zoom - step * 2;
    gy < h / zoom + step * 2;
    gy += step
  ) {
    ctx.beginPath();
    ctx.moveTo(-10000, gy);
    ctx.lineTo(10000, gy);
    ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  ctx.fillStyle = "#07101a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid();

  ctx.save();
  ctx.translate(panOffset.x, panOffset.y);
  ctx.scale(zoom, zoom);

  // walls
  ctx.lineWidth = 3 / zoom;
  for (const w of map.walls) {
    ctx.strokeStyle = "#b7c6d9";
    ctx.beginPath();
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
    ctx.stroke();
  }

  // spawn
  for (const s of map.spawn) {
    ctx.fillStyle = "#ffd064";
    ctx.beginPath();
    ctx.arc(s.x, s.y, gridSize * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // preview
  if (isDown && tool === "draw" && startPt && dragPt) {
    ctx.strokeStyle = "#ffd27a";
    ctx.setLineDash([6 / zoom, 6 / zoom]);
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.moveTo(startPt.x, startPt.y);
    ctx.lineTo(dragPt.x, dragPt.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
  updatePreview();
}

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

/* init */
pushHistory();
draw();
