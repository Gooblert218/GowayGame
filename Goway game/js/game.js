// ═══════════════════════════════════════════════════════════════
//  GAME ENGINE — Three.js scene, game loop, init/enter/pause/save
// ═══════════════════════════════════════════════════════════════
let scene, camera, renderer;
let fpsController = null;
let gameClock = null;
let mapLoader = null;
let currentWorldId = null;
let currentWorldName = null;
let currentMapFile = null;
let currentMapData = null;
let gameRunning = false;
let sceneMeshes = [];

// FPS counter
let fpsFrameCount = 0;
let fpsLastTime = Date.now();

// ── Player Survival Stats ──
const playerStats = {
  health: 100,
  thirst: 100,
  hunger: 100,
};
const THIRST_DECAY_PER_SEC = 0.2;   // slowest — ~8 min to empty
const HUNGER_DECAY_PER_SEC = 0.5;   // fastest — ~3.3 min to empty
const DEHYDRATION_DMG_PER_SEC = 3;  // damage when thirst=0
const STARVATION_DMG_PER_SEC = 2;   // damage when hunger=0
const DRINK_AMOUNT = 30;            // thirst restored per drink
const WATER_INTERACT_RANGE = 3;     // tiles ahead to check

// ── Inventory ──
const HOTBAR_SIZE = 10;
const INVENTORY_ROWS = 3; // 3 extra rows in full inventory
const MAX_STACK_SIZE = 1000;
let hotbarSlots = new Array(HOTBAR_SIZE).fill(null);
let inventorySlots = new Array(HOTBAR_SIZE * INVENTORY_ROWS).fill(null);
let selectedSlot = 0;
let inventoryOpen = false;
let invSelectedIndex = -1; // index into unified slots for detail panel
let invDragFrom = -1;      // drag source index

// ── Held Item (bat model in bottom-right) ──
let heldItemGroup = null;
let batModelData = null;
let swingAnim = 0; // 0 = idle, >0 = swinging
const SWING_DURATION = 0.35;
let swingCooldown = 0;
const SWING_COOLDOWN = 0.5; // seconds between hits

// ── Tree Health ──
let treeHealthMap = {};    // key: "x,y" → remaining HP
const TREE_MAX_HP = 5;
const BAT_DAMAGE = 1;
const HIT_RANGE = 3.5;
let brokenTrees = [];      // [{x, y, subType, treeScale, height, brokenAt}]
let originalTreeData = []; // full original tree list for respawning
const TREE_RESPAWN_DAYS = 1; // respawn after 1 in-game day

// ── Node (Stone/Metal) Health ──
let nodeHealthMap = {};    // key: "x,y" → remaining HP
const NODE_MIN_HP = 15;
const NODE_MAX_HP = 20;
const NODE_STONE_PER_HIT = 4;        // stone given per hit
const NODE_STONE_ON_BREAK = 50;      // bonus stone on final break
let brokenNodes = [];      // [{x, y, subType, scale, height, brokenAtDay, brokenAtTime}]
let originalNodeData = []; // full original node list for respawning
const NODE_RESPAWN_DAYS = 3; // respawn after 3 in-game days
let stoneModelData = null;
let breakingNodes = [];    // [{x, y, timer, totalTime}] visual shake/shrink animation

// ── Sounds ──
let sndHit, sndWalk, sndRun, sndAmbience;
let currentMoveSound = null; // 'walk' | 'run' | null

// ── Particles ──
let hitParticles = [];
let fallingTrees = [];  // [{mesh, x, z, rotSpeed, timer, totalTime, phase}]

// ── Ground Items ──
let groundItems = [];     // [{type, name, count, x, y, z, mesh, spawnTime}]
const GROUND_ITEM_DESPAWN = 20 * 60 * 1000; // 20 minutes in ms
const GROUND_PICKUP_RANGE = 2.0;
let woodModelData = null;

// ── Day/Night Cycle ──
const DAY_CYCLE_LENGTH = 30 * 60;  // 30 minutes total
const DAY_LENGTH = 15 * 60;        // 15 min day
const NIGHT_LENGTH = 15 * 60;      // 15 min night
let dayTime = DAY_LENGTH * 0.35;    // start at sunrise (~morning)
let dayCount = 0;
let sunMesh = null;
let ambientLight = null;
let sunLight = null;
let backLight = null;

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 200, 500);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = false;
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  // Lighting
  ambientLight = new THREE.AmbientLight(0xd0d0ff, 0.7);
  scene.add(ambientLight);
  sunLight = new THREE.DirectionalLight(0xfffacd, 0.6);
  sunLight.position.set(150, 200, 150);
  scene.add(sunLight);
  backLight = new THREE.DirectionalLight(0x99ccff, 0.3);
  backLight.position.set(-150, 100, -150);
  scene.add(backLight);

  // Sun sphere — large and far away to look like part of the skybox
  const sunGeo = new THREE.SphereGeometry(40, 16, 12);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffee88, fog: false });
  sunMesh = new THREE.Mesh(sunGeo, sunMat);
  scene.add(sunMesh);

  gameClock = new THREE.Clock();
  mapLoader = new MapLoader();

  // Load sounds
  sndHit = new Audio('sounds/hit.mp3');
  sndWalk = new Audio('sounds/walking.MP3');
  sndWalk.loop = true;
  sndWalk.volume = 0.4;
  sndRun = new Audio('sounds/running.MP3');
  sndRun.loop = true;
  sndRun.volume = 0.5;
  sndAmbience = new Audio('sounds/ambience.mp3');
  sndAmbience.loop = true;
  sndAmbience.volume = 0.15;

  // Load bat model
  fetch('models/bat.json').then(r => r.json()).then(data => {
    batModelData = data;
  }).catch(() => {});

  // Load wood model
  fetch('models/wood.json').then(r => r.json()).then(data => {
    woodModelData = data;
  }).catch(() => {});

  // Load stone_node model (for inventory preview / ground item)
  fetch('models/stone_node.json').then(r => r.json()).then(data => {
    stoneModelData = data;
  }).catch(() => {});

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

// ── Compass Setup ──
let compassBuilt = false;
const COMPASS_TICK_WIDTH = 12; // pixels per degree
const COMPASS_LABELS = {
  0:'N', 45:'NE', 90:'E', 135:'SE', 180:'S', 225:'SW', 270:'W', 315:'NW'
};

function buildCompassStrip() {
  const strip = document.getElementById('compass-strip');
  strip.innerHTML = '';
  // Build 3 copies of 0-359 so we can always read from the middle copy
  for (let pass = 0; pass < 3; pass++) {
    for (let deg = 0; deg < 360; deg += 5) {
      const tick = document.createElement('span');
      tick.className = 'compass-tick';
      tick.style.width = (COMPASS_TICK_WIDTH * 5) + 'px';
      const label = COMPASS_LABELS[deg];
      if (label && label.length === 1) {
        tick.classList.add('cardinal');
        tick.textContent = label;
      } else if (label) {
        tick.classList.add('intercardinal');
        tick.textContent = label;
      } else if (deg % 10 === 0) {
        tick.textContent = deg;
      } else {
        tick.textContent = '|';
      }
      strip.appendChild(tick);
    }
  }
  compassBuilt = true;
}

function updateCompass(yaw) {
  if (!compassBuilt) buildCompassStrip();
  // yaw is in radians; convert to 0-360 bearing
  let deg = (-yaw * 180 / Math.PI) % 360;
  if (deg < 0) deg += 360;
  const strip = document.getElementById('compass-strip');
  const compassWidth = 400; // must match CSS #compass width
  const fullLoop = 360 * COMPASS_TICK_WIDTH; // pixels for one full 360° copy
  // Offset into the middle (second) copy so wrapping is seamless
  const offset = -fullLoop - (deg * COMPASS_TICK_WIDTH) + compassWidth / 2;
  strip.style.left = offset + 'px';

  // Render ping markers on compass
  const pingsContainer = document.getElementById('compass-pings');
  pingsContainer.innerHTML = '';
  if (!fpsController || typeof mapPings === 'undefined') return;
  const pos = fpsController.getPosition();
  const now = Date.now();
  for (const ping of mapPings) {
    const age = now - ping.time;
    if (age >= PING_LIFETIME) continue;
    const fade = 1 - age / PING_LIFETIME;
    // Bearing from player to ping
    const dx = ping.worldX - pos.x;
    const dz = ping.worldZ - pos.z;
    let pingBearing = Math.atan2(dx, -dz) * 180 / Math.PI;
    if (pingBearing < 0) pingBearing += 360;
    // Relative angle on compass
    let relAngle = pingBearing - deg;
    if (relAngle > 180) relAngle -= 360;
    if (relAngle < -180) relAngle += 360;
    const halfView = compassWidth / 2 / COMPASS_TICK_WIDTH; // degrees visible each side
    if (Math.abs(relAngle) > halfView) continue;
    const px = compassWidth / 2 + relAngle * COMPASS_TICK_WIDTH;
    const pc = ping.color || (typeof PING_COLORS !== 'undefined' ? PING_COLORS[0] : {hex:'#ff4444'});
    // Diamond marker
    const marker = document.createElement('div');
    marker.className = 'compass-ping-marker';
    marker.style.left = px + 'px';
    marker.style.backgroundColor = pc.hex;
    marker.style.opacity = fade;
    pingsContainer.appendChild(marker);
    // Distance label
    const dist = Math.sqrt(dx * dx + dz * dz);
    const distLabel = document.createElement('div');
    distLabel.className = 'compass-ping-dist';
    distLabel.style.left = px + 'px';
    distLabel.style.color = pc.hex;
    distLabel.style.opacity = fade;
    distLabel.textContent = dist < 1000 ? Math.round(dist) + 'm' : (dist / 1000).toFixed(1) + 'k';
    pingsContainer.appendChild(distLabel);
  }
}

function animate() {
  requestAnimationFrame(animate);

  if (gameRunning && fpsController) {
    const dt = gameClock.getDelta();
    fpsController.update(dt);

    // HUD updates
    fpsFrameCount++;
    const now = Date.now();
    if (now - fpsLastTime >= 500) {
      document.getElementById('hud-fps').textContent = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000)) + ' FPS';
      fpsFrameCount = 0;
      fpsLastTime = now;
    }
    const p = fpsController.getPosition();
    document.getElementById('hud-position').textContent = `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`;

    // ── Survival tick ──
    updateSurvivalStats(dt);
    updateSurvivalBars();
    updateInteractPrompt();

    // ── Held item & swing ──
    updateHeldItem(dt);
    updateHitParticles(dt);
    updateFallingTrees(dt);
    updateBreakingNodes(dt);
    updatePlayerSounds();
    if (swingCooldown > 0) swingCooldown -= dt;

    // ── Ground items ──
    updateGroundItems(dt);

    // ── Day/Night ──
    updateDayNightCycle(dt);
    updateDayTimeHUD();

    // Compass
    updateCompass(fpsController.yaw);

    // Map overlay
    if (mapOverlayVisible) drawMapOverlay();
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function initGame(mapData, worldId, worldName, mapFile, existingWorld) {
  currentMapData = mapData;
  currentWorldId = worldId;
  currentWorldName = worldName;
  currentMapFile = mapFile;

  setLoadingProgress(50, 'Building terrain...');

  setTimeout(() => {
    // Clear old scene meshes
    sceneMeshes.forEach(m => {
      scene.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach(mt => mt.dispose());
        else m.material.dispose();
      }
    });
    sceneMeshes = [];

    setLoadingProgress(60, 'Generating objects...');

    setTimeout(async () => {
      const meshes = await mapLoader.createSceneObjects(mapData);
      meshes.forEach(m => { scene.add(m); sceneMeshes.push(m); });

      setLoadingProgress(80, 'Setting up physics...');

      setTimeout(() => {
        const heightmap = mapData.terrain.map(row => row.map(tile => tile.height * 10));
        const collisionData = {
          heightmap: heightmap,
          objectCollisions: mapData.objects.map(obj => ({
            x: obj.x, y: obj.y, type: obj.type, radius: 0.35, height: obj.height * 10
          }))
        };

        fpsController = new FPSController(camera, renderer.domElement, heightmap, collisionData);

        const size = mapData.metadata.mapSize;
        let startX, startY, startZ;

        if (existingWorld && existingWorld.playerPos) {
          startX = existingWorld.playerPos.x;
          startY = existingWorld.playerPos.y;
          startZ = existingWorld.playerPos.z;
          if (existingWorld.playerLook) {
            fpsController.yaw = existingWorld.playerLook.yaw;
            fpsController.pitch = existingWorld.playerLook.pitch;
          }
          // Restore survival stats
          if (existingWorld.playerStats) {
            playerStats.health = existingWorld.playerStats.health;
            playerStats.thirst = existingWorld.playerStats.thirst;
            playerStats.hunger = existingWorld.playerStats.hunger;
          }
          // Restore inventory
          if (existingWorld.inventory) {
            hotbarSlots = existingWorld.inventory.hotbar || new Array(HOTBAR_SIZE).fill(null);
            inventorySlots = existingWorld.inventory.inv || new Array(HOTBAR_SIZE * INVENTORY_ROWS).fill(null);
            selectedSlot = existingWorld.inventory.selected || 0;
          }
          if (existingWorld.brokenTrees) brokenTrees = existingWorld.brokenTrees;
          if (existingWorld.brokenNodes) brokenNodes = existingWorld.brokenNodes;
          if (existingWorld.dayTime !== undefined) dayTime = existingWorld.dayTime;
          if (existingWorld.dayCount !== undefined) dayCount = existingWorld.dayCount;
        } else {
          // Random starting stats 50-70
          playerStats.health = Math.floor(Math.random() * 21) + 50;
          playerStats.thirst = Math.floor(Math.random() * 21) + 50;
          playerStats.hunger = Math.floor(Math.random() * 21) + 50;
          // Fresh inventory with bat in slot 0
          hotbarSlots = new Array(HOTBAR_SIZE).fill(null);
          hotbarSlots[0] = { type: 'bat', name: 'Bat' };
          inventorySlots = new Array(HOTBAR_SIZE * INVENTORY_ROWS).fill(null);
          selectedSlot = 0;
          brokenTrees = [];
          brokenNodes = [];
          dayTime = DAY_LENGTH * 0.35; // morning
          dayCount = 0;
          startX = size / 2;
          startZ = size / 2;
          for (let r = 0; r < 50; r++) {
            for (let dx = -r; dx <= r; dx++) {
              for (let dz = -r; dz <= r; dz++) {
                const tx = Math.floor(startX + dx);
                const tz = Math.floor(startZ + dz);
                if (tx >= 0 && tx < size && tz >= 0 && tz < size) {
                  const tile = mapData.terrain[tz]?.[tx];
                  if (tile && tile.walkable) {
                    startX = tx + 0.5;
                    startZ = tz + 0.5;
                    r = 999; dx = 999; dz = 999;
                  }
                }
              }
            }
          }
          startY = (heightmap[Math.floor(startZ)]?.[Math.floor(startX)] || 0) + 1.7;
        }

        fpsController.setPosition(startX, startY, startZ);

        setLoadingProgress(100, 'Ready!');

        setTimeout(() => {
          if (!existingWorld) {
            const worlds = getSavedWorlds();
            worlds.push({
              id: worldId,
              name: worldName,
              mapFile: mapFile,
              savedAt: Date.now(),
              playerPos: { x: startX, y: startY, z: startZ },
              playerLook: { yaw: 0, pitch: 0 },
            });
            saveWorldList(worlds);
          }
          enterGame();
        }, 300);
      }, 50);
    }, 50);
  }, 50);
}

function enterGame() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('hud').classList.add('active');
  buildHotbar();
  buildInventoryGrid();
  buildHeldItem();
  treeHealthMap = {};
  nodeHealthMap = {};
  // Store original tree data for respawning
  if (currentMapData) {
    originalTreeData = currentMapData.objects.filter(o => o.type === 'tree').map(t => ({...t}));
    originalNodeData = currentMapData.objects.filter(o => o.type === 'node').map(n => ({...n}));
  }
  // Apply saved broken trees & nodes, check respawns
  applyBrokenTrees();
  applyBrokenNodes();
  // Restore ground items
  restoreGroundItems();
  gameRunning = true;
  fpsController.enable();
  gameClock.getDelta();
  // Start ambience
  if (sndAmbience) sndAmbience.play().catch(() => {});
}

function pauseGame() {
  if (!gameRunning) return;
  // Close inventory if open instead of pausing
  if (inventoryOpen) {
    toggleInventory();
    return;
  }
  gameRunning = false;
  fpsController.disable();
  stopMoveSounds();
  if (sndAmbience) sndAmbience.pause();
  showScreen('pauseMenu');
  document.getElementById('hud').classList.remove('active');
}

function resumeGame() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('hud').classList.add('active');
  gameRunning = true;
  fpsController.enable();
  gameClock.getDelta();
  if (sndAmbience) sndAmbience.play().catch(() => {});
}

function saveGame() {
  if (!currentWorldId || !fpsController) return;
  const worlds = getSavedWorlds();
  const world = worlds.find(w => w.id === currentWorldId);
  if (!world) return;
  const pos = fpsController.getPosition();
  world.playerPos = { x: pos.x, y: pos.y, z: pos.z };
  world.playerLook = { yaw: fpsController.yaw, pitch: fpsController.pitch };
  world.playerStats = { health: playerStats.health, thirst: playerStats.thirst, hunger: playerStats.hunger };
  world.inventory = { hotbar: hotbarSlots.slice(), inv: inventorySlots.slice(), selected: selectedSlot };
  world.brokenTrees = brokenTrees.slice();
  world.brokenNodes = brokenNodes.slice();
  world.dayTime = dayTime;
  world.dayCount = dayCount;
  // Save ground items (without mesh references)
  world.groundItems = groundItems.map(gi => ({
    type: gi.type, name: gi.name, count: gi.count,
    x: gi.x, y: gi.y, z: gi.z, spawnTime: gi.spawnTime
  }));
  world.savedAt = Date.now();
  saveWorldList(worlds);
}

function saveAndQuit() {
  saveGame();

  // Stop sounds
  if (sndAmbience) { sndAmbience.pause(); sndAmbience.currentTime = 0; }
  stopMoveSounds();

  // Remove held item
  if (heldItemGroup) { camera.remove(heldItemGroup); heldItemGroup = null; }
  // Clear particles
  hitParticles.forEach(p => scene.remove(p.mesh));
  hitParticles = [];

  gameRunning = false;
  if (inventoryOpen) {
    inventoryOpen = false;
    document.getElementById('inventoryOverlay').classList.remove('active');
  }
  hideItemDetail();
  // Clear pickup notifications
  const notifContainer = document.getElementById('pickup-notifications');
  if (notifContainer) notifContainer.innerHTML = '';
  for (const k in pickupNotifs) { clearTimeout(pickupNotifs[k].timer); }
  pickupNotifs = {};
  // Clear ground items
  groundItems.forEach(gi => { if (gi.mesh) scene.remove(gi.mesh); });
  groundItems = [];
  if (fpsController) fpsController.disable();
  fpsController = null;
  document.getElementById('hud').classList.remove('active');

  sceneMeshes.forEach(m => {
    scene.remove(m);
    if (m.traverse) {
      m.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(mt => mt.dispose());
          else child.material.dispose();
        }
      });
    }
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) m.material.forEach(mt => mt.dispose());
      else m.material.dispose();
    }
  });
  sceneMeshes = [];
  currentMapData = null;
  mapPings = [];

  showScreen('mainMenu');
}

// ═══════════════════════════════════════════════════════════════
//  SURVIVAL SYSTEM — health, thirst, hunger
// ═══════════════════════════════════════════════════════════════

function updateSurvivalStats(dt) {
  // Drain thirst & hunger over time
  playerStats.thirst = Math.max(0, playerStats.thirst - THIRST_DECAY_PER_SEC * dt);
  playerStats.hunger = Math.max(0, playerStats.hunger - HUNGER_DECAY_PER_SEC * dt);

  // Take damage when thirst or hunger are depleted
  if (playerStats.thirst <= 0) {
    playerStats.health = Math.max(0, playerStats.health - DEHYDRATION_DMG_PER_SEC * dt);
  }
  if (playerStats.hunger <= 0) {
    playerStats.health = Math.max(0, playerStats.health - STARVATION_DMG_PER_SEC * dt);
  }
}

function updateSurvivalBars() {
  document.getElementById('bar-health').style.width = playerStats.health + '%';
  document.getElementById('bar-thirst').style.width = playerStats.thirst + '%';
  document.getElementById('bar-hunger').style.width = playerStats.hunger + '%';
}

// Returns true if the player is looking at a water tile within range
function isLookingAtWater() {
  if (!fpsController || !currentMapData) return false;
  const pos = fpsController.getPosition();
  // Use full 3D forward direction from camera (including pitch)
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  // Raycast in small steps checking for water tiles
  for (let d = 0.5; d <= WATER_INTERACT_RANGE; d += 0.5) {
    const rx = pos.x + forward.x * d;
    const ry = pos.y + forward.y * d;
    const rz = pos.z + forward.z * d;
    const tx = Math.floor(rx);
    const tz = Math.floor(rz);
    const size = currentMapData.metadata.mapSize;
    if (tx >= 0 && tx < size && tz >= 0 && tz < size) {
      const tile = currentMapData.terrain[tz]?.[tx];
      if (tile && tile.biome === 'water') {
        // Check the ray actually hits near water level
        const waterH = 0.15 * 10;
        if (ry <= waterH + 1.5) return true;
      }
    }
  }
  return false;
}

function updateInteractPrompt() {
  const prompt = document.getElementById('interact-prompt');
  const nearItem = getNearestGroundItem();
  if (nearItem) {
    prompt.textContent = 'Press E to pick up ' + (nearItem.name || nearItem.type);
    prompt.classList.add('active');
  } else if (isLookingAtWater()) {
    prompt.textContent = 'Press E to drink';
    prompt.classList.add('active');
  } else {
    prompt.classList.remove('active');
  }
}

function drinkWater() {
  if (!isLookingAtWater()) return;
  playerStats.thirst = Math.min(100, playerStats.thirst + DRINK_AMOUNT);
}

// Listen for E key — interact or toggle inventory
document.addEventListener('keydown', function(e) {
  if (!gameRunning || !fpsController || !fpsController.pointerLocked && !inventoryOpen) return;
  const key = e.key.toLowerCase();

  if (key === 'e') {
    if (!inventoryOpen) {
      // Priority: pickup ground item > drink water > toggle inventory
      if (getNearestGroundItem()) {
        pickupNearestGroundItem();
        return;
      }
      if (isLookingAtWater()) {
        drinkWater();
        return;
      }
    }
    toggleInventory();
    return;
  }

  // Number keys 1-9,0 → select hotbar slot (only when inventory is closed)
  if (!inventoryOpen && key >= '1' && key <= '9') {
    selectHotbarSlot(parseInt(key) - 1);
    return;
  }
  if (!inventoryOpen && key === '0') {
    selectHotbarSlot(9);
    return;
  }
});

// Scroll wheel to cycle hotbar
document.addEventListener('wheel', function(e) {
  if (!gameRunning || !fpsController || inventoryOpen) return;
  if (typeof mapOverlayVisible !== 'undefined' && mapOverlayVisible) return;
  if (e.deltaY > 0) {
    selectHotbarSlot((selectedSlot + 1) % HOTBAR_SIZE);
  } else if (e.deltaY < 0) {
    selectHotbarSlot((selectedSlot - 1 + HOTBAR_SIZE) % HOTBAR_SIZE);
  }
});

function toggleInventory() {
  inventoryOpen = !inventoryOpen;
  const overlay = document.getElementById('inventoryOverlay');
  if (inventoryOpen) {
    overlay.classList.add('active');
    invSelectedIndex = -1;
    hideItemDetail();
    buildInventoryGrid();
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    overlay.classList.remove('active');
    hideItemDetail();
    hideWoodPreview();
    // Re-lock pointer
    if (fpsController && fpsController.enabled) {
      fpsController.domElement.requestPointerLock();
    }
  }
}

function buildHotbar() {
  const bar = document.getElementById('hotbar');
  bar.innerHTML = '';
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot' + (i === selectedSlot ? ' selected' : '');
    const num = document.createElement('span');
    num.className = 'hotbar-slot-num';
    num.textContent = (i + 1) % 10; // 1-9, 0
    slot.appendChild(num);
    // Show item label if present
    if (hotbarSlots[i]) {
      const label = document.createElement('span');
      label.className = 'hotbar-slot-item';
      label.textContent = hotbarSlots[i].name || '';
      slot.appendChild(label);
      // Show count for stackable items
      if (hotbarSlots[i].count && hotbarSlots[i].count > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'hotbar-slot-count';
        cnt.textContent = hotbarSlots[i].count;
        slot.appendChild(cnt);
      }
    }
    bar.appendChild(slot);
  }
}

let activeInvTab = 'inventory'; // 'inventory' | 'crafting'

function buildInventoryGrid() {
  const hotbarSection = document.getElementById('inventoryHotbarSection');
  const invSection = document.getElementById('inventoryInvSection');
  const craftingSection = document.getElementById('inventoryCraftingSection');

  // Build tab bar
  let tabBar = document.getElementById('invTabBar');
  if (!tabBar) {
    tabBar = document.createElement('div');
    tabBar.id = 'invTabBar';
    tabBar.className = 'inv-tab-bar';
    hotbarSection.parentElement.insertBefore(tabBar, hotbarSection);
  }
  tabBar.innerHTML = '';
  const invTab = document.createElement('button');
  invTab.className = 'inv-tab' + (activeInvTab === 'inventory' ? ' active' : '');
  invTab.textContent = 'Inventory';
  invTab.onclick = () => { activeInvTab = 'inventory'; buildInventoryGrid(); };
  const craftTab = document.createElement('button');
  craftTab.className = 'inv-tab' + (activeInvTab === 'crafting' ? ' active' : '');
  craftTab.textContent = 'Crafting';
  craftTab.onclick = () => { activeInvTab = 'crafting'; buildInventoryGrid(); };
  tabBar.appendChild(invTab);
  tabBar.appendChild(craftTab);

  if (activeInvTab === 'crafting') {
    hotbarSection.style.display = 'none';
    invSection.style.display = 'none';
    craftingSection.style.display = 'block';
    craftingSection.innerHTML = '<div class="crafting-empty">No recipes yet</div>';
    return;
  }

  hotbarSection.style.display = '';
  invSection.style.display = '';
  craftingSection.style.display = 'none';

  hotbarSection.innerHTML = '<div class="inv-section-label">Hotbar</div>';
  invSection.innerHTML = '<div class="inv-section-label">Inventory</div>';

  const hotbarGrid = document.createElement('div');
  hotbarGrid.className = 'inventory-grid';
  const invGrid = document.createElement('div');
  invGrid.className = 'inventory-grid';

  // Build hotbar row
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    hotbarGrid.appendChild(createInvSlotElement(i, hotbarSlots[i]));
  }
  // Build inventory rows
  for (let i = 0; i < inventorySlots.length; i++) {
    invGrid.appendChild(createInvSlotElement(i + HOTBAR_SIZE, inventorySlots[i]));
  }

  hotbarSection.appendChild(hotbarGrid);
  invSection.appendChild(invGrid);
}

// Unified index: 0..9 = hotbar, 10..39 = inventory
function getSlotItem(idx) {
  return idx < HOTBAR_SIZE ? hotbarSlots[idx] : inventorySlots[idx - HOTBAR_SIZE];
}
function setSlotItem(idx, item) {
  if (idx < HOTBAR_SIZE) hotbarSlots[idx] = item;
  else inventorySlots[idx - HOTBAR_SIZE] = item;
}

function createInvSlotElement(idx, item) {
  const slot = document.createElement('div');
  slot.className = 'inv-slot';
  slot.dataset.idx = idx;
  if (idx === invSelectedIndex) slot.classList.add('inv-selected');

  if (item) {
    const label = document.createElement('span');
    label.className = 'inv-slot-label';
    label.textContent = item.name || '';
    slot.appendChild(label);
    if (item.count && item.count > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'inv-slot-count';
      cnt.textContent = item.count;
      slot.appendChild(cnt);
    }
    // Drag start
    slot.draggable = true;
    slot.addEventListener('dragstart', function(e) {
      invDragFrom = idx;
      this.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    slot.addEventListener('dragend', function() {
      this.classList.remove('dragging');
    });
  }

  // Drag over / drop
  slot.addEventListener('dragover', function(e) {
    e.preventDefault();
    this.classList.add('drag-over');
  });
  slot.addEventListener('dragleave', function() {
    this.classList.remove('drag-over');
  });
  slot.addEventListener('drop', function(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    if (invDragFrom === -2) {
      // Detail split drag — split typed amount from selected item into this slot
      handleDetailSplitDrop(idx);
      invDragFrom = -1;
      return;
    }
    if (invDragFrom < 0) return;
    const toIdx = idx;
    if (invDragFrom === toIdx) { invDragFrom = -1; return; }
    moveOrSwapSlots(invDragFrom, toIdx);
    invDragFrom = -1;
  });

  // Left click — select for detail panel
  slot.addEventListener('click', function() {
    if (!item) { invSelectedIndex = -1; hideItemDetail(); buildInventoryGrid(); return; }
    invSelectedIndex = idx;
    showItemDetail(idx, item);
    buildInventoryGrid();
  });

  // Right click — instant transfer between hotbar/inventory
  slot.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    if (!item) return;
    instantTransferSlot(idx);
  });

  return slot;
}

function moveOrSwapSlots(fromIdx, toIdx) {
  const fromItem = getSlotItem(fromIdx);
  const toItem = getSlotItem(toIdx);

  // Try to stack if same type
  if (fromItem && toItem && fromItem.type === toItem.type) {
    const canAdd = MAX_STACK_SIZE - (toItem.count || 0);
    if (canAdd > 0) {
      const toMove = Math.min(fromItem.count || 1, canAdd);
      toItem.count = (toItem.count || 0) + toMove;
      fromItem.count = (fromItem.count || 0) - toMove;
      if (fromItem.count <= 0) setSlotItem(fromIdx, null);
      buildHotbar();
      buildInventoryGrid();
      return;
    }
  }
  // Swap
  setSlotItem(fromIdx, toItem);
  setSlotItem(toIdx, fromItem);
  buildHotbar();
  buildInventoryGrid();
}

function instantTransferSlot(idx) {
  const item = getSlotItem(idx);
  if (!item) return;
  const isInHotbar = idx < HOTBAR_SIZE;

  if (isInHotbar) {
    // Transfer to inventory — try stack first
    for (let i = 0; i < inventorySlots.length; i++) {
      if (inventorySlots[i] && inventorySlots[i].type === item.type) {
        const canAdd = MAX_STACK_SIZE - (inventorySlots[i].count || 0);
        if (canAdd >= (item.count || 1)) {
          inventorySlots[i].count = (inventorySlots[i].count || 0) + (item.count || 1);
          setSlotItem(idx, null);
          buildHotbar(); buildInventoryGrid(); return;
        }
      }
    }
    // Find empty inv slot
    for (let i = 0; i < inventorySlots.length; i++) {
      if (!inventorySlots[i]) {
        inventorySlots[i] = item;
        setSlotItem(idx, null);
        buildHotbar(); buildInventoryGrid(); return;
      }
    }
  } else {
    // Transfer to hotbar — try stack first
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (hotbarSlots[i] && hotbarSlots[i].type === item.type) {
        const canAdd = MAX_STACK_SIZE - (hotbarSlots[i].count || 0);
        if (canAdd >= (item.count || 1)) {
          hotbarSlots[i].count = (hotbarSlots[i].count || 0) + (item.count || 1);
          setSlotItem(idx, null);
          buildHotbar(); buildInventoryGrid(); return;
        }
      }
    }
    // Find empty hotbar slot
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (!hotbarSlots[i]) {
        hotbarSlots[i] = item;
        setSlotItem(idx, null);
        buildHotbar(); buildInventoryGrid(); return;
      }
    }
  }
}

// \u2500\u2500 Item Detail Panel \u2500\u2500
let detailPreviewRenderer = null;
let detailPreviewScene = null;
let detailPreviewCamera = null;
let detailPreviewMesh = null;
let detailPreviewRAF = null;

const ITEM_DESCRIPTIONS = {
  bat: 'A sturdy wooden bat. Good for hitting things. 20% wood harvest rate.',
  wood: 'Raw wood harvested from trees. Used for building and crafting.',
  stone: 'Stone harvested from stone nodes. Used for building and crafting.',
};

function getItemMesh(type) {
  if (type === 'wood') return createWoodMesh();
  if (type === 'bat') return buildBatMesh();
  if (type === 'stone') return createStoneMesh();
  // Fallback cube
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const mat = new THREE.MeshPhongMaterial({ color: 0x888888 });
  return new THREE.Mesh(geo, mat);
}

function showItemDetail(idx, item) {
  hideItemDetailPreview();
  const panel = document.getElementById('itemDetailPanel');
  panel.classList.add('active');
  document.getElementById('itemDetailName').textContent = item.name || item.type;
  document.getElementById('itemDetailDesc').textContent = ITEM_DESCRIPTIONS[item.type] || 'An item.';
  const dropInput = document.getElementById('itemDropCount');
  dropInput.max = item.count || 1;
  dropInput.value = item.count || 1;

  // 3D preview
  const container = document.getElementById('itemDetailPreview');
  container.innerHTML = '';
  detailPreviewRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  detailPreviewRenderer.setSize(80, 80);
  detailPreviewRenderer.setPixelRatio(2);
  container.appendChild(detailPreviewRenderer.domElement);

  detailPreviewScene = new THREE.Scene();
  detailPreviewCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
  detailPreviewCamera.position.set(0, 0.5, 2.5);
  detailPreviewCamera.lookAt(0, 0, 0);
  detailPreviewScene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dl = new THREE.DirectionalLight(0xffffff, 0.6);
  dl.position.set(1, 2, 1);
  detailPreviewScene.add(dl);

  detailPreviewMesh = getItemMesh(item.type);
  if (item.type === 'bat') {
    detailPreviewMesh.scale.set(0.07, 0.07, 0.07);
    detailPreviewMesh.position.y = -0.15;
  } else if (item.type === 'wood') {
    detailPreviewMesh.scale.set(0.06, 0.06, 0.06);
    detailPreviewMesh.position.y = -0.1;
  } else if (item.type === 'stone') {
    detailPreviewMesh.scale.set(0.06, 0.06, 0.06);
    detailPreviewMesh.position.y = -0.1;
  }
  detailPreviewScene.add(detailPreviewMesh);

  function animDetail() {
    detailPreviewRAF = requestAnimationFrame(animDetail);
    if (detailPreviewMesh) detailPreviewMesh.rotation.y += 0.015;
    if (detailPreviewRenderer && detailPreviewScene && detailPreviewCamera) {
      detailPreviewRenderer.render(detailPreviewScene, detailPreviewCamera);
    }
  }
  animDetail();

  // Make preview draggable for splitting
  container.draggable = true;
  container.addEventListener('dragstart', function(e) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'detail-split');
    invDragFrom = -2; // special: detail split drag
  });
}

function hideItemDetailPreview() {
  if (detailPreviewRAF) { cancelAnimationFrame(detailPreviewRAF); detailPreviewRAF = null; }
  if (detailPreviewRenderer) { detailPreviewRenderer.dispose(); detailPreviewRenderer = null; }
  detailPreviewScene = null;
  detailPreviewCamera = null;
  detailPreviewMesh = null;
}

function hideItemDetail() {
  hideItemDetailPreview();
  const panel = document.getElementById('itemDetailPanel');
  if (panel) panel.classList.remove('active');
  invSelectedIndex = -1;
}

function dropSelectedItem() {
  if (invSelectedIndex < 0) return;
  const item = getSlotItem(invSelectedIndex);
  if (!item) return;
  const dropInput = document.getElementById('itemDropCount');
  let amount = parseInt(dropInput.value) || 0;
  if (amount < 1) amount = 1;
  if (amount > (item.count || 1)) amount = item.count || 1;
  item.count = (item.count || 1) - amount;

  // Spawn on ground in front of player
  if (fpsController) {
    const pos = fpsController.getPosition();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const dropX = pos.x + forward.x * 2;
    const dropZ = pos.z + forward.z * 2;
    const dropY = getTerrainHeightAt(dropX, dropZ) + 0.5;
    spawnGroundItem(item.type, item.name, amount, dropX, dropY, dropZ);
  }

  if (item.count <= 0) {
    setSlotItem(invSelectedIndex, null);
    hideItemDetail();
    invSelectedIndex = -1;
  } else {
    showItemDetail(invSelectedIndex, item);
  }
  buildHotbar();
  buildInventoryGrid();
}

// \u2500\u2500 H key hover loot (instant transfer while held) \u2500\u2500
let hoverLootActive = false;

document.addEventListener('keydown', function(e) {
  if (e.key.toLowerCase() === 'h' && inventoryOpen && !hoverLootActive) {
    hoverLootActive = true;
  }
});
document.addEventListener('keyup', function(e) {
  if (e.key.toLowerCase() === 'h') hoverLootActive = false;
});

// When hovering while H is held, instant-transfer
document.addEventListener('mouseover', function(e) {
  if (!hoverLootActive || !inventoryOpen) return;
  const slotEl = e.target.closest('.inv-slot');
  if (!slotEl || !slotEl.dataset.idx) return;
  const idx = parseInt(slotEl.dataset.idx);
  const item = getSlotItem(idx);
  if (item) instantTransferSlot(idx);
});

// ── Detail split-drag into a slot ──
function handleDetailSplitDrop(toIdx) {
  if (invSelectedIndex < 0) return;
  const srcItem = getSlotItem(invSelectedIndex);
  if (!srcItem) return;
  const dropInput = document.getElementById('itemDropCount');
  let amount = parseInt(dropInput.value) || 0;
  if (amount < 1) amount = 1;
  if (amount > (srcItem.count || 1)) amount = srcItem.count || 1;
  if (toIdx === invSelectedIndex) return;

  const destItem = getSlotItem(toIdx);
  if (destItem && destItem.type === srcItem.type) {
    // Stack into existing
    const canAdd = MAX_STACK_SIZE - (destItem.count || 0);
    const toMove = Math.min(amount, canAdd);
    if (toMove <= 0) return;
    destItem.count = (destItem.count || 0) + toMove;
    srcItem.count = (srcItem.count || 0) - toMove;
  } else if (!destItem) {
    // Place into empty slot
    setSlotItem(toIdx, { type: srcItem.type, name: srcItem.name, count: amount });
    srcItem.count = (srcItem.count || 0) - amount;
  } else {
    return; // different item type in slot, can't split there
  }

  if (srcItem.count <= 0) {
    setSlotItem(invSelectedIndex, null);
    hideItemDetail();
    invSelectedIndex = -1;
  } else {
    showItemDetail(invSelectedIndex, srcItem);
  }
  buildHotbar();
  buildInventoryGrid();
}

// ── Drag off inventory to drop on ground ──
(function() {
  const overlay = document.getElementById('inventoryOverlay');
  overlay.addEventListener('dragover', function(e) {
    e.preventDefault();
  });
  overlay.addEventListener('drop', function(e) {
    // Only handle if dropped on the overlay background (not on a slot)
    if (e.target.closest('.inv-slot') || e.target.closest('.item-detail-preview')) return;
    e.preventDefault();
    if (invDragFrom === -2) {
      // Detail-split dragged off inventory → drop on ground
      dropSelectedItem();
      invDragFrom = -1;
    } else if (invDragFrom >= 0) {
      // Dragged a slot off inventory → drop entire stack on ground
      const item = getSlotItem(invDragFrom);
      if (item && fpsController) {
        const pos = fpsController.getPosition();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const dropX = pos.x + forward.x * 2;
        const dropZ = pos.z + forward.z * 2;
        const dropY = getTerrainHeightAt(dropX, dropZ) + 0.5;
        spawnGroundItem(item.type, item.name, item.count || 1, dropX, dropY, dropZ);
        setSlotItem(invDragFrom, null);
        if (invDragFrom === invSelectedIndex) {
          hideItemDetail();
          invSelectedIndex = -1;
        }
        buildHotbar();
        buildInventoryGrid();
      }
      invDragFrom = -1;
    }
  });
})();

// ── Build mesh from model JSON data (generic) ──
function buildModelMesh(modelData) {
  const group = new THREE.Group();
  if (!modelData || !modelData.objects) return group;
  for (const obj of modelData.objects) {
    let geo;
    if (obj.type === 'cube') {
      geo = new THREE.BoxGeometry(1, 1, 1);
    } else if (obj.type === 'sphere') {
      geo = new THREE.SphereGeometry(0.5, 8, 6);
    } else if (obj.type === 'cylinder') {
      geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    } else if (obj.type === 'capsule') {
      geo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
    } else {
      geo = new THREE.BoxGeometry(1, 1, 1);
    }
    const mat = new THREE.MeshPhongMaterial({ color: obj.color || '#888' });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(obj.x || 0, obj.height || 0, obj.y || 0);
    const s = obj.scale || { x: 1, y: 1, z: 1 };
    mesh.scale.set(s.x, s.y, s.z);
    if (obj.rotation) {
      mesh.rotation.set(
        (obj.rotation.x || 0) * Math.PI / 180,
        (obj.rotation.y || 0) * Math.PI / 180,
        (obj.rotation.z || 0) * Math.PI / 180
      );
    }
    group.add(mesh);
  }
  return group;
}

function createWoodMesh() {
  if (woodModelData) return buildModelMesh(woodModelData);
  // Fallback if model not loaded yet
  const group = new THREE.Group();
  const logGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.2, 8);
  const logMat = new THREE.MeshPhongMaterial({ color: 0x8B6914 });
  const log = new THREE.Mesh(logGeo, logMat);
  log.rotation.z = Math.PI / 2;
  group.add(log);
  return group;
}

function hideWoodPreview() {} // no-op, previews now in detail panel

function createStoneMesh() {
  if (stoneModelData && stoneModelData.geometry) {
    // Build mesh from geometry format (stone_node.json)
    const geo = new THREE.BufferGeometry();
    for (const name of Object.keys(stoneModelData.geometry.attributes)) {
      const a = stoneModelData.geometry.attributes[name];
      geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(a.array), a.itemSize));
    }
    if (stoneModelData.geometry.index) {
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(stoneModelData.geometry.index), 1));
    }
    geo.computeVertexNormals();
    const hasColor = geo.getAttribute('color') != null;
    const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: hasColor });
    return new THREE.Mesh(geo, mat);
  }
  if (stoneModelData && stoneModelData.objects) return buildModelMesh(stoneModelData);
  // Fallback
  const geo = new THREE.IcosahedronGeometry(0.5, 1);
  const mat = new THREE.MeshPhongMaterial({ color: 0x888888 });
  return new THREE.Mesh(geo, mat);
}

// ═══════════════════════════════════════════════════════════════
//  GROUND ITEMS — dropped items in the world
// ═══════════════════════════════════════════════════════════════

function createGroundItemMesh(type) {
  let mesh;
  if (type === 'wood') {
    mesh = createWoodMesh();
    mesh.scale.set(0.15, 0.15, 0.15);
  } else if (type === 'bat') {
    mesh = buildBatMesh();
    mesh.scale.set(0.03, 0.03, 0.03);
  } else if (type === 'stone') {
    mesh = createStoneMesh();
    mesh.scale.set(0.12, 0.12, 0.12);
  } else {
    const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const mat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
    mesh = new THREE.Mesh(geo, mat);
  }
  return mesh;
}

function spawnGroundItem(type, name, count, wx, wy, wz) {
  const mesh = createGroundItemMesh(type);
  mesh.position.set(wx, wy, wz);
  scene.add(mesh);
  groundItems.push({
    type, name, count, x: wx, y: wy, z: wz,
    mesh, spawnTime: Date.now()
  });
}

function updateGroundItems(dt) {
  const now = Date.now();
  const playerPos = fpsController ? fpsController.getPosition() : null;

  for (let i = groundItems.length - 1; i >= 0; i--) {
    const gi = groundItems[i];
    // Spin
    if (gi.mesh) gi.mesh.rotation.y += 1.5 * dt;
    // Bob up and down
    if (gi.mesh) gi.mesh.position.y = gi.y + Math.sin(now * 0.003 + i) * 0.15;

    // Despawn after 20 minutes
    if (now - gi.spawnTime >= GROUND_ITEM_DESPAWN) {
      if (gi.mesh) scene.remove(gi.mesh);
      groundItems.splice(i, 1);
      continue;
    }


  }
}

function getNearestGroundItem() {
  if (!fpsController) return null;
  const pos = fpsController.getPosition();
  let best = null, bestDist = Infinity;
  for (const gi of groundItems) {
    const dx = gi.x - pos.x;
    const dz = gi.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= GROUND_PICKUP_RANGE && dist < bestDist) {
      bestDist = dist;
      best = gi;
    }
  }
  return best;
}

function pickupNearestGroundItem() {
  const gi = getNearestGroundItem();
  if (!gi) return false;
  const added = addItemToInventory({ type: gi.type, name: gi.name, count: gi.count });
  if (added) {
    showPickupNotification(gi.name, gi.count);
    if (gi.mesh) scene.remove(gi.mesh);
    groundItems.splice(groundItems.indexOf(gi), 1);
    return true;
  }
  return false;
}

function restoreGroundItems() {
  // Clear any existing
  groundItems.forEach(gi => { if (gi.mesh) scene.remove(gi.mesh); });
  groundItems = [];
  // Load from current world save
  const worlds = getSavedWorlds();
  const world = worlds.find(w => w.id === currentWorldId);
  if (!world || !world.groundItems) return;
  const now = Date.now();
  for (const gi of world.groundItems) {
    // Skip if already despawned
    if (now - gi.spawnTime >= GROUND_ITEM_DESPAWN) continue;
    spawnGroundItem(gi.type, gi.name, gi.count, gi.x, gi.y, gi.z);
    // Restore original spawnTime
    groundItems[groundItems.length - 1].spawnTime = gi.spawnTime;
  }
}

function getTerrainHeightAt(wx, wz) {
  if (!currentMapData) return 0;
  const size = currentMapData.metadata.mapSize;
  const tx = Math.floor(wx);
  const tz = Math.floor(wz);
  if (tx >= 0 && tx < size && tz >= 0 && tz < size) {
    const tile = currentMapData.terrain[tz]?.[tx];
    return tile ? tile.height * 10 : 0;
  }
  return 0;
}

// ── Init ──
buildHotbar();
buildInventoryGrid();
initThree();

// Auto-save when leaving/closing the page
window.addEventListener('beforeunload', function(e) {
  if (gameRunning && currentWorldId && fpsController) {
    saveGame();
    e.preventDefault();
    e.returnValue = '';
  }
});

// ═══════════════════════════════════════════════════════════════
//  HELD ITEM & BAT SYSTEM
// ═══════════════════════════════════════════════════════════════

function buildBatMesh() {
  return buildModelMesh(batModelData);
}

function buildHeldItem() {
  // Remove old
  if (heldItemGroup) { camera.remove(heldItemGroup); heldItemGroup = null; }
  const item = hotbarSlots[selectedSlot];
  if (!item || item.type !== 'bat') return;
  heldItemGroup = buildBatMesh();
  // Position bottom-right of camera view
  heldItemGroup.scale.set(0.04, 0.04, 0.04);
  heldItemGroup.position.set(0.35, -0.35, -0.5);
  heldItemGroup.rotation.set(0, 0, -0.4);
  camera.add(heldItemGroup);
  // Make sure camera is in scene
  if (!camera.parent) scene.add(camera);
}

function updateHeldItem(dt) {
  // Rebuild if slot changed
  const item = hotbarSlots[selectedSlot];
  const shouldShow = item && item.type === 'bat';
  if (shouldShow && !heldItemGroup) buildHeldItem();
  if (!shouldShow && heldItemGroup) { camera.remove(heldItemGroup); heldItemGroup = null; }

  // Swing animation — multi-phase: wind-up → strike → follow-through → return
  if (heldItemGroup && swingAnim > 0) {
    swingAnim -= dt;
    const progress = 1 - Math.max(0, swingAnim) / SWING_DURATION;
    let rx = 0, rz = -0.4, px = 0.35, py = -0.35;
    if (progress < 0.2) {
      // Wind-up: pull back
      const t = progress / 0.2;
      rx = t * 0.5;
      py = -0.35 + t * 0.05;
    } else if (progress < 0.5) {
      // Strike: swing forward hard
      const t = (progress - 0.2) / 0.3;
      rx = 0.5 - t * 1.6;
      rz = -0.4 + t * 0.3;
      px = 0.35 - t * 0.05;
    } else if (progress < 0.75) {
      // Follow-through
      const t = (progress - 0.5) / 0.25;
      rx = -1.1 + t * 0.6;
      rz = -0.1 - t * 0.15;
    } else {
      // Return to idle
      const t = (progress - 0.75) / 0.25;
      rx = -0.5 * (1 - t);
      rz = -0.25 + t * (-0.15);
    }
    heldItemGroup.position.set(px, py, -0.5);
    heldItemGroup.rotation.set(rx, 0, rz);
    if (swingAnim <= 0) {
      heldItemGroup.position.set(0.35, -0.35, -0.5);
      heldItemGroup.rotation.set(0, 0, -0.4);
    }
  }
}

function selectHotbarSlot(index) {
  selectedSlot = index;
  const slots = document.querySelectorAll('.hotbar-slot');
  slots.forEach((s, i) => s.classList.toggle('selected', i === index));
  buildHeldItem();
}

// ── Add item to inventory (stacks by type, max 1000) ──
function addItemToInventory(item) {
  let remaining = item.count || 1;
  // First try to stack in hotbar
  for (let i = 0; i < HOTBAR_SIZE && remaining > 0; i++) {
    if (hotbarSlots[i] && hotbarSlots[i].type === item.type) {
      const canAdd = MAX_STACK_SIZE - (hotbarSlots[i].count || 0);
      const toAdd = Math.min(remaining, canAdd);
      if (toAdd > 0) {
        hotbarSlots[i].count = (hotbarSlots[i].count || 0) + toAdd;
        remaining -= toAdd;
      }
    }
  }
  // Then try to stack in inventory
  for (let i = 0; i < inventorySlots.length && remaining > 0; i++) {
    if (inventorySlots[i] && inventorySlots[i].type === item.type) {
      const canAdd = MAX_STACK_SIZE - (inventorySlots[i].count || 0);
      const toAdd = Math.min(remaining, canAdd);
      if (toAdd > 0) {
        inventorySlots[i].count = (inventorySlots[i].count || 0) + toAdd;
        remaining -= toAdd;
      }
    }
  }
  // No existing stack or stacks full — find empty hotbar slot
  while (remaining > 0) {
    let placed = false;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (!hotbarSlots[i]) {
        const toAdd = Math.min(remaining, MAX_STACK_SIZE);
        hotbarSlots[i] = { type: item.type, name: item.name, count: toAdd };
        remaining -= toAdd;
        placed = true;
        break;
      }
    }
    if (!placed) {
      for (let i = 0; i < inventorySlots.length; i++) {
        if (!inventorySlots[i]) {
          const toAdd = Math.min(remaining, MAX_STACK_SIZE);
          inventorySlots[i] = { type: item.type, name: item.name, count: toAdd };
          remaining -= toAdd;
          placed = true;
          break;
        }
      }
    }
    if (!placed) break; // inventory full
  }
  buildHotbar();
  if (inventoryOpen) buildInventoryGrid();
  return remaining === 0;
}

// ── Pickup Notification System ──
let pickupNotifs = {}; // key: itemType → {el, count, timer}

function showPickupNotification(itemName, amount) {
  const key = itemName;
  const container = document.getElementById('pickup-notifications');
  if (pickupNotifs[key]) {
    // Stack onto existing notification
    clearTimeout(pickupNotifs[key].timer);
    pickupNotifs[key].count += amount;
    pickupNotifs[key].el.textContent = itemName + ' +' + pickupNotifs[key].count;
    pickupNotifs[key].el.classList.remove('fade');
    pickupNotifs[key].timer = setTimeout(() => fadePickupNotif(key), 5000);
  } else {
    const el = document.createElement('div');
    el.className = 'pickup-notif';
    el.textContent = itemName + ' +' + amount;
    container.appendChild(el);
    const timer = setTimeout(() => fadePickupNotif(key), 5000);
    pickupNotifs[key] = { el, count: amount, timer };
  }
}

function fadePickupNotif(key) {
  const n = pickupNotifs[key];
  if (!n) return;
  n.el.classList.add('fade');
  setTimeout(() => {
    n.el.remove();
    delete pickupNotifs[key];
  }, 400);
}

// ═══════════════════════════════════════════════════════════════
//  TREE HITTING & BREAKING
// ═══════════════════════════════════════════════════════════════

function findNearestTree() {
  if (!fpsController || !currentMapData) return null;
  const pos = fpsController.getPosition();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  // Normalize horizontal forward so looking up/down doesn't break aiming
  const hLen = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
  const hFwdX = hLen > 0.001 ? forward.x / hLen : 0;
  const hFwdZ = hLen > 0.001 ? forward.z / hLen : 0;
  let bestTree = null, bestDist = HIT_RANGE + 1;
  for (const obj of currentMapData.objects) {
    if (obj.type !== 'tree') continue;
    const dx = obj.x - pos.x;
    const dz = obj.y - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > HIT_RANGE) continue;
    // Must be aiming at the tree — use angular check from crosshair direction
    const dirLen = Math.sqrt(dx * dx + dz * dz);
    if (dirLen < 0.01) { bestTree = obj; bestDist = dist; continue; }
    const dot = (dx * hFwdX + dz * hFwdZ) / dirLen;
    if (dot < 0.85) continue; // tight cone — must aim at tree
    if (dist < bestDist) {
      bestDist = dist;
      bestTree = obj;
    }
  }
  return bestTree;
}

function hitTree() {
  if (swingCooldown > 0) return; // cooldown active

  // Must have a tool equipped to swing
  const held = hotbarSlots[selectedSlot];
  if (!held || held.type !== 'bat') return;

  swingAnim = SWING_DURATION;
  swingCooldown = SWING_COOLDOWN;

  // Check node first (higher priority), then tree
  const node = findNearestNode();
  if (node) {
    hitNode(node);
    return;
  }

  const tree = findNearestTree();
  if (!tree) return;

  // Play hit sound
  if (sndHit) {
    const s = sndHit.cloneNode();
    s.volume = 0.6;
    s.play().catch(() => {});
  }

  // Spawn particles at tree position
  spawnHitParticles(tree.x, tree.height * 10 + 1.5, tree.y);

  // Apply damage
  const key = tree.x + ',' + tree.y;
  if (treeHealthMap[key] === undefined) treeHealthMap[key] = TREE_MAX_HP;
  treeHealthMap[key] -= BAT_DAMAGE;

  // Give 10 wood per hit
  addItemToInventory({ type: 'wood', name: 'Wood', count: 10 });
  showPickupNotification('Wood', 10);

  if (treeHealthMap[key] <= 0) {
    breakTree(tree, key);
  }
}

function breakTree(tree, key) {
  // Record broken tree with timestamp
  brokenTrees.push({
    x: tree.x, y: tree.y,
    subType: tree.subType, treeScale: tree.treeScale, height: tree.height,
    brokenAtDay: dayCount, brokenAtTime: dayTime
  });

  delete treeHealthMap[key];

  // Drop wood: base 1000, bat gives 20% harvest rate = 200
  const item = hotbarSlots[selectedSlot];
  const baseWood = 1000;
  const harvestRate = (item && item.type === 'bat') ? 0.2 : 1.0;
  const woodAmount = Math.floor(baseWood * harvestRate);
  addItemToInventory({ type: 'wood', name: 'Wood', count: woodAmount });
  showPickupNotification('Wood', woodAmount);

  // Spawn a falling tree mesh, then remove after it lands
  spawnFallingTree(tree);
  removeTreeFromWorld(tree);
}

function removeTreeFromWorld(tree) {
  // Remove from objects array
  const idx = currentMapData.objects.indexOf(tree);
  if (idx !== -1) currentMapData.objects.splice(idx, 1);

  // Remove from collision
  if (fpsController && fpsController.collisionData?.objectCollisions) {
    const ci = fpsController.collisionData.objectCollisions.findIndex(
      o => o.x === tree.x && o.y === tree.y && o.type === 'tree'
    );
    if (ci !== -1) fpsController.collisionData.objectCollisions.splice(ci, 1);
  }

  // Hide in instanced mesh
  for (const m of sceneMeshes) {
    if (!m.isGroup) continue;
    m.traverse(child => {
      if (child.isInstancedMesh) {
        const mat4 = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        for (let i = 0; i < child.count; i++) {
          child.getMatrixAt(i, mat4);
          pos.setFromMatrixPosition(mat4);
          if (Math.abs(pos.x - tree.x) < 0.5 && Math.abs(pos.z - tree.y) < 0.5) {
            mat4.makeScale(0, 0, 0);
            child.setMatrixAt(i, mat4);
            child.instanceMatrix.needsUpdate = true;
          }
        }
      }
    });
  }
}

function applyBrokenTrees() {
  // Check for respawns and remove trees that are still broken
  const toKeep = [];
  for (const bt of brokenTrees) {
    const daysSinceBroken = (dayCount - bt.brokenAtDay) + (dayTime - (bt.brokenAtTime || 0)) / DAY_CYCLE_LENGTH;
    if (daysSinceBroken >= TREE_RESPAWN_DAYS) {
      // Tree has respawned — leave it in the world
      continue;
    }
    // Still broken — find and remove from world
    const tree = currentMapData.objects.find(o => o.type === 'tree' && o.x === bt.x && o.y === bt.y);
    if (tree) removeTreeFromWorld(tree);
    toKeep.push(bt);
  }
  brokenTrees = toKeep;
}

// ═══════════════════════════════════════════════════════════════
//  NODE HITTING & BREAKING (Stone / Metal nodes)
// ═══════════════════════════════════════════════════════════════

function findNearestNode() {
  if (!fpsController || !currentMapData) return null;
  const pos = fpsController.getPosition();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  // Normalize horizontal forward so looking down at nodes doesn't break aiming
  const hLen = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
  const hFwdX = hLen > 0.001 ? forward.x / hLen : 0;
  const hFwdZ = hLen > 0.001 ? forward.z / hLen : 0;
  let bestNode = null, bestDist = HIT_RANGE + 1;
  for (const obj of currentMapData.objects) {
    if (obj.type !== 'node') continue;
    const dx = obj.x - pos.x;
    const dz = obj.y - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > HIT_RANGE) continue;
    const dirLen = Math.sqrt(dx * dx + dz * dz);
    if (dirLen < 0.01) { bestNode = obj; bestDist = dist; continue; }
    const dot = (dx * hFwdX + dz * hFwdZ) / dirLen;
    if (dot < 0.7) continue; // wider cone for ground-level nodes
    if (dist < bestDist) {
      bestDist = dist;
      bestNode = obj;
    }
  }
  return bestNode;
}

function hitNode(node) {
  // Play hit sound
  if (sndHit) {
    const s = sndHit.cloneNode();
    s.volume = 0.6;
    s.play().catch(() => {});
  }

  // Spawn particles at node position (grey for stone)
  spawnHitParticles(node.x, node.height * 10 + 0.8, node.y, 4, 0x888888);

  const key = node.x + ',' + node.y;
  if (nodeHealthMap[key] === undefined) {
    // Random HP between 15 and 20
    nodeHealthMap[key] = NODE_MIN_HP + Math.floor(Math.random() * (NODE_MAX_HP - NODE_MIN_HP + 1));
  }

  nodeHealthMap[key] -= 1;

  // Give stone per hit
  addItemToInventory({ type: 'stone', name: 'Stone', count: NODE_STONE_PER_HIT });
  showPickupNotification('Stone', NODE_STONE_PER_HIT);

  if (nodeHealthMap[key] <= 0) {
    breakNode(node, key);
  }
}

function breakNode(node, key) {
  brokenNodes.push({
    x: node.x, y: node.y,
    subType: node.subType, scale: node.scale, height: node.height,
    brokenAtDay: dayCount, brokenAtTime: dayTime
  });

  // Bonus stone on break
  addItemToInventory({ type: 'stone', name: 'Stone', count: NODE_STONE_ON_BREAK });
  showPickupNotification('Stone', NODE_STONE_ON_BREAK);

  // Start breaking animation (shrink + shake), then remove
  removeNodeFromWorld(node);
  startNodeBreakAnim(node);
  delete nodeHealthMap[key];
}

function removeNodeFromWorld(node) {
  const idx = currentMapData.objects.indexOf(node);
  if (idx !== -1) currentMapData.objects.splice(idx, 1);

  if (fpsController && fpsController.collisionData?.objectCollisions) {
    const ci = fpsController.collisionData.objectCollisions.findIndex(
      o => o.x === node.x && o.y === node.y && o.type === 'node'
    );
    if (ci !== -1) fpsController.collisionData.objectCollisions.splice(ci, 1);
  }
  // Note: instanced mesh hiding handled by breaking animation or removeNodeFromWorldByPos
}

function applyBrokenNodes() {
  const toKeep = [];
  for (const bn of brokenNodes) {
    const daysSinceBroken = (dayCount - bn.brokenAtDay) + (dayTime - (bn.brokenAtTime || 0)) / DAY_CYCLE_LENGTH;
    if (daysSinceBroken >= NODE_RESPAWN_DAYS) continue;
    const node = currentMapData.objects.find(o => o.type === 'node' && o.x === bn.x && o.y === bn.y);
    if (node) removeNodeFromWorld(node);
    removeNodeFromWorldByPos(bn.x, bn.y);
    toKeep.push(bn);
  }
  brokenNodes = toKeep;
}

// Left click to swing bat
document.addEventListener('mousedown', function(e) {
  if (e.button !== 0) return;
  if (!gameRunning || !fpsController || !fpsController.pointerLocked) return;
  if (inventoryOpen) return;
  if (typeof mapOverlayVisible !== 'undefined' && mapOverlayVisible) return;
  hitTree();
});

// ═══════════════════════════════════════════════════════════════
//  HIT PARTICLES
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  FALLING TREE ANIMATION
// ═══════════════════════════════════════════════════════════════
function spawnFallingTree(tree) {
  const T = THREE;
  const template = mapLoader.getTreeTemplate(tree.subType || 'oak');
  const s = tree.treeScale || 1;

  // Build a simple combined mesh for the tree
  const group = new T.Group();

  // Trunk
  const trunkColor = mapLoader.getTrunkColor(tree.subType || 'oak');
  for (const part of template.trunk) {
    const mat = new T.MeshPhongMaterial({ color: trunkColor, shininess: 2 });
    const mesh = new T.Mesh(part.geo, mat);
    mesh.position.y = part.y;
    group.add(mesh);
  }
  // Canopy
  const canopyColor = mapLoader.getTreeColor(tree.subType || 'oak');
  for (const part of template.canopy) {
    const mat = new T.MeshPhongMaterial({ color: canopyColor, shininess: 5 });
    const mesh = new T.Mesh(part.geo, mat);
    mesh.position.y = part.y;
    group.add(mesh);
  }

  const tt = currentMapData.terrain[Math.floor(tree.y)]?.[Math.floor(tree.x)];
  const bh = tt ? tt.height * 10 : tree.height * 10;
  group.position.set(tree.x, bh, tree.y);
  group.scale.set(s, s, s);

  // Pick a random fall direction
  const fallAngle = Math.random() * Math.PI * 2;
  scene.add(group);

  fallingTrees.push({
    mesh: group,
    x: tree.x, z: tree.y,
    fallAngle,
    timer: 0,
    fallDuration: 1.0,   // 1s to fall
    waitDuration: 2.0,   // 2s on ground
    fadeDuration: 0.3,   // 0.3s fade
    phase: 'falling',    // 'falling' | 'waiting' | 'fading'
    height: bh,
    subType: tree.subType,
  });
}

function updateFallingTrees(dt) {
  for (let i = fallingTrees.length - 1; i >= 0; i--) {
    const ft = fallingTrees[i];
    ft.timer += dt;

    if (ft.phase === 'falling') {
      const progress = Math.min(1, ft.timer / ft.fallDuration);
      // Ease-in rotation (accelerating fall)
      const angle = (progress * progress) * (Math.PI / 2);
      ft.mesh.rotation.set(0, 0, 0);
      // Rotate around the base using a pivot axis perpendicular to fall direction
      const axis = new THREE.Vector3(Math.cos(ft.fallAngle), 0, Math.sin(ft.fallAngle));
      ft.mesh.rotateOnAxis(axis, angle);
      if (progress >= 1) {
        ft.phase = 'waiting';
        ft.timer = 0;
      }
    } else if (ft.phase === 'waiting') {
      if (ft.timer >= ft.waitDuration) {
        ft.phase = 'fading';
        ft.timer = 0;
      }
    } else if (ft.phase === 'fading') {
      const progress = Math.min(1, ft.timer / ft.fadeDuration);
      // Shrink and fade
      const s = 1 - progress;
      ft.mesh.scale.multiplyScalar(0); // reset
      ft.mesh.scale.set(s, s, s);
      ft.mesh.traverse(child => {
        if (child.isMesh) {
          child.material.transparent = true;
          child.material.opacity = 1 - progress;
        }
      });
      if (progress >= 1) {
        // Big particle burst
        spawnHitParticles(ft.x, ft.height + 1, ft.z, 20);
        // Clean up
        scene.remove(ft.mesh);
        ft.mesh.traverse(child => {
          if (child.isMesh) {
            child.geometry.dispose();
            child.material.dispose();
          }
        });
        fallingTrees.splice(i, 1);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  NODE BREAKING ANIMATION
// ═══════════════════════════════════════════════════════════════
function startNodeBreakAnim(node) {
  breakingNodes.push({
    x: node.x, y: node.y,
    height: node.height,
    timer: 0,
    totalTime: 0.6,  // 0.6s break animation
    scale: node.scale || 0.6,
  });
}

function updateBreakingNodes(dt) {
  for (let i = breakingNodes.length - 1; i >= 0; i--) {
    const bn = breakingNodes[i];
    bn.timer += dt;
    const progress = Math.min(1, bn.timer / bn.totalTime);

    // Shake and shrink the instanced mesh
    const shrink = 1 - progress;
    const shake = Math.sin(progress * Math.PI * 8) * 0.15 * (1 - progress);

    for (const m of sceneMeshes) {
      const updateInst = (inst) => {
        if (!inst.isInstancedMesh) return;
        const mat4 = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        for (let j = 0; j < inst.count; j++) {
          inst.getMatrixAt(j, mat4);
          pos.setFromMatrixPosition(mat4);
          if (Math.abs(pos.x - bn.x) < 0.5 && Math.abs(pos.z - bn.y) < 0.5) {
            const s = (bn.scale * 0.5) * shrink;
            mat4.compose(
              new THREE.Vector3(bn.x + shake, pos.y, bn.y + shake),
              new THREE.Quaternion(),
              new THREE.Vector3(s, s, s)
            );
            inst.setMatrixAt(j, mat4);
            inst.instanceMatrix.needsUpdate = true;
          }
        }
      };
      if (m.isInstancedMesh) updateInst(m);
      if (m.isGroup) m.traverse(child => updateInst(child));
    }

    if (progress >= 1) {
      // Final particle burst
      spawnHitParticles(bn.x, bn.height * 10 + 1, bn.y, 12, 0x888888);
      // Ensure instance is zeroed out
      removeNodeFromWorldByPos(bn.x, bn.y);
      breakingNodes.splice(i, 1);
    }
  }
}

function removeNodeFromWorldByPos(nx, ny) {
  for (const m of sceneMeshes) {
    const zeroInst = (inst) => {
      if (!inst.isInstancedMesh) return;
      const mat4 = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      for (let j = 0; j < inst.count; j++) {
        inst.getMatrixAt(j, mat4);
        pos.setFromMatrixPosition(mat4);
        if (Math.abs(pos.x - nx) < 0.5 && Math.abs(pos.z - ny) < 0.5) {
          mat4.makeScale(0, 0, 0);
          inst.setMatrixAt(j, mat4);
          inst.instanceMatrix.needsUpdate = true;
        }
      }
    };
    if (m.isInstancedMesh) zeroInst(m);
    if (m.isGroup) m.traverse(child => zeroInst(child));
  }
}

function spawnHitParticles(wx, wy, wz, count, color) {
  const n = count || 6;
  const c = color || 0x8B6914;
  for (let i = 0; i < n; i++) {
    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const mat = new THREE.MeshBasicMaterial({ color: c });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      wx + (Math.random() - 0.5) * 0.5,
      wy + (Math.random() - 0.5) * 0.5,
      wz + (Math.random() - 0.5) * 0.5
    );
    scene.add(mesh);
    hitParticles.push({
      mesh,
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 3 + 1,
      vz: (Math.random() - 0.5) * 3,
      life: 0.6 + Math.random() * 0.3,
    });
  }
}

function updateHitParticles(dt) {
  for (let i = hitParticles.length - 1; i >= 0; i--) {
    const p = hitParticles[i];
    p.life -= dt;
    p.vy -= 9.8 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.material.opacity = Math.max(0, p.life / 0.6);
    p.mesh.material.transparent = true;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      hitParticles.splice(i, 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  PLAYER SOUNDS (walking, running, ambience)
// ═══════════════════════════════════════════════════════════════

function updatePlayerSounds() {
  if (!fpsController || !fpsController.pointerLocked) {
    stopMoveSounds();
    return;
  }
  const keys = fpsController.keys;
  const moving = keys['w'] || keys['s'] || keys['a'] || keys['d'];
  const sprinting = keys['shift'] && !fpsController.isCrouching;
  const grounded = fpsController.isGrounded;

  if (moving && grounded) {
    const want = sprinting ? 'run' : 'walk';
    if (currentMoveSound !== want) {
      // Switch sounds without resetting if same audio
      if (currentMoveSound === 'walk') sndWalk.pause();
      if (currentMoveSound === 'run') sndRun.pause();
      const snd = want === 'run' ? sndRun : sndWalk;
      snd.play().catch(() => {});
      currentMoveSound = want;
    }
  } else {
    stopMoveSounds();
  }
}

function stopMoveSounds() {
  if (currentMoveSound === 'walk') sndWalk.pause();
  if (currentMoveSound === 'run') sndRun.pause();
  currentMoveSound = null;
}

// ═══════════════════════════════════════════════════════════════
//  DAY/NIGHT CYCLE
// ═══════════════════════════════════════════════════════════════

function updateDayNightCycle(dt) {
  dayTime += dt;
  if (dayTime >= DAY_CYCLE_LENGTH) {
    dayTime -= DAY_CYCLE_LENGTH;
    dayCount++;
    // Check tree & node respawns on new day
    applyBrokenTrees();
    applyBrokenNodes();
  }

  // Sun angle: 0 = sunrise, PI = sunset, 2PI = next sunrise
  const sunAngle = (dayTime / DAY_CYCLE_LENGTH) * Math.PI * 2;

  // Sun position — orbits in the sky, always far from camera
  const sunDist = 900;
  const sunDirX = Math.sin(sunAngle);
  const sunDirY = Math.cos(sunAngle);
  // Anchor sun relative to camera so it stays at skybox distance
  const camPos = camera.position;
  const sunX = camPos.x + sunDirX * sunDist;
  const sunY = camPos.y + sunDirY * sunDist;
  const sunZ = camPos.z;

  if (sunMesh) {
    sunMesh.position.set(sunX, sunY, sunZ);
    sunMesh.visible = sunY > -20;
  }
  if (sunLight) {
    // Directional light uses direction — keep it at a sensible distance
    sunLight.position.set(sunDirX * 200, sunDirY * 200, 0);
  }

  // Compute brightness based on sun height
  // sunDirY ranges from 1 (noon) to -1 (midnight)
  const normalizedHeight = sunDirY;

  // Day factor: 1 = full day, 0 = full night
  // Smooth transition around horizon
  let dayFactor;
  if (normalizedHeight > 0.1) {
    dayFactor = 1;
  } else if (normalizedHeight > -0.15) {
    dayFactor = (normalizedHeight + 0.15) / 0.25;
  } else {
    dayFactor = 0;
  }
  dayFactor = Math.max(0, Math.min(1, dayFactor));

  // Night: dark but visible
  const nightAmbient = 0.15;
  const dayAmbient = 0.7;
  const nightSunIntensity = 0;
  const daySunIntensity = 0.6;

  if (ambientLight) {
    ambientLight.intensity = nightAmbient + (dayAmbient - nightAmbient) * dayFactor;
    // Shift color from cool blue at night to warm white during day
    const r = 0.4 + 0.4 * dayFactor;
    const g = 0.45 + 0.37 * dayFactor;
    const b = 0.65 + 0.35 * dayFactor;
    ambientLight.color.setRGB(r, g, b);
  }
  if (sunLight) {
    sunLight.intensity = nightSunIntensity + (daySunIntensity - nightSunIntensity) * dayFactor;
  }
  if (backLight) {
    backLight.intensity = 0.05 + 0.25 * dayFactor;
  }

  // Sky color
  if (scene) {
    const skyR = 0.08 + 0.45 * dayFactor;
    const skyG = 0.08 + 0.73 * dayFactor;
    const skyB = 0.15 + 0.72 * dayFactor;
    scene.background.setRGB(skyR, skyG, skyB);
    if (scene.fog) {
      scene.fog.color.setRGB(skyR, skyG, skyB);
    }
  }

  // Sun color: warm at horizon, white at noon
  if (sunMesh && sunMesh.visible) {
    const horizonFactor = 1 - Math.min(1, Math.abs(normalizedHeight) * 2);
    const sr = 1;
    const sg = 0.93 - horizonFactor * 0.35;
    const sb = 0.53 - horizonFactor * 0.35;
    sunMesh.material.color.setRGB(sr, sg, sb);
  }
}

function updateDayTimeHUD() {
  // Convert dayTime to a 24h clock: day starts at 06:00, night at 18:00
  const fraction = dayTime / DAY_CYCLE_LENGTH; // 0..1
  // Map: 0 = 06:00 (sunrise), 0.5 = 18:00 (sunset), 1 = 06:00 next day
  const hours24 = (fraction * 24 + 6) % 24;
  const h = Math.floor(hours24);
  const m = Math.floor((hours24 - h) * 60);
  const timeStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  const el = document.getElementById('hud-daytime');
  if (el) el.textContent = 'Day ' + (dayCount + 1) + '  ' + timeStr;
}
