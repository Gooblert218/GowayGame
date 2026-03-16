// ═══════════════════════════════════════════════════════════════
//  UI — Screen management, menus, world storage
// ═══════════════════════════════════════════════════════════════

// ── Screen Management ──
let currentScreen = 'mainMenu';
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  currentScreen = id;
  if (id === 'mapSelect') populateMapList();
  if (id === 'worldSelect') populateWorldList();
}

// ── Available Maps ──
const AVAILABLE_MAPS = [
  { file: 'maps/map1.json', name: 'World 1', size: 2000 },
  { file: 'maps/map2.json', name: 'World 2', size: 2000 },
  { file: 'maps/map3.json', name: 'World 3', size: 2000 },
];

let selectedMapFile = null;

function populateMapList() {
  const list = document.getElementById('mapList');
  list.innerHTML = '';
  selectedMapFile = null;
  document.getElementById('btnNewWorld').disabled = true;

  if (AVAILABLE_MAPS.length === 0) {
    list.innerHTML = '<li class="empty-msg">No maps found. Generate maps with the Map Generator tool.</li>';
    return;
  }

  AVAILABLE_MAPS.forEach((map, i) => {
    const li = document.createElement('li');
    li.className = 'map-item';
    li.innerHTML = `<span class="map-item-name">${map.name}</span><span class="map-item-info">${map.size}x${map.size}</span>`;
    li.onclick = () => {
      list.querySelectorAll('.map-item').forEach(el => el.classList.remove('selected'));
      li.classList.add('selected');
      selectedMapFile = map.file;
      document.getElementById('btnNewWorld').disabled = false;
    };
    if (i === 0) {
      li.classList.add('selected');
      selectedMapFile = map.file;
      document.getElementById('btnNewWorld').disabled = false;
    }
    list.appendChild(li);
  });
}

// ── World Storage (localStorage) ──
const WORLDS_KEY = 'goway_worlds';

function getSavedWorlds() {
  try {
    return JSON.parse(localStorage.getItem(WORLDS_KEY) || '[]');
  } catch { return []; }
}

function saveWorldList(worlds) {
  localStorage.setItem(WORLDS_KEY, JSON.stringify(worlds));
}

let selectedWorldId = null;

function populateWorldList() {
  const list = document.getElementById('worldList');
  list.innerHTML = '';
  selectedWorldId = null;
  const worlds = getSavedWorlds();

  if (worlds.length === 0) {
    list.innerHTML = '<li class="empty-msg">No saved worlds. Create one from Start Game.</li>';
    return;
  }

  worlds.forEach((w, i) => {
    const li = document.createElement('li');
    li.className = 'map-item';
    const date = new Date(w.savedAt).toLocaleDateString();
    li.innerHTML = `<span class="map-item-name">${sanitizeText(w.name)}</span><span class="map-item-info">${date}</span>`;
    li.onclick = () => {
      list.querySelectorAll('.map-item').forEach(el => el.classList.remove('selected'));
      li.classList.add('selected');
      selectedWorldId = w.id;
    };
    list.appendChild(li);
  });
}

function sanitizeText(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function createNewWorld() {
  if (!selectedMapFile) return;
  let worldName = document.getElementById('worldNameInput').value.trim();
  if (!worldName) worldName = 'World ' + (getSavedWorlds().length + 1);
  worldName = worldName.substring(0, 32);
  const worldId = 'world_' + Date.now();
  startLoading(selectedMapFile, worldId, worldName, null);
}

function loadSelectedWorld() {
  if (!selectedWorldId) return;
  const worlds = getSavedWorlds();
  const world = worlds.find(w => w.id === selectedWorldId);
  if (!world) return;
  startLoading(world.mapFile, world.id, world.name, world);
}

function deleteSelectedWorld() {
  if (!selectedWorldId) return;
  let worlds = getSavedWorlds();
  worlds = worlds.filter(w => w.id !== selectedWorldId);
  saveWorldList(worlds);
  localStorage.removeItem('goway_worlddata_' + selectedWorldId);
  selectedWorldId = null;
  populateWorldList();
}

// ── Loading ──
let loadingProgress = 0;
function setLoadingProgress(pct, text) {
  loadingProgress = pct;
  document.getElementById('loadingBar').style.width = pct + '%';
  if (text) document.getElementById('loadingText').textContent = text;
}

function startLoading(mapFile, worldId, worldName, existingWorld) {
  showScreen('loadingScreen');
  setLoadingProgress(5, 'Loading map data...');

  fetch(mapFile)
    .then(r => {
      if (!r.ok) throw new Error('Map file not found: ' + mapFile);
      setLoadingProgress(20, 'Parsing map...');
      return r.json();
    })
    .then(mapData => {
      setLoadingProgress(40, 'Building terrain...');
      setTimeout(() => {
        initGame(mapData, worldId, worldName, mapFile, existingWorld);
      }, 50);
    })
    .catch(err => {
      alert('Failed to load map: ' + err.message);
      showScreen('mainMenu');
    });
}
