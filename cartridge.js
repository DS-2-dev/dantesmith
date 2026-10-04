/* One cartridge, in the middle of the page.

   Built here rather than loaded: the shell is an extruded outline with a
   bevel, the label a canvas texture on a plane sunk into its face, and the
   two square holes on the top edge are dark boxes. It turns slowly and leans
   toward the pointer. three.js comes from the import map in index.html; if
   it cannot load, or there is no WebGL, the page stays white. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('cartridge');

function supported() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

if (canvas && supported()) start();

async function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.35, 5);
  camera.lookAt(0, 0, 0);

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(2, 4, 3);
  scene.add(key);

  /* The shell, seen from the front: a slab with its top corners eased and
     the bottom stepped in on both sides, the way the old ones narrow where
     they go into the console. Units are about a cartridge's height. */
  const W = 1.2, H = 1.36, STEP = 0.08, LIP = 0.2, R = 0.06, D = 0.22;
  const outline = new THREE.Shape();
  outline.moveTo(-W / 2 + STEP, -H / 2);
  outline.lineTo(W / 2 - STEP, -H / 2);
  outline.lineTo(W / 2 - STEP, -H / 2 + LIP);
  outline.lineTo(W / 2, -H / 2 + LIP + STEP);
  outline.lineTo(W / 2, H / 2 - R);
  outline.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2);
  outline.lineTo(-W / 2 + R, H / 2);
  outline.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R);
  outline.lineTo(-W / 2, -H / 2 + LIP + STEP);
  outline.lineTo(-W / 2 + STEP, -H / 2 + LIP);
  outline.closePath();

  const shellGeometry = new THREE.ExtrudeGeometry(outline, {
    depth: D, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025,
    bevelSegments: 4, curveSegments: 12,
  });
  shellGeometry.translate(0, 0, -D / 2);

  const plastic = new THREE.MeshPhysicalMaterial({
    color: 0x8d8b84, roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.6,
  });
  const cartridge = new THREE.Group();
  const shell = new THREE.Mesh(shellGeometry, plastic);
  cartridge.add(shell);

  /* the label, sunk a hair into the face so the bevel frames it */
  const LW = W - 0.22, LH = 0.78;
  const recess = new THREE.Mesh(
    new THREE.BoxGeometry(LW + 0.04, LH + 0.04, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x77756e, roughness: 0.7 }),
  );
  recess.position.set(0, 0.06, D / 2 + 0.016);
  cartridge.add(recess);

  await document.fonts.load('500 120px "Funnel Display"').catch(() => {});
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(LW, LH),
    new THREE.MeshStandardMaterial({ map: labelTexture(renderer), roughness: 0.4 }),
  );
  label.position.set(0, 0.06, D / 2 + 0.027);
  cartridge.add(label);

  /* the two square holes along the top of the face */
  const hole = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  for (const x of [-W / 2 + 0.16, W / 2 - 0.16]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.02), hole);
    h.position.set(x, H / 2 - 0.1, D / 2 + 0.018);
    cartridge.add(h);
  }

  scene.add(cartridge);

  /* a soft blot under it rather than a cast shadow, which comes out
     hard-edged and slides off to the side with the light */
  const blot = document.createElement('canvas');
  blot.width = blot.height = 256;
  const bg = blot.getContext('2d');
  const fade = bg.createRadialGradient(128, 128, 0, 128, 128, 128);
  fade.addColorStop(0, 'rgba(0,0,0,0.22)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  bg.fillStyle = fade;
  bg.fillRect(0, 0, 256, 256);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.7),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blot), transparent: true, depthWrite: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -H / 2 - 0.3;
  scene.add(floor);

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    /* a narrow window pulls the camera back so the cartridge still fits */
    camera.position.z = w < h ? 5 * (h / w) * 0.8 : 5;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const pointer = { x: 0, y: 0 };
  addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / innerWidth) * 2 - 1;
    pointer.y = (event.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const lean = { x: 0, y: 0 };
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = still.matches ? 0 : now / 1000;
    lean.x += (pointer.y * 0.25 - lean.x) * Math.min(dt * 4, 1);
    lean.y += (pointer.x * 0.45 - lean.y) * Math.min(dt * 4, 1);
    cartridge.rotation.set(-0.12 + lean.x, Math.sin(t * 0.5) * 0.35 + lean.y, Math.sin(t * 0.7) * 0.03);
    cartridge.position.y = Math.sin(t * 1.1) * 0.04;
    renderer.render(scene, camera);
  });
}

/* Black label, name large, a small line under it, printed edge to edge. */
function labelTexture(renderer) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 704;
  const g = c.getContext('2d');
  g.fillStyle = '#111';
  g.fillRect(0, 0, c.width, c.height);

  const glow = g.createRadialGradient(780, 260, 10, 780, 260, 420);
  glow.addColorStop(0, '#e5132f');
  glow.addColorStop(1, 'rgba(229,19,47,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, c.width, c.height);

  g.fillStyle = '#fff';
  g.font = '500 120px "Funnel Display", system-ui, sans-serif';
  g.textBaseline = 'alphabetic';
  g.fillText('Dante', 64, 400);
  g.fillText('Smith', 64, 520);

  g.font = '500 30px "Funnel Display", system-ui, sans-serif';
  g.globalAlpha = 0.6;
  g.fillText('DESIGNER · OGDEN, UT', 64, 140);
  g.textAlign = 'right';
  g.fillText('2026', c.width - 64, 640);

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}
