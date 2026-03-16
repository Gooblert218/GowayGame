// ═══════════════════════════════════════════════════════════════
//  MAP LOADER (adapted from map gen)
// ═══════════════════════════════════════════════════════════════
class MapLoader {
  constructor() {
    this.mapData = null;
    this.biomeProperties = {
      water: { color: 0x4285F4 },
      plains: { color: 0x9BBF56 },
      grass: { color: 0x7CB342 },
      sand: { color: 0xFBC02D },
      forest: { color: 0x558B2F },
      dense_forest: { color: 0x3D6B24 },
      mountain: { color: 0x9E9E9E },
    };
  }

  createTerrainMesh(terrainGrid, offsetX, offsetY) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];
    const indices = [];
    const width = terrainGrid[0].length;
    const height = terrainGrid.length;
    const scale = 10;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = terrainGrid[y][x];
        vertices.push(offsetX + x, tile.height * scale, offsetY + y);

        let color = new THREE.Color((this.biomeProperties[tile.biome] || this.biomeProperties.grass).color);

        let grassTex = 1.0;
        if (['grass','plains','forest','dense_forest'].includes(tile.biome)) {
          grassTex = 1.0 + Math.sin(tile.x*1.7+tile.y*0.3)*0.02 + Math.cos(tile.x*0.5+tile.y*2.1)*0.015 + Math.sin((tile.x+tile.y)*3.7)*0.01;
        }

        let brightness;
        if (tile.biome === 'water') brightness = 0.85 + tile.height*0.15;
        else if (tile.biome === 'plains') { brightness = 0.92 + tile.height*0.08; brightness *= grassTex; }
        else if (tile.biome === 'grass') { brightness = 0.88 + tile.height*0.12; brightness *= grassTex; }
        else if (tile.biome === 'forest') { brightness = 0.8 + tile.height*0.15; brightness *= grassTex; }
        else if (tile.biome === 'dense_forest') { brightness = 0.72 + tile.height*0.15; brightness *= grassTex; }
        else if (tile.biome === 'sand') {
          brightness = 0.9 + tile.height*0.1;
          brightness *= 0.97 + Math.sin(tile.x*2.3+tile.y*1.1)*0.03;
        } else if (tile.biome === 'mountain') {
          const mountainBase = 0.7, snowLine = 1.1;
          if (tile.height > snowLine) {
            color = new THREE.Color(0xF0F0F5);
            brightness = 0.9 + Math.sin(tile.x*3.1+tile.y*2.7)*0.05;
          } else {
            const rockBlend = Math.min(1, (tile.height-mountainBase)/(snowLine-mountainBase));
            color = new THREE.Color(0x6B5B4F).lerp(new THREE.Color(0xA0A0A0), rockBlend);
            brightness = 0.85 + Math.sin(tile.x*4.7+tile.y*1.3)*0.06 + Math.cos(tile.x*2.1+tile.y*5.3)*0.04;
          }
        } else brightness = 0.85;

        color.multiplyScalar(brightness);
        colors.push(color.r, color.g, color.b);
      }
    }

    for (let y = 0; y < height-1; y++) {
      for (let x = 0; x < width-1; x++) {
        const a = y*width+x, b = a+1, c = (y+1)*width+x, d = c+1;
        indices.push(a,b,c, b,d,c);
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geometry.computeVertexNormals();

    return new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({
      vertexColors: true, side: THREE.DoubleSide, flatShading: false, shininess: 20,
    }));
  }

  createWaterMesh(terrainGrid) {
    const w = terrainGrid[0].length, h = terrainGrid.length;
    const waterHeight = 0.15 * 10;
    const geo = new THREE.PlaneGeometry(w, h, 1, 1);
    const mat = new THREE.MeshPhongMaterial({ color: 0x2E5F7F, side: THREE.DoubleSide, shininess: 60, emissive: 0x0a1f2e });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(w/2, waterHeight, h/2);
    return mesh;
  }

  buildTreeGeometry(parts) {
    const geo = new THREE.BufferGeometry();
    const positions = [], indices = [];
    const addGeo = (srcGeo, yOff, sx, sz) => {
      const srcPos = srcGeo.getAttribute('position').array;
      const start = positions.length / 3;
      const ssx = sx || 1, ssz = sz || 1;
      for (let i = 0; i < srcPos.length; i += 3)
        positions.push(srcPos[i]*ssx, srcPos[i+1]+yOff, srcPos[i+2]*ssz);
      if (srcGeo.getIndex()) {
        const srcIdx = srcGeo.getIndex().array;
        for (let i = 0; i < srcIdx.length; i++) indices.push(srcIdx[i]+start);
      }
    };
    parts.forEach(p => addGeo(p.geo, p.y, p.sx, p.sz));
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geo.computeVertexNormals();
    return geo;
  }

  getTreeTemplate(subType) {
    const T = THREE;
    switch (subType) {
      case 'pine': case 'spruce':
        return {
          trunk: [{geo:new T.CylinderGeometry(.15,.25,3.5,6),y:1.75}],
          canopy: [{geo:new T.ConeGeometry(1.8,3,7),y:4},{geo:new T.ConeGeometry(1.3,2.5,7),y:5.8},{geo:new T.ConeGeometry(.8,2,6),y:7.2},{geo:new T.ConeGeometry(.4,1.2,5),y:8.3}],
        };
      case 'redwood':
        return {
          trunk: [{geo:new T.CylinderGeometry(.35,.55,5,8),y:2.5}],
          canopy: [{geo:new T.ConeGeometry(2.2,3.5,8),y:5.5},{geo:new T.ConeGeometry(1.8,3,8),y:7.5},{geo:new T.ConeGeometry(1.2,2.5,7),y:9.2},{geo:new T.ConeGeometry(.6,1.5,6),y:10.5}],
        };
      case 'oak':
        return {
          trunk: [{geo:new T.CylinderGeometry(.25,.4,2.5,8),y:1.25}],
          canopy: [{geo:new T.SphereGeometry(2,8,6),y:4},{geo:new T.SphereGeometry(1.5,7,5),y:5.5}],
        };
      case 'birch':
        return {
          trunk: [{geo:new T.CylinderGeometry(.1,.15,3.5,6),y:1.75}],
          canopy: [{geo:new T.SphereGeometry(1.2,7,5),y:4.2},{geo:new T.SphereGeometry(.8,6,4),y:5.2}],
        };
      case 'maple':
        return {
          trunk: [{geo:new T.CylinderGeometry(.2,.3,2,7),y:1}],
          canopy: [{geo:new T.SphereGeometry(1.8,8,6),y:3.5},{geo:new T.SphereGeometry(1.3,7,5),y:4.8}],
        };
      default:
        return {
          trunk: [{geo:new T.CylinderGeometry(.2,.3,2.5,6),y:1.25}],
          canopy: [{geo:new T.ConeGeometry(1.4,2.5,7),y:3.2},{geo:new T.ConeGeometry(1,2,6),y:4.5}],
        };
    }
  }

  getTrunkColor(t) {
    return {oak:0x5C3A1E,pine:0x4A2E12,spruce:0x3D2510,redwood:0x6B3420,birch:0xD4C8B0,maple:0x5A3520,bush:0x4A3520}[t]||0x5C3A1E;
  }

  getTreeColor(t) {
    return {oak:0x2E8B2E,pine:0x1A5D1A,spruce:0x0D4D0D,redwood:0x1B5E20,birch:0x5DA85D,maple:0xCC6600,bush:0x6B8E23}[t]||0x228B22;
  }

  createTreeInstancedMesh(trees, terrainGrid) {
    if (!trees.length) return null;
    const groups = {};
    trees.forEach(t => { const k = t.subType||'oak'; (groups[k]=groups[k]||[]).push(t); });
    const trunkMat = new THREE.MeshPhongMaterial({color:0x5C3A1E,shininess:2});
    const canopyMat = new THREE.MeshPhongMaterial({color:0x228B22,shininess:5});
    const group = new THREE.Group();
    const matrix = new THREE.Matrix4(), color = new THREE.Color(), quat = new THREE.Quaternion();
    for (const [subType, grp] of Object.entries(groups)) {
      const template = this.getTreeTemplate(subType);
      const trunkGeo = this.buildTreeGeometry(template.trunk);
      const canopyGeo = this.buildTreeGeometry(template.canopy);
      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, grp.length);
      const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, grp.length);
      grp.forEach((tree,i) => {
        const tt = terrainGrid[Math.floor(tree.y)]?.[Math.floor(tree.x)];
        const bh = tt ? tt.height*10 : tree.height*10;
        const s = tree.treeScale||1;
        matrix.compose(new THREE.Vector3(tree.x,bh,tree.y),quat,new THREE.Vector3(s,s,s));
        trunkInst.setMatrixAt(i,matrix);
        canopyInst.setMatrixAt(i,matrix);
        color.setHex(this.getTrunkColor(subType));
        color.multiplyScalar(0.85+Math.random()*0.3);
        trunkInst.setColorAt(i,color);
        color.setHex(this.getTreeColor(subType));
        color.multiplyScalar(0.9+Math.random()*0.2);
        canopyInst.setColorAt(i,color);
      });
      trunkInst.instanceMatrix.needsUpdate = true;
      canopyInst.instanceMatrix.needsUpdate = true;
      if (trunkInst.instanceColor) trunkInst.instanceColor.needsUpdate = true;
      if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
      group.add(trunkInst);
      group.add(canopyInst);
    }
    return group;
  }

  createRockInstancedMesh(rocks, terrainGrid) {
    if (!rocks.length) return null;
    const geo = new THREE.IcosahedronGeometry(0.4, 3);
    const mat = new THREE.MeshPhongMaterial({color:0x808080,shininess:0});
    const inst = new THREE.InstancedMesh(geo, mat, rocks.length);
    const matrix = new THREE.Matrix4(), color = new THREE.Color(), euler = new THREE.Euler();
    rocks.forEach((rock,i) => {
      const tt = terrainGrid[Math.floor(rock.y)]?.[Math.floor(rock.x)];
      const bh = tt ? tt.height*10 : rock.height*10;
      const s = rock.scale||0.7;
      euler.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
      matrix.compose(new THREE.Vector3(rock.x,bh,rock.y),new THREE.Quaternion().setFromEuler(euler),new THREE.Vector3(s,s,s));
      inst.setMatrixAt(i,matrix);
      const rc = {granite:0x707070,sandstone:0xD4A574,limestone:0xE5E5D0}[rock.subType]||0x808080;
      color.setHex(rc);
      inst.setColorAt(i,color);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    return inst;
  }

  async loadNodeModel() {
    if (this.nodeGeometry) return;
    try {
      const resp = await fetch('models/stone_node.json');
      if (!resp.ok) throw new Error('stone_node.json not found');
      const model = await resp.json();
      const geo = new THREE.BufferGeometry();
      for (const name of Object.keys(model.geometry.attributes)) {
        const a = model.geometry.attributes[name];
        geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(a.array), a.itemSize));
      }
      if (model.geometry.index) {
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(model.geometry.index), 1));
      }
      geo.computeVertexNormals();
      geo.translate(-model.position.x, -model.position.y, -model.position.z);
      geo.computeBoundingBox();
      const minY = geo.boundingBox.min.y;
      geo.translate(0, -minY, 0);
      this.nodeGeometry = geo;
      console.log('Stone node model loaded');
    } catch (e) {
      console.warn('Could not load stone_node.json, using fallback:', e.message);
      this.nodeGeometry = new THREE.IcosahedronGeometry(1.0, 2);
    }
  }

  createNodeInstancedMesh(nodes, terrainGrid) {
    if (!nodes.length) return null;
    const geo = this.nodeGeometry || new THREE.IcosahedronGeometry(1.0, 2);
    const hasVertexColors = geo.getAttribute('color') != null;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.1,
      vertexColors: hasVertexColors,
    });
    const inst = new THREE.InstancedMesh(geo, mat, nodes.length);
    const matrix = new THREE.Matrix4(), color = new THREE.Color(), euler = new THREE.Euler();
    nodes.forEach((node,i) => {
      const tt = terrainGrid[Math.floor(node.y)]?.[Math.floor(node.x)];
      const bh = tt ? tt.height*10 : node.height*10;
      const s = (node.scale||0.6) * 0.5;
      euler.set(0, node.rotation||0, 0);
      matrix.compose(
        new THREE.Vector3(node.x, bh, node.y),
        new THREE.Quaternion().setFromEuler(euler),
        new THREE.Vector3(s, s, s)
      );
      inst.setMatrixAt(i, matrix);
      if (node.subType === 'metal') {
        color.setRGB(0.7, 0.75, 0.85);
      } else {
        color.setRGB(1, 1, 1);
      }
      inst.setColorAt(i, color);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    return inst;
  }

  async createSceneObjects(mapData) {
    await this.loadNodeModel();
    const meshes = [];
    meshes.push(this.createTerrainMesh(mapData.terrain, 0, 0));
    meshes.push(this.createWaterMesh(mapData.terrain));
    const trees = [], rocks = [], nodes = [];
    mapData.objects.forEach(o => { if (o.type==='tree') trees.push(o); else if (o.type==='rock') rocks.push(o); else if (o.type==='node') nodes.push(o); });
    const tm = this.createTreeInstancedMesh(trees, mapData.terrain);
    if (tm) meshes.push(tm);
    const rm = this.createRockInstancedMesh(rocks, mapData.terrain);
    if (rm) meshes.push(rm);
    const nm = this.createNodeInstancedMesh(nodes, mapData.terrain);
    if (nm) meshes.push(nm);
    return meshes;
  }
}
