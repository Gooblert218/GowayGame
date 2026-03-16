// ═══════════════════════════════════════════════════════════════
//  MAP OVERLAY — terrain map, grid, pings
// ═══════════════════════════════════════════════════════════════
let mapOverlayVisible = false;
let mapImageCache = null;
let mapPings = []; // { worldX, worldZ, time, label, color, colorIndex }
const PING_LIFETIME = 30000; // pings last 30 seconds
const MAX_PINGS = 6;
const PING_COLORS = [
  { hex: '#ff4444', rgb: '255,68,68',   name: 'Red' },
  { hex: '#44aaff', rgb: '68,170,255',  name: 'Blue' },
  { hex: '#44ff44', rgb: '68,255,68',   name: 'Green' },
  { hex: '#ffaa00', rgb: '255,170,0',   name: 'Orange' },
  { hex: '#ff44ff', rgb: '255,68,255',  name: 'Purple' },
  { hex: '#ffff44', rgb: '255,255,68',  name: 'Yellow' },
];
function getNextPingColor() {
  const used = new Set(mapPings.map(p => p.colorIndex));
  for (let i = 0; i < PING_COLORS.length; i++) {
    if (!used.has(i)) return i;
  }
  return 0;
}

// Cached layout values (set each frame so click handler can use them)
let _mapMargin = 32;
let _mapDrawSize = 0;
let _mapCanvasSize = 0;
let _mapWorldSize = 0;

function openMapOverlay() {
  mapOverlayVisible = true;
  mapImageCache = null; // rebuild on open
  document.getElementById('mapOverlay').classList.add('active');
  // Release pointer lock so the cursor is free to click pings
  if (document.pointerLockElement) document.exitPointerLock();
}

function closeMapOverlay() {
  mapOverlayVisible = false;
  document.getElementById('mapOverlay').classList.remove('active');
  // Re-lock pointer for FPS controls
  if (gameRunning && fpsController && fpsController.enabled) {
    fpsController.domElement.requestPointerLock();
  }
}

// G key hold → open/close map
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'g' && gameRunning && !e.repeat) {
    openMapOverlay();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() === 'g' && mapOverlayVisible) {
    closeMapOverlay();
  }
});

// Click on map canvas to place a ping
document.addEventListener('click', (e) => {
  if (!mapOverlayVisible || !currentMapData) return;
  const canvas = document.getElementById('mapCanvas');
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  // Check if click is inside the map draw area
  if (cx < _mapMargin || cx > _mapMargin + _mapDrawSize) return;
  if (cy < _mapMargin || cy > _mapMargin + _mapDrawSize) return;

  // Convert canvas coords to world coords
  const worldX = ((cx - _mapMargin) / _mapDrawSize) * _mapWorldSize;
  const worldZ = ((cy - _mapMargin) / _mapDrawSize) * _mapWorldSize;

  // Build grid label for the ping
  const gridCells = Math.min(20, Math.max(8, Math.floor(_mapWorldSize / 100)));
  const cellWorld = _mapWorldSize / gridCells;
  const gx = Math.floor(worldX / cellWorld);
  const gz = Math.floor(worldZ / cellWorld);
  const label = getGridLabel(Math.max(0, Math.min(gridCells-1, gx))) + Math.max(1, Math.min(gridCells, gz+1));

  // At max? Remove oldest
  if (mapPings.length >= MAX_PINGS) mapPings.shift();
  const ci = getNextPingColor();
  mapPings.push({ worldX, worldZ, time: Date.now(), label, color: PING_COLORS[ci], colorIndex: ci });
});

// Right-click to clear all pings
document.addEventListener('contextmenu', (e) => {
  if (!mapOverlayVisible) return;
  const canvas = document.getElementById('mapCanvas');
  const rect = canvas.getBoundingClientRect();
  if (e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom) {
    e.preventDefault();
    mapPings = [];
  }
});

function getGridLabel(index) {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

function drawMapOverlay() {
  if (!currentMapData || !fpsController) return;

  // Expire old pings
  const now = Date.now();
  mapPings = mapPings.filter(p => now - p.time < PING_LIFETIME);

  const canvas = document.getElementById('mapCanvas');
  const ctx = canvas.getContext('2d');
  const mapSize = currentMapData.metadata.mapSize;
  const terrain = currentMapData.terrain;

  const maxDim = Math.min(window.innerWidth, window.innerHeight) - 100;
  const canvasSize = Math.max(400, Math.min(800, maxDim));
  const margin = 32;
  const drawSize = canvasSize - margin * 2;
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  // Cache layout for click handler
  _mapMargin = margin;
  _mapDrawSize = drawSize;
  _mapCanvasSize = canvasSize;
  _mapWorldSize = mapSize;

  // Grid config
  const gridCells = Math.min(20, Math.max(8, Math.floor(mapSize / 100)));
  const cellPixels = drawSize / gridCells;
  const cellWorld = mapSize / gridCells;

  // Build cached terrain image if needed
  if (!mapImageCache) {
    const imgCanvas = document.createElement('canvas');
    imgCanvas.width = drawSize;
    imgCanvas.height = drawSize;
    const ictx = imgCanvas.getContext('2d');
    const imgData = ictx.createImageData(drawSize, drawSize);
    const px = imgData.data;
    const biomeColors = {
      water: [46,95,127], plains: [140,180,70], grass: [100,160,55],
      sand: [210,180,80], forest: [65,120,40], dense_forest: [50,90,30],
      mountain: [140,140,140],
    };
    const scale = mapSize / drawSize;
    for (let py = 0; py < drawSize; py++) {
      for (let px2 = 0; px2 < drawSize; px2++) {
        const tx = Math.floor(px2 * scale);
        const ty = Math.floor(py * scale);
        const tile = terrain[ty]?.[tx];
        const c = tile ? (biomeColors[tile.biome] || [100,100,100]) : [20,20,20];
        const bright = tile ? (0.7 + tile.height * 0.4) : 0.5;
        const idx = (py * drawSize + px2) * 4;
        px[idx]   = Math.min(255, c[0] * bright);
        px[idx+1] = Math.min(255, c[1] * bright);
        px[idx+2] = Math.min(255, c[2] * bright);
        px[idx+3] = 255;
      }
    }
    ictx.putImageData(imgData, 0, 0);
    mapImageCache = imgCanvas;
  }

  // Clear & background
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  ctx.fillStyle = 'rgba(10,14,26,0.95)';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  // Terrain
  ctx.drawImage(mapImageCache, margin, margin, drawSize, drawSize);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridCells; i++) {
    const x = margin + i * cellPixels;
    const y = margin + i * cellPixels;
    ctx.beginPath(); ctx.moveTo(x, margin); ctx.lineTo(x, margin + drawSize); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(margin + drawSize, y); ctx.stroke();
  }

  // Grid labels — X (letters) top
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i < gridCells; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(getGridLabel(i), margin + i * cellPixels + cellPixels / 2, margin - 16);
  }
  // Y (numbers) left
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < gridCells; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(String(i + 1), margin - 6, margin + i * cellPixels + cellPixels / 2);
  }

  // ── Draw pings ──
  for (const ping of mapPings) {
    const age = now - ping.time;
    const fade = 1 - age / PING_LIFETIME;
    const px = margin + (ping.worldX / mapSize) * drawSize;
    const py = margin + (ping.worldZ / mapSize) * drawSize;

    const pc = ping.color || PING_COLORS[0];

    // Expanding ring animation (first 2 seconds)
    if (age < 2000) {
      const ringProgress = age / 2000;
      const ringRadius = 6 + ringProgress * 18;
      const ringAlpha = (1 - ringProgress) * 0.6 * fade;
      ctx.beginPath();
      ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${pc.rgb},${ringAlpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Ping marker — diamond shape
    const size = 6;
    ctx.beginPath();
    ctx.moveTo(px, py - size);
    ctx.lineTo(px + size, py);
    ctx.lineTo(px, py + size);
    ctx.lineTo(px - size, py);
    ctx.closePath();
    ctx.fillStyle = `rgba(${pc.rgb},${fade})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${fade * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Ping label
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = `rgba(255,255,255,${fade * 0.9})`;
    ctx.fillText(ping.label, px, py - size - 3);
  }

  // ── Player ──
  const pos = fpsController.getPosition();
  const playerCX = margin + (pos.x / mapSize) * drawSize;
  const playerCY = margin + (pos.z / mapSize) * drawSize;

  // Direction line
  const dirLen = 12;
  const dirX = -Math.sin(fpsController.yaw) * dirLen;
  const dirY = -Math.cos(fpsController.yaw) * dirLen;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playerCX, playerCY);
  ctx.lineTo(playerCX + dirX, playerCY + dirY);
  ctx.stroke();

  // Player dot
  ctx.beginPath();
  ctx.arc(playerCX, playerCY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#4285F4';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Pulsing glow
  const pulse = 0.4 + Math.sin(now * 0.005) * 0.3;
  ctx.beginPath();
  ctx.arc(playerCX, playerCY, 10, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(66,133,244,${pulse})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Bottom readout
  const gridX = Math.floor(pos.x / cellWorld);
  const gridY = Math.floor(pos.z / cellWorld);
  const gridStr = getGridLabel(Math.max(0, Math.min(gridCells-1, gridX))) + (Math.max(1, Math.min(gridCells, gridY+1)));
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`Grid: ${gridStr}  |  ${Math.floor(pos.x)}, ${Math.floor(pos.z)}`, canvasSize / 2, canvasSize - margin + 8);
}
