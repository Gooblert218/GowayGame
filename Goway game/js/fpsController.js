// ═══════════════════════════════════════════════════════════════
//  FPS CONTROLLER (adapted from map gen, half speed, no fly, + crouch)
// ═══════════════════════════════════════════════════════════════
class FPSController {
  constructor(camera, domElement, terrainHeightmap, collisionData) {
    this.camera = camera;
    this.domElement = domElement;
    this.terrainHeightmap = terrainHeightmap;
    this.collisionData = collisionData;

    this.keys = {};
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.PI_2 = Math.PI / 2;

    // Half the speed of map gen (map gen: 20 walk, 35 sprint)
    this.speed = 10;
    this.sprintSpeed = 17.5;
    this.jumpForce = 12;
    this.gravity = 25;
    this.friction = 0.9;
    this.playerHeight = 1.7;
    this.crouchHeight = 1.0;
    this.playerRadius = 0.3;

    this.isJumping = false;
    this.isGrounded = false;
    this.isCrouching = false;
    this.velocityY = 0;

    this.pitch = 0;
    this.yaw = 0;
    this.sensitivity = 0.002;
    this.pointerLocked = false;
    this.enabled = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onClick = this._onClick.bind(this);
  }

  enable() {
    this.enabled = true;
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.addEventListener('click', this._onClick);
    this.domElement.addEventListener('contextmenu', e => e.preventDefault());
  }

  disable() {
    this.enabled = false;
    this.keys = {};
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.removeEventListener('click', this._onClick);
    if (document.pointerLockElement) document.exitPointerLock();
    this.pointerLocked = false;
  }

  _onClick() {
    if (!this.enabled) return;
    // Don't re-lock pointer if map overlay is open
    if (typeof mapOverlayVisible !== 'undefined' && mapOverlayVisible) return;
    this.domElement.requestPointerLock();
  }

  _onPointerLockChange() {
    const wasLocked = this.pointerLocked;
    this.pointerLocked = document.pointerLockElement === this.domElement;
    // If we lost pointer lock while enabled and game is running, trigger pause
    if (wasLocked && !this.pointerLocked && this.enabled) {
      // Don't pause if map overlay is open (it intentionally unlocks pointer)
      if (typeof mapOverlayVisible !== 'undefined' && mapOverlayVisible) return;
      // Don't pause if inventory is open
      if (typeof inventoryOpen !== 'undefined' && inventoryOpen) return;
      if (typeof pauseGame === 'function') pauseGame();
    }
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    this.keys[e.key.toLowerCase()] = true;

    // Crouch toggle
    if (e.key.toLowerCase() === 'c') {
      this.isCrouching = !this.isCrouching;
    }

    // Escape → pause (only when pointer is locked, not when map is open)
    if (e.key === 'Escape') {
      // Escape will cause pointer lock to exit, which triggers pause via _onPointerLockChange
      // No need to call pauseGame() here directly — it would double-fire
      return;
    }
  }

  _onKeyUp(e) {
    this.keys[e.key.toLowerCase()] = false;
  }

  _onMouseMove(e) {
    if (!this.pointerLocked || !this.enabled) return;
    this.yaw -= e.movementX * this.sensitivity;
    this.pitch -= e.movementY * this.sensitivity;
    this.pitch = Math.max(-this.PI_2, Math.min(this.PI_2, this.pitch));
  }

  getTerrainHeight(x, z) {
    if (!this.terrainHeightmap) return 0;
    const mapSize = this.terrainHeightmap.length;
    const gx = Math.floor(x), gz = Math.floor(z);
    if (gx < 0 || gx >= mapSize || gz < 0 || gz >= mapSize) return 0;
    return this.terrainHeightmap[gz]?.[gx] || 0;
  }

  checkCollision(position) {
    if (!this.collisionData?.objectCollisions) return true;
    const px = position.x, py = position.y, pz = position.z;
    for (const obj of this.collisionData.objectCollisions) {
      const dx = px - obj.x, dz = pz - obj.y;
      if (dx*dx + dz*dz > 10000) continue;
      const distSq = dx*dx + dz*dz;
      const minDist = this.playerRadius + (obj.radius || 0.35);
      if (distSq < minDist * minDist) {
        const objectBase = obj.height || 0;
        let objectTop;
        if (obj.type === 'rock') objectTop = objectBase + 0.8;
        else if (obj.type === 'tree') objectTop = objectBase + 5.5;
        else objectTop = objectBase + 2;
        if (py >= objectBase && py <= objectTop) return false;
      }
    }
    return true;
  }

  update(dt) {
    if (!this.enabled || !this.pointerLocked) return;

    // Camera rotation
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);

    // Current height (crouching lowers the camera)
    const currentHeight = this.isCrouching ? this.crouchHeight : this.playerHeight;
    // Crouch slows you down
    const crouchFactor = this.isCrouching ? 0.5 : 1.0;

    const sprinting = this.keys['shift'] && !this.isCrouching;
    const moveSpeed = (sprinting ? this.sprintSpeed : this.speed) * crouchFactor;

    this.direction.set(0, 0, 0);
    if (this.keys['w']) this.direction.z += moveSpeed;
    if (this.keys['s']) this.direction.z -= moveSpeed;
    if (this.keys['a']) this.direction.x -= moveSpeed;
    if (this.keys['d']) this.direction.x += moveSpeed;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);

    this.velocity.x = forward.x * this.direction.z * dt + right.x * this.direction.x * dt;
    this.velocity.z = forward.z * this.direction.z * dt + right.z * this.direction.x * dt;

    let newPos = this.camera.position.clone();
    newPos.x += this.velocity.x;
    newPos.z += this.velocity.z;

    // World boundaries
    const mapSize = this.terrainHeightmap?.length || 128;
    const boundary = 0.5;
    newPos.x = Math.max(boundary, Math.min(mapSize - boundary, newPos.x));
    newPos.z = Math.max(boundary, Math.min(mapSize - boundary, newPos.z));

    // Jumping (can't jump while crouching)
    if (this.keys[' '] && this.isGrounded && !this.isCrouching) {
      this.velocityY = this.jumpForce;
      this.isGrounded = false;
    }

    // Gravity
    this.velocityY -= this.gravity * dt;
    newPos.y += this.velocityY * dt;

    // Ground collision
    const groundHeight = this.getTerrainHeight(newPos.x, newPos.z) + currentHeight;
    if (newPos.y <= groundHeight) {
      newPos.y = groundHeight;
      this.velocityY = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    // Object collision with sliding
    if (!this.checkCollision(newPos)) {
      const testX = new THREE.Vector3(newPos.x, newPos.y, this.camera.position.z);
      const testZ = new THREE.Vector3(this.camera.position.x, newPos.y, newPos.z);
      if (this.checkCollision(testX)) {
        this.camera.position.copy(testX);
        this.camera.position.y = newPos.y;
      } else if (this.checkCollision(testZ)) {
        this.camera.position.copy(testZ);
        this.camera.position.y = newPos.y;
      } else {
        this.camera.position.y = newPos.y;
      }
      return;
    }

    this.camera.position.copy(newPos);
    this.velocity.multiplyScalar(this.friction);
  }

  setPosition(x, y, z) {
    this.camera.position.set(x, y, z);
  }

  getPosition() {
    return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
  }
}
