'use strict';
/* ===== Kickline 27 — engine: renderer, stadium, player models, audio, input ===== */
const ENG = {};
(function () {
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.3, 1200);
  camera.position.set(0, 30, 60);
  ENG.renderer = renderer; ENG.scene = scene; ENG.camera = camera;
  const col = h => new THREE.Color(h).convertSRGBToLinear();
  ENG.col = col;
  const HX = 52.5, HZ = 34;
  ENG.HX = HX; ENG.HZ = HZ;

  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c); if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
  }
  ENG.canvasTex = canvasTex;

  // ---------- sky ----------
  const skyU = { top: { value: col('#0a1a2e') }, bot: { value: col('#2a3c50') } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y*1.6+.15,0.,1.); gl_FragColor = vec4(mix(bot,top,h),1.); }'
  }));
  scene.add(sky);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x203018, .6); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -78, right: 78, top: 60, bottom: -60, near: 10, far: 400 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0xffffff, .5); fill.position.set(60, 50, -80); scene.add(fill);

  // ---------- pitch ----------
  const grassTex = canvasTex(2048, 1400, (g, w, h) => {
    const sx = w / 124, sz = h / 86; // texture covers 124 x 86 m
    g.fillStyle = '#2a6e2e'; g.fillRect(0, 0, w, h);
    const bands = 18, bw = 105 / bands;
    for (let i = 0; i < 26; i++) {
      const x0 = (62 - HX - 4 * bw + i * bw) * sx;
      g.fillStyle = i % 2 ? '#286f2c' : '#31833a'; g.fillRect(x0, 0, bw * sx + 1, h);
    }
    // cross mowing
    for (let j = 0; j < 14; j++) { if (j % 2) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(0, (43 - HZ - 2 * 6.8 + j * 6.8) * sz, w, 6.8 * sz); } }
    // noise / wear
    const id = g.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * 18; d[i] += n * .6; d[i + 1] += n; d[i + 2] += n * .5; }
    g.putImageData(id, 0, 0);
    const wear = (x, z, rx, rz, a) => { const gr = g.createRadialGradient((62 + x) * sx, (43 + z) * sz, 0, (62 + x) * sx, (43 + z) * sz, rx * sx); gr.addColorStop(0, `rgba(120,110,60,${a})`); gr.addColorStop(1, 'rgba(120,110,60,0)'); g.fillStyle = gr; g.save(); g.translate((62 + x) * sx, (43 + z) * sz); g.scale(1, rz / rx); g.translate(-(62 + x) * sx, -(43 + z) * sz); g.fillRect(0, 0, w, h); g.restore(); };
    wear(-HX + 3, 0, 6, 5, .22); wear(HX - 3, 0, 6, 5, .22); wear(0, 0, 5, 5, .08);
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(124, 86), new THREE.MeshStandardMaterial({ map: grassTex, roughness: .92, metalness: 0 }));
  pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; scene.add(pitch);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: col('#1c2a26'), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground);

  // lines -> one merged mesh of quads
  (function lines() {
    const pos = [], idx = []; const W = .12;
    const seg = (x1, z1, x2, z2) => {
      const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz) || 1, nx = -dz / L * W / 2, nz = dx / L * W / 2, b = pos.length / 3;
      pos.push(x1 + nx, 0, z1 + nz, x1 - nx, 0, z1 - nz, x2 - nx, 0, z2 - nz, x2 + nx, 0, z2 + nz); idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    };
    const rect = (x1, z1, x2, z2) => { seg(x1, z1, x2, z1); seg(x2, z1, x2, z2); seg(x2, z2, x1, z2); seg(x1, z2, x1, z1); };
    const arc = (cx, cz, r, a0, a1, n = 48) => { for (let i = 0; i < n; i++) { const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n; seg(cx + Math.cos(t0) * r, cz + Math.sin(t0) * r, cx + Math.cos(t1) * r, cz + Math.sin(t1) * r); } };
    rect(-HX, -HZ, HX, HZ); seg(0, -HZ, 0, HZ); arc(0, 0, 9.15, 0, Math.PI * 2, 72); arc(0, 0, .12, 0, 7, 8);
    for (const s of [-1, 1]) {
      const gx = s * HX;
      rect(gx, -20.16, gx - s * 16.5, 20.16); rect(gx, -9.16, gx - s * 5.5, 9.16);
      arc(gx - s * 11, 0, .12, 0, 7, 8);
      const a = Math.acos(5.5 / 9.15); if (s > 0) arc(gx - 11, 0, 9.15, Math.PI - a, Math.PI + a, 24); else arc(-HX + 11, 0, 9.15, -a, a, 24);
      for (const t of [-1, 1]) arc(gx, t * HZ, 1, s > 0 ? (t > 0 ? Math.PI : Math.PI / 2) : (t > 0 ? -Math.PI / 2 : 0), s > 0 ? (t > 0 ? Math.PI * 1.5 : Math.PI) : (t > 0 ? 0 : Math.PI / 2), 10);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col('#f2f4ee'), roughness: .8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.position.y = .012; m.receiveShadow = true; scene.add(m);
  })();

  // goals
  const netTex = canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; for (let i = 0; i <= 64; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); } });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  ENG.goalNets = [];
  for (const s of [-1, 1]) {
    const grp = new THREE.Group(); const white = new THREE.MeshStandardMaterial({ color: col('#ffffff'), roughness: .35 });
    const post = new THREE.CylinderGeometry(.06, .06, 2.44, 12);
    for (const z of [-3.66, 3.66]) { const p = new THREE.Mesh(post, white); p.position.set(0, 1.22, z); p.castShadow = true; grp.add(p); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 7.44, 12), white); bar.rotation.x = Math.PI / 2; bar.position.y = 2.44; bar.castShadow = true; grp.add(bar);
    const mk = (w, h, rw, rh) => { const t = netTex.clone(); t.needsUpdate = true; t.repeat.set(rw, rh); return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: .8 }); };
    const back = new THREE.Mesh(new THREE.PlaneGeometry(7.32, 2.2), mk(7.32, 2.2, 7.32 * 3, 2.2 * 3)); back.rotation.y = Math.PI / 2; back.position.set(s * 2.0, 1.1, 0); back.rotation.z = 0; grp.add(back);
    back.geometry.translate(0, 0, 0);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 7.32), mk(2, 7.32, 6, 22)); top.rotation.x = -Math.PI / 2; top.position.set(s * 1.0, 2.38, 0); grp.add(top);
    for (const z of [-3.66, 3.66]) { const sd = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.4), mk(2, 2.4, 6, 7)); sd.position.set(s * 1.0, 1.2, z); grp.add(sd); }
    grp.position.x = s * HX; scene.add(grp); ENG.goalNets.push(back);
    // corner flags
    for (const z of [-HZ, HZ]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.6, 6), white); f.position.set(s * HX, .8, z); scene.add(f);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(.45, .3), new THREE.MeshStandardMaterial({ color: col('#f2b630'), side: THREE.DoubleSide })); fl.position.set(s * HX + .22, 1.45, z); scene.add(fl);
    }
  }

  // ---------- stadium ----------
  const concrete = new THREE.MeshStandardMaterial({ color: col('#3b4248'), roughness: .95 });
  const seatMat = new THREE.MeshStandardMaterial({ color: col('#1d3550'), roughness: .8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: col('#2b3036'), roughness: .6, metalness: .4, side: THREE.DoubleSide });
  const ROWS = 26, RD = .85, RH = .52, FRONT = 1.3;
  const stands = [ // [length, rotY, pos, near axis offset]
    { len: 118, ry: Math.PI / 2, x: -59, z: -41, kind: 'side' }, { len: 118, ry: -Math.PI / 2, x: 59, z: 41, kind: 'side' },
    { len: 82, ry: 0, x: 59, z: -41, kind: 'end' }, { len: 82, ry: Math.PI, x: -59, z: 41, kind: 'end' }];
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(0, FRONT);
  for (let i = 0; i < ROWS; i++) { shape.lineTo(i * RD + RD, FRONT + i * RH); shape.lineTo(i * RD + RD, FRONT + (i + 1) * RH); }
  shape.lineTo(ROWS * RD + 1.5, FRONT + ROWS * RH + 3); shape.lineTo(ROWS * RD + 1.5, 0); shape.lineTo(0, 0);
  const crowdSpots = [];
  const dummy = new THREE.Object3D();
  const lightStrips = [], glowSprites = [];
  const glowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,245,1)'); gr.addColorStop(.25, 'rgba(255,250,230,.5)'); gr.addColorStop(1, 'rgba(255,250,230,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  stands.forEach(st => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: st.len, bevelEnabled: false });
    const m = new THREE.Mesh(geo, [seatMat, concrete]); m.rotation.y = st.ry; m.position.set(st.x, 0, st.z); m.receiveShadow = true; scene.add(m);
    m.updateMatrixWorld();
    for (let i = 0; i < ROWS; i++) for (let t = .6; t < st.len - .6; t += .78) {
      if (Math.random() < .06) continue;
      const v = new THREE.Vector3(i * RD + RD * .55, FRONT + i * RH + .05, t + (Math.random() - .5) * .2).applyMatrix4(m.matrixWorld);
      crowdSpots.push(v);
    }
    // roof
    const depth = ROWS * RD + 6, rh = FRONT + ROWS * RH + 6.5;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(depth, .5, st.len + 4), roofMat);
    const loc = new THREE.Vector3(depth / 2 + 1, rh, st.len / 2); roof.position.copy(loc.applyMatrix4(m.matrixWorld)); roof.rotation.y = st.ry;
    roof.rotation.z = 0; roof.castShadow = true; scene.add(roof);
    // roof tilt via parent group
    const strip = new THREE.Mesh(new THREE.BoxGeometry(.6, .35, st.len), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    strip.position.copy(new THREE.Vector3(1.3, rh - .4, st.len / 2).applyMatrix4(m.matrixWorld)); strip.rotation.y = st.ry; scene.add(strip); lightStrips.push(strip);
    for (let t = 4; t < st.len; t += 9) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff6e0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.copy(new THREE.Vector3(1.3, rh - .7, t).applyMatrix4(m.matrixWorld)); s.scale.set(9, 9, 1); scene.add(s); glowSprites.push(s);
    }
    // back wall
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, rh, st.len + 2), concrete);
    wall.position.copy(new THREE.Vector3(depth - .5, rh / 2, st.len / 2).applyMatrix4(m.matrixWorld)); wall.rotation.y = st.ry; scene.add(wall);
  });
  // corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(28, 16, 28), concrete); c.position.set(sx * 73, 8, sz * 55); scene.add(c);
    const cr = new THREE.Mesh(new THREE.BoxGeometry(30, .5, 30), roofMat); cr.position.set(sx * 73, FRONT + ROWS * RH + 6.5, sz * 55); scene.add(cr);
  }
  // crowd (instanced, shader bob)
  const crowdU = { uTime: { value: 0 }, uAmp: { value: .05 }, uSpeed: { value: 3 } };
  const bobMat = (color) => {
    const mtl = new THREE.MeshLambertMaterial({ color });
    mtl.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, crowdU);
      sh.vertexShader = 'uniform float uTime; uniform float uAmp; uniform float uSpeed;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x*0.37 + instanceMatrix[3].z*0.71 + instanceMatrix[3].y*1.9;
        transformed.y += max(0.0, sin(uTime*uSpeed + ph*5.0)) * uAmp;
        #endif`);
    };
    return mtl;
  };
  const NC = crowdSpots.length;
  const bodyM = new THREE.InstancedMesh(new THREE.BoxGeometry(.46, .62, .3), bobMat(0xffffff), NC);
  const headM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.13, 0), bobMat(0xffffff), NC);
  const skinC = ['#f1c9a5', '#d9a577', '#a86b42', '#6b4429', '#e8b896'].map(col);
  crowdSpots.forEach((v, i) => {
    dummy.position.set(v.x, v.y + .31, v.z); dummy.rotation.set(0, 0, 0); dummy.lookAt(0, v.y + .31, 0); dummy.updateMatrix(); bodyM.setMatrixAt(i, dummy.matrix);
    dummy.position.y = v.y + .76; dummy.updateMatrix(); headM.setMatrixAt(i, dummy.matrix);
    headM.setColorAt(i, skinC[i % 5]);
  });
  scene.add(bodyM); scene.add(headM);
  ENG.paintCrowd = function (homeCols, awayCols) {
    const neutral = ['#e8e8e8', '#2a2a2a', '#5a6b7a', '#9a3b3b', '#3b5a9a', '#c9b37a'];
    for (let i = 0; i < NC; i++) {
      const v = crowdSpots[i]; const r = Math.random(); let c;
      const awayEnd = v.x < -58; // away fans behind left goal
      if (awayEnd && r < .7) c = awayCols[(Math.random() * awayCols.length) | 0];
      else if (!awayEnd && r < .6) c = homeCols[(Math.random() * homeCols.length) | 0];
      else c = neutral[(Math.random() * neutral.length) | 0];
      bodyM.setColorAt(i, col(c).multiplyScalar(.8 + Math.random() * .3));
    }
    bodyM.instanceColor.needsUpdate = true; if (headM.instanceColor) headM.instanceColor.needsUpdate = true;
  };
  ENG.paintCrowd(['#c8102e', '#ffffff'], ['#1f4fa3']);
  ENG.crowdExcite = 0;

  // ad boards
  const SPONSORS = ['VOLTA ENERGY', 'NORDKAP AIR', 'PIXELBANK', 'SOLÉ COLA', 'KESTREL TYRES', 'ORBITA MOBILE', 'HALCYON WATCHES', 'BRAVO BET-FREE', 'TERRA BOOTS', 'LUMEN TV'];
  const adTex = canvasTex(2048, 64, (g, w, h) => {
    const n = 8, cw = w / n;
    for (let i = 0; i < n; i++) {
      const hue = [210, 15, 160, 45, 280, 0, 190, 120][i];
      g.fillStyle = `hsl(${hue},70%,${i % 2 ? 22 : 45}%)`; g.fillRect(i * cw, 0, cw, h);
      g.fillStyle = '#fff'; g.font = 'italic 800 34px "Saira Condensed","Arial Narrow",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(SPONSORS[i], i * cw + cw / 2, h / 2 + 2, cw - 24);
    }
  });
  adTex.wrapS = THREE.RepeatWrapping;
  const adMat = new THREE.MeshStandardMaterial({ map: adTex, emissive: 0xffffff, emissiveMap: adTex, emissiveIntensity: .7, roughness: .5 });
  const boards = [];
  [[0, -37.2, 108, 0], [0, 37.2, 108, Math.PI], [-56.5, 0, 70, Math.PI / 2], [56.5, 0, 70, -Math.PI / 2]].forEach(([x, z, L, ry]) => {
    const t = adTex.clone(); t.needsUpdate = true; t.repeat.set(L / 60, 1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(L, .95, .12), [concrete, concrete, concrete, concrete, new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .7, roughness: .5 }), concrete]);
    m.position.set(x, .48, z); m.rotation.y = ry; m.castShadow = true; scene.add(m); boards.push(t);
  });
  // dugouts
  for (const x of [-12, 12]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(9, 2.3, 2.2), new THREE.MeshStandardMaterial({ color: col('#26333d'), roughness: .4, metalness: .3, transparent: true, opacity: .85 }));
    d.position.set(x, 1.15, 39.5); scene.add(d);
  }

  // ---------- time of day ----------
  ENG.setTimeOfDay = function (night) {
    if (night) {
      skyU.top.value = col('#03070f'); skyU.bot.value = col('#14243a');
      hemi.intensity = .4; hemi.color = col('#9fb8ff'); sun.color = col('#f4f6ff'); sun.intensity = 1.7; sun.position.set(-20, 90, 35); fill.intensity = .7;
      scene.fog = new THREE.Fog(col('#0a1220'), 180, 700);
      lightStrips.forEach(s => s.visible = true); glowSprites.forEach(s => s.visible = true); renderer.toneMappingExposure = .95;
    } else {
      skyU.top.value = col('#2f7fd4'); skyU.bot.value = col('#cfe6f5');
      hemi.intensity = .8; hemi.color = col('#cfe4ff'); sun.color = col('#fff1dc'); sun.intensity = 2.7; sun.position.set(-55, 70, 48); fill.intensity = .35;
      scene.fog = new THREE.Fog(col('#bcd8ec'), 220, 800);
      lightStrips.forEach(s => s.visible = false); glowSprites.forEach(s => s.visible = false); renderer.toneMappingExposure = 1.0;
    }
    sun.target.position.set(0, 0, 0);
  };
  ENG.setTimeOfDay(true);

  // ---------- player models ----------
  const G = {
    torso: new THREE.CylinderGeometry(.2, .165, .56, 16, 1), shorts: new THREE.CylinderGeometry(.17, .19, .26, 12),
    head: new THREE.SphereGeometry(.112, 16, 12), hair: new THREE.SphereGeometry(.12, 14, 8, 0, Math.PI * 2, 0, Math.PI * .52),
    neck: new THREE.CylinderGeometry(.05, .055, .1, 8), uArm: new THREE.CylinderGeometry(.058, .05, .3, 8), fArm: new THREE.CylinderGeometry(.046, .038, .27, 8),
    hand: new THREE.SphereGeometry(.045, 8, 6), thigh: new THREE.CylinderGeometry(.08, .065, .44, 10), shin: new THREE.CylinderGeometry(.062, .045, .42, 10),
    boot: new THREE.BoxGeometry(.1, .08, .26), ring: new THREE.RingGeometry(.55, .72, 40)
  };
  [G.uArm, G.fArm, G.thigh, G.shin].forEach(g => g.translate(0, -g.parameters.height / 2, 0));
  G.boot.translate(0, 0, .05);
  const SKIN = ['#f1c9a5', '#e0ac82', '#b97a50', '#7a4b2c', '#4a2e1c'].map(h => new THREE.MeshStandardMaterial({ color: col(h), roughness: .65 }));
  const HAIR = ['#1a1410', '#4a2e18', '#a0743c', '#d9b56a', '#2b2b2b'].map(h => new THREE.MeshStandardMaterial({ color: col(h), roughness: .9 }));
  const bootMats = ['#111111', '#f2f2f2', '#e5484d', '#2bd4ff', '#ffd400'].map(h => new THREE.MeshStandardMaterial({ color: col(h), roughness: .4 }));

  function shirtTexture(kit, number, gk) {
    return canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = kit.shirt; g.fillRect(0, 0, w, h);
      g.fillStyle = kit.trim;
      if (kit.pat === 'stripes') for (let x = 0; x < w; x += 64) g.fillRect(x + 20, 0, 26, h);
      else if (kit.pat === 'hoops') for (let y = 20; y < h; y += 56) g.fillRect(0, y, w, 26);
      else if (kit.pat === 'halves') g.fillRect(w * .25, 0, w * .5, h);
      else if (kit.pat === 'sash') { g.save(); g.translate(0, 0); g.beginPath(); g.moveTo(w * .02, 0); g.lineTo(w * .12, 0); g.lineTo(w * .22, h); g.lineTo(w * .12, h); g.fill(); g.restore(); }
      g.fillRect(0, 0, w, 14); // collar
      const num = String(number);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const nc = colorDist(kit.shirt, '#ffffff') < 200 ? '#111' : '#fff';
      g.font = '800 120px "Saira Condensed",Impact,sans-serif'; g.lineWidth = 8; g.strokeStyle = kit.pat === 'plain' ? kit.trim : '#000'; g.strokeText(num, w * .5, h * .5); g.fillStyle = nc; g.fillText(num, w * .5, h * .5);
      g.font = '800 46px "Saira Condensed",Impact,sans-serif'; g.lineWidth = 4; g.strokeText(num, w * .97, h * .42); g.fillText(num, w * .97, h * .42); g.strokeText(num, w * .03, h * .42); g.fillText(num, w * .03, h * .42);
    });
  }

  ENG.makePlayerModel = function (kit, pdata, gkKit) {
    const k = gkKit || kit;
    const shirt = new THREE.MeshStandardMaterial({ map: shirtTexture(k, pdata.num, !!gkKit), roughness: .7 });
    const sleeve = new THREE.MeshStandardMaterial({ color: col(k.pat === 'sleeves' ? k.trim : k.shirt), roughness: .7 });
    const shortsM = new THREE.MeshStandardMaterial({ color: col(k.shorts), roughness: .7 });
    const sockM = new THREE.MeshStandardMaterial({ color: col(k.socks), roughness: .8 });
    const skin = SKIN[pdata.skin % 5], hair = HAIR[pdata.hair % 5], boot = bootMats[pdata.id % 5];
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const add = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const torso = add(G.torso, shirt, body, 0, 1.33, 0); torso.scale.set(1, 1, .64);
    const shorts = add(G.shorts, shortsM, body, 0, 1.0, 0); shorts.scale.set(1, 1, .72);
    add(G.neck, skin, body, 0, 1.64, 0);
    const head = add(G.head, skin, body, 0, 1.77, .005); head.scale.set(.95, 1.08, 1);
    const hr = add(G.hair, hair, body, 0, 1.79, -.008); hr.scale.set(1, .9 + (pdata.id % 3) * .12, 1.04);
    const arms = [], legs = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * .245, 1.56, 0); body.add(sh);
      add(G.uArm, sleeve, sh, 0, 0, 0);
      const el = new THREE.Group(); el.position.y = -.3; sh.add(el); add(G.fArm, skin, el, 0, 0, 0); add(G.hand, gkKit ? new THREE.MeshStandardMaterial({ color: col('#e8e8e8') }) : skin, el, 0, -.28, 0);
      sh.rotation.z = s * .12; arms.push({ sh, el });
      const hip = new THREE.Group(); hip.position.set(s * .1, .93, 0); body.add(hip);
      add(G.thigh, skin, hip, 0, 0, 0);
      const kn = new THREE.Group(); kn.position.y = -.44; hip.add(kn); add(G.shin, sockM, kn, 0, 0, 0);
      add(G.boot, boot, kn, 0, -.45, 0);
      legs.push({ hip, kn });
    }
    root.scale.setScalar(1.06);
    scene.add(root);
    return { root, body, arms, legs, ph: Math.random() * 6, mats: [shirt, sleeve, shortsM, sockM] };
  };
  ENG.disposeModel = function (m) { scene.remove(m.root); m.mats.forEach(x => { if (x.map) x.map.dispose(); x.dispose(); }); };
  // pose: state = {speed, kick (0..1), slide, dive (-1..1 dir) , diveT, celebrate, gk}
  ENG.animate = function (m, s, dt) {
    const sp = s.speed; m.ph += dt * (sp > .3 ? 4.2 + sp * .95 : 0);
    const amp = Math.min(1, sp / 7.5) * .95, ph = m.ph;
    const [L, Rr] = m.legs, [AL, AR] = m.arms;
    m.body.rotation.set(0, 0, 0); m.body.position.set(0, 0, 0);
    if (s.slide > 0) {
      m.body.rotation.x = -1.15; m.body.position.y = .25; m.body.position.z = -.2;
      L.hip.rotation.x = -1.4; L.kn.rotation.x = .2; Rr.hip.rotation.x = -1.0; Rr.kn.rotation.x = .9;
      AL.sh.rotation.x = -.6; AR.sh.rotation.x = -.6; return;
    }
    if (s.dive) {
      const t = clamp(s.diveT, 0, 1);
      m.body.rotation.z = -s.dive * 1.35 * t; m.body.position.y = s.diveH * t; m.body.position.x = 0;
      AL.sh.rotation.set(0, 0, -2.8 + 0 * t); AR.sh.rotation.set(0, 0, 2.8); AL.el.rotation.x = 0; AR.el.rotation.x = 0;
      L.hip.rotation.x = -.2; Rr.hip.rotation.x = .3; L.kn.rotation.x = .4; Rr.kn.rotation.x = .6; return;
    }
    if (s.celebrate) {
      const b = Math.abs(Math.sin(ph * 1.2)) * .25; m.body.position.y = b;
      AL.sh.rotation.set(0, 0, -2.6); AR.sh.rotation.set(0, 0, 2.6); AL.el.rotation.x = -.3; AR.el.rotation.x = -.3;
      L.hip.rotation.x = Math.sin(ph) * amp; Rr.hip.rotation.x = -Math.sin(ph) * amp; L.kn.rotation.x = .5; Rr.kn.rotation.x = .5; return;
    }
    const lean = Math.min(.28, sp * .028);
    m.body.rotation.x = lean; m.body.position.y = Math.abs(Math.cos(ph)) * .05 * amp;
    L.hip.rotation.x = -Math.sin(ph) * amp; Rr.hip.rotation.x = Math.sin(ph) * amp;
    L.kn.rotation.x = Math.max(0, Math.sin(ph - 1.3)) * 1.3 * amp + .05; Rr.kn.rotation.x = Math.max(0, -Math.sin(ph - 1.3)) * 1.3 * amp + .05;
    AL.sh.rotation.set(Math.sin(ph) * amp * .9, 0, -.12); AR.sh.rotation.set(-Math.sin(ph) * amp * .9, 0, .12);
    AL.el.rotation.x = -.5 - amp * .6; AR.el.rotation.x = -.5 - amp * .6;
    if (s.kick > 0) { // right-foot strike: back-swing then follow-through
      const k = s.kick;
      if (k < .45) { Rr.hip.rotation.x = lerp(0, .9, k / .45); Rr.kn.rotation.x = lerp(.2, 1.4, k / .45); }
      else { const u = (k - .45) / .55; Rr.hip.rotation.x = lerp(.9, -1.3, Math.min(1, u * 1.6)); Rr.kn.rotation.x = lerp(1.4, .1, Math.min(1, u * 2)); }
      L.hip.rotation.x = -.15; L.kn.rotation.x = .25; m.body.rotation.x = -.08; AL.sh.rotation.set(0, 0, -.9); AR.sh.rotation.set(.3, 0, .5);
    }
    if (s.gkReady && sp < 1) { AL.sh.rotation.set(-.6, 0, -.5); AR.sh.rotation.set(-.6, 0, .5); AL.el.rotation.x = -.8; AR.el.rotation.x = -.8; L.kn.rotation.x = .35; Rr.kn.rotation.x = .35; m.body.position.y = -.05; }
  };
  ENG.ringGeo = G.ring;

  // ---------- ball ----------
  const ballTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#16202a';
    for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) {
      const x = (i + (j % 2) * .5) * w / 6, y = (j + .5) * h / 5; const r = 18 * (j === 0 || j === 4 ? .6 : 1);
      g.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.lineTo(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r); } g.fill();
    }
    g.strokeStyle = '#f2b630'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
  ENG.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(.17, 28, 18), new THREE.MeshStandardMaterial({ map: ballTex, roughness: .35 }));
  ENG.ballMesh.castShadow = true; ENG.ballMesh.position.set(0, .17, 0); scene.add(ENG.ballMesh);

  // ---------- resize / loop ----------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w / h < 1 ? 52 : w / h < 1.4 ? 38 : 30; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();
  ENG.onFrame = null; ENG.menuCam = true;
  let last = performance.now(), mt = 0;
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    crowdU.uTime.value += dt;
    crowdU.uAmp.value = lerp(crowdU.uAmp.value, .04 + ENG.crowdExcite * .32, dt * 3);
    crowdU.uSpeed.value = 3 + ENG.crowdExcite * 9;
    ENG.crowdExcite = Math.max(0, ENG.crowdExcite - dt * .12);
    boards.forEach(t => t.offset.x -= dt * .03);
    ENG.input.poll();
    if (ENG.onFrame) ENG.onFrame(dt);
    if (ENG.menuCam) { mt += dt * .05; camera.position.set(Math.cos(mt) * 62, 18 + Math.sin(mt * .7) * 4, Math.sin(mt) * 44); camera.lookAt(0, 2, 0); }
    renderer.render(scene, camera);
    ENG.input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- audio ----------
  const A = ENG.audio = { ctx: null, crowdG: null };
  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      const ctx = A.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const len = ctx.sampleRate * 3, buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let b = 0; for (let i = 0; i < len; i++) { b = b * .97 + (Math.random() * 2 - 1) * .03; d[i] = b * 3 + (Math.random() * 2 - 1) * .05; } }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = .5;
      A.crowdG = ctx.createGain(); A.crowdG.gain.value = 0;
      A.master = ctx.createGain(); A.master.gain.value = .8; A.master.connect(ctx.destination);
      src.connect(bp); bp.connect(A.crowdG); A.crowdG.connect(A.master); src.start();
      A.noise = buf;
    } catch (e) { A.ctx = null; }
  };
  A.crowd = function (level) { if (!A.ctx) return; A.crowdG.gain.setTargetAtTime(level, A.ctx.currentTime, .4); };
  A.whistle = function (n = 1, long = false) {
    if (!A.ctx) return; const t0 = A.ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const st = t0 + i * (long ? .55 : .32), d = i === n - 1 && long ? .8 : .22;
      const o = A.ctx.createOscillator(), o2 = A.ctx.createOscillator(), g = A.ctx.createGain(), lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
      o.frequency.value = 2900; o2.frequency.value = 3050; lfo.frequency.value = 28; lg.gain.value = 120; lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(.12, st + .02); g.gain.setValueAtTime(.12, st + d); g.gain.linearRampToValueAtTime(0, st + d + .05);
      o.connect(g); o2.connect(g); g.connect(A.master); [o, o2, lfo].forEach(x => { x.start(st); x.stop(st + d + .1); });
    }
  };
  A.kick = function (p = .5) {
    if (!A.ctx) return; const t = A.ctx.currentTime;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(50, t + .12);
    g.gain.setValueAtTime(.25 + p * .4, t); g.gain.exponentialRampToValueAtTime(.001, t + .15); o.connect(g); g.connect(A.master); o.start(t); o.stop(t + .2);
  };
  A.roar = function (amt = 1) {
    if (!A.ctx) return; const t = A.ctx.currentTime; A.crowdG.gain.cancelScheduledValues(t);
    A.crowdG.gain.setTargetAtTime(.9 * amt, t, .15); A.crowdG.gain.setTargetAtTime(.22, t + 3.5, 1.2);
  };

  // ---------- input ----------
  const I = ENG.input = { held: {}, pressed: {}, released: {}, prev: {}, ax: 0, ay: 0, touch: false, padIdx: null, lastPad: 0 };
  const KEYMAP = { KeyJ: 'pass', Space: 'pass', KeyK: 'shoot', KeyL: 'through', KeyI: 'lob', KeyQ: 'switch', KeyE: 'switch', ShiftLeft: 'sprint', ShiftRight: 'sprint', Escape: 'pause', KeyP: 'pause', KeyC: 'cam' };
  const keys = {};
  window.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; keys[e.code] = true; if (KEYMAP[e.code] || e.code.startsWith('Arrow')) e.preventDefault(); });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  const touchState = { pass: false, shoot: false, through: false, lob: false, switch: false, sprint: false }; let stickV = { x: 0, y: 0 };
  I.poll = function () {
    const st = {};
    for (const code in KEYMAP) if (keys[code]) st[KEYMAP[code]] = true;
    let x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    let y = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    for (const k in touchState) if (touchState[k]) st[k] = true;
    if (Math.hypot(stickV.x, stickV.y) > .15) { x = stickV.x; y = stickV.y; }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
      if (Math.hypot(lx, ly) > .2) { x = lx; y = -ly; }
      const b = i => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > .3);
      if (b(0)) st.pass = true; if (b(1)) st.shoot = true; if (b(3)) st.through = true; if (b(2)) st.lob = true;
      if (b(4)) st.switch = true; if (b(7) || b(5)) st.sprint = true; if (b(9)) st.pause = true; if (b(8)) st.cam = true;
      if (b(12)) y = 1; if (b(13)) y = -1; if (b(14)) x = -1; if (b(15)) x = 1;
    }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    I.ax = x; I.ay = y;
    for (const k of ['pass', 'shoot', 'through', 'lob', 'switch', 'sprint', 'pause', 'cam']) {
      const h = !!st[k]; I.pressed[k] = h && !I.prev[k]; I.released[k] = !h && I.prev[k]; I.held[k] = h;
    }
  };
  I.endFrame = function () { for (const k in I.held) I.prev[k] = I.held[k]; };
  // touch
  const stick = document.getElementById('stick'), nub = document.getElementById('nub'); let stickId = null;
  const stickMove = (t) => { const r = stick.getBoundingClientRect(); let dx = (t.clientX - r.left - r.width / 2) / (r.width / 2), dy = (t.clientY - r.top - r.height / 2) / (r.height / 2); const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } stickV = { x: dx, y: -dy }; nub.style.transform = `translate(${dx * 38}px,${dy * 38}px)`; };
  stick.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; stickId = t.identifier; stickMove(t); }, { passive: false });
  stick.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === stickId) stickMove(t); }, { passive: false });
  const endStick = e => { for (const t of e.changedTouches) if (t.identifier === stickId) { stickId = null; stickV = { x: 0, y: 0 }; nub.style.transform = ''; } };
  stick.addEventListener('touchend', endStick); stick.addEventListener('touchcancel', endStick);
  document.querySelectorAll('#tbtns button').forEach(b => {
    const k = b.dataset.k;
    b.addEventListener('touchstart', e => { e.preventDefault(); touchState[k] = true; }, { passive: false });
    b.addEventListener('touchend', e => { e.preventDefault(); touchState[k] = false; }, { passive: false });
    b.addEventListener('touchcancel', () => { touchState[k] = false; });
  });
  window.addEventListener('touchstart', () => { I.touch = true; }, { passive: true, once: true });
  I.isTouch = () => I.touch || ('ontouchstart' in window && !matchMedia('(pointer:fine)').matches);
})();
