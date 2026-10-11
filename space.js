/* The space: the work as a sphere of small cards that always face you. It
   turns by itself until you touch it, then only when you drag or scroll.
   Click a card and it comes forward; click it again for the note behind it. */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const gsap = window.gsap;
const root = document.querySelector(".space");
const stage = root.querySelector(".space-stage");
const counter = root.querySelector(".space-count p");
const sideWords = root.querySelectorAll("[data-side-word]");
const caption = root.querySelector(".space-caption");
const capName = caption.querySelector(".space-cap-name");
const capKind = caption.querySelector(".space-cap-kind");
const overview = caption.querySelector(".space-overview");
const label = root.querySelector(".space-label");
const nav = document.querySelector(".space-nav");

const WORK = [
  { src: "images/wsu-ai-lab-poster.webp", name: "WSU AI Lab", kind: "Poster, 2026", text: "Recruiting poster for my college\u2019s AI Lab." },
  { src: "images/mac-os-x-cd.webp", name: "T-Shirt Mockup", kind: "Apparel, 2026", text: "A draft for my own small clothing brand." },
  { src: "images/outfitr.mp4", name: "Outfitr", kind: "Demo, 2026", text: "An AI stylist that picks outfits, new or from your own wardrobe, around your aesthetic and your budget." },
];
/* The music floats in with the work: whatever Last.fm says I played last,
   as its cover. It fills in once the Worker answers. */
const MUSIC = { src: "", name: "Recently played", kind: "", text: "", music: true };
/* The message board rides along as a card too: a little drawing of its
   window with the latest notes in it. Clicking it opens the real one. */
const BOARD = { src: "", name: "Message Board", kind: "Leave a note", text: "", board: true };
const items = [...WORK, MUSIC, BOARD];
const COUNT = items.length;

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const CAM_Z = 12;
const W = () => innerWidth;
const H = () => root.clientHeight;
const mid = () => W() > 1024 && W() <= 1440;
const radiusPx = () => 250 * (mid() ? 0.8 : 1);
const planePx = () => (W() <= 640 ? 60 : 82 * (mid() ? 0.8 : 1));
const px = (n) => n * ((2 * CAM_Z * Math.tan(Math.PI / 6)) / H());

/* scene */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
camera.position.z = CAM_Z;
const group = new THREE.Group();
scene.add(group);

const geo = new THREE.PlaneGeometry(1, 1);
const loader = new THREE.TextureLoader();
let loaded = 0;
const meshes = items.map((item, i) => {
  const mat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  if (item.src) paint(mesh, item.src);
  // Fibonacci sphere, unit radius.
  const n = i * (2 / COUNT) - 1 + 1 / COUNT;
  const l = Math.sqrt(1 - n * n);
  const t = Math.PI * (3 - Math.sqrt(5)) * i;
  mesh.userData = {
    i, item, aspect: item.music ? 1 : item.board ? 0.86 : 0.75,
    home: new THREE.Vector3(Math.cos(t) * l, n, Math.sin(t) * l),
    // intro state, in screen px
    u: { c: 0, x: 0, s: 0, o: 0 },
  };
  group.add(mesh);
  return mesh;
});

/* Each card keeps its own shape. Sizes are by area, so a wide one and a
   tall one weigh the same on the sphere. */
function paint(mesh, src) {
  if (/\.mp4$/.test(src)) {
    const video = Object.assign(document.createElement("video"), { src, muted: true, loop: true, playsInline: true, autoplay: true });
    video.addEventListener("loadeddata", () => {
      const tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      mesh.userData.aspect = video.videoWidth / video.videoHeight;
      mesh.material.map = tex;
      mesh.material.needsUpdate = true;
      loaded++;
      video.play().catch(() => {});
    }, { once: true });
    return;
  }
  loader.load(src, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const old = mesh.material.map;
    mesh.userData.aspect = tex.image.width / tex.image.height;
    mesh.material.map = tex;
    mesh.material.needsUpdate = true;
    if (old) old.dispose(); else loaded++;
  });
}
function dims(m, sizePx) {
  const a = m.userData.aspect;
  return [px(sizePx * Math.sqrt(0.75 * a)), px(sizePx * Math.sqrt(0.75 / a))];
}

function resize() {
  const w = W(), h = innerHeight;
  root.style.setProperty("--space-h", h + "px");
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
addEventListener("resize", resize);

/* rotation */
const vel = { x: 0, y: 0 }, target = { x: 0, y: 0 }, smooth = { x: 0, y: 0 };
let autoSpin = !reduced;
const spinAxis = new THREE.Vector3(Math.sin(23 * Math.PI / 180), Math.cos(23 * Math.PI / 180), 0).normalize();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
const qTmp = new THREE.Quaternion();
const touched = () => { autoSpin = false; };

/* state */
let phase = "intro"; // intro | live
let ringSpin = 0, ringRate = 0.5;
const open = { index: -1, e: 0, over: 0, reserve: 0 };
let hover = -1;

/* intro */
/* The page starts with the nav, the words and the counter hidden in CSS, so
   nothing shows before the intro has put each one at its starting point. */
const unhide = () => gsap.set([nav, root.querySelector(".space-side"), counter.parentNode], { visibility: "visible" });

function intro() {
  if (reduced) {
    meshes.forEach((m) => Object.assign(m.userData.u, { x: 1, s: planePx(), o: 1 }));
    counter.textContent = "100";
    phase = "live";
    gsap.set(nav, { yPercent: 0 });
    unhide();
    return;
  }
  gsap.set(sideWords, { yPercent: 100, opacity: 0 });
  gsap.set(nav, { yPercent: -250 });
  unhide();
  gsap.to(counter, { yPercent: 0, duration: 0.75, ease: "power4.out", delay: 0.5 });

  const shown = { n: 0 };
  const poll = setInterval(() => {
    gsap.to(shown, { n: Math.min(99, (loaded / (WORK.length + 1)) * 100), duration: 0.5, ease: "power1.out", overwrite: true,
      onUpdate: () => { counter.textContent = String(Math.round(shown.n)).padStart(3, "0"); } });
  }, 100);

  const start = performance.now();
  const ready = () => loaded >= WORK.length + 1 || performance.now() - start > 30000;
  const wait = () => (ready() ? reveal() : setTimeout(wait, 100));
  setTimeout(wait, 2000);

  function reveal() {
    clearInterval(poll);
    gsap.killTweensOf(shown);
    counter.textContent = "100";
    gsap.to(counter, { yPercent: -100, duration: 0.7, ease: "power4.out", delay: 0.15 });
    const first = meshes.slice(0, 10);
    first.forEach((m, k) => {
      gsap.to(m.userData.u, { s: 70, duration: 1, ease: "back.out(1.7)", delay: k * 0.1 });
      gsap.to(m.userData.u, { o: 1, duration: 1, ease: "power3.out", delay: k * 0.1 });
    });
    gsap.delayedCall(1.3, () => gsap.to({ r: 0.5 }, { r: 3.65, duration: 1, ease: "power2.in", onUpdate() { ringRate = this.targets()[0].r; } }));
    gsap.delayedCall(2.1, () => {
      first.forEach((m, k) => gsap.to(m.userData.u, { c: 1, s: 120 * planePx() / 82, duration: 1.25, ease: "power2.inOut", delay: k * 0.05 }));
    });
    gsap.delayedCall(4.0, explode);
  }

  function explode() {
    gsap.to(nav, { yPercent: 0, duration: 1.2, ease: "power4.out" });
    gsap.to(sideWords, { yPercent: 0, opacity: 1, duration: 0.9, ease: "power4.out", stagger: 0.07, delay: 0.4 });
    meshes.forEach((m) => {
      const u = m.userData.u;
      u.c = 1;
      gsap.to(u, { x: 1, s: planePx(), o: 1, duration: 1, ease: "power3.out" });
    });
    gsap.delayedCall(1, () => { phase = "live"; });
  }
}

/* frame */
const v = new THREE.Vector3(), inv = new THREE.Quaternion();
function placeIntro(m) {
  const { u, i, home } = m.userData;
  const R = radiusPx();
  const a = (-90 + i * (360 / COUNT) + ringSpin) * Math.PI / 180;
  const ring = new THREE.Vector3(px(240 * (W() <= 640 ? 0.75 : 1)) * Math.cos(a), -px(240 * (W() <= 640 ? 0.75 : 1)) * Math.sin(a), 0);
  const center = new THREE.Vector3(0, 0, px(i * 1.5));
  if (u.x > 0) {
    const over = 1 + 0.1 * Math.sin(Math.PI * u.x);
    v.copy(home).multiplyScalar(px(R) * over).lerp(center, 1 - u.x);
    // early leave of the centre for the ten that never stood on the ring
  } else {
    v.copy(ring).lerp(center, u.c);
  }
  m.position.copy(v);
  const [w, h] = dims(m, u.s);
  m.scale.set(w, h, 1);
  m.material.opacity = u.o;
}

function placeLive(m) {
  const { i, home } = m.userData;
  const R = px(radiusPx());
  const e = open.e;
  if (i === open.index && e > 0) {
    // from its spot on the sphere (in world space) to the middle of the screen
    const world = home.clone().multiplyScalar(R).applyQuaternion(group.quaternion);
    const room = open.over * open.reserve;
    const hPx = (H() - room) * 0.7;
    const goal = new THREE.Vector3(0, px(room / 2), 0.01);
    world.lerp(goal, e);
    inv.copy(group.quaternion).invert();
    m.position.copy(world.applyQuaternion(inv));
    const a = m.userData.aspect;
    let bh = hPx, bw = bh * a;
    if (bw > W() * 0.8) { bw = W() * 0.8; bh = bw / a; }
    const [sw, sh] = dims(m, planePx());
    m.scale.set(THREE.MathUtils.lerp(sw, px(bw), e), THREE.MathUtils.lerp(sh, px(bh), e), 1);
    m.material.opacity = 1;
    m.renderOrder = 10;
  } else {
    m.position.copy(home).multiplyScalar(R * (1 + 0.8 * e));
    const [sw, sh] = dims(m, planePx());
    m.scale.set(sw, sh, 1);
    m.material.opacity = 1 - e;
    m.renderOrder = 0;
  }
}

renderer.setAnimationLoop(() => {
  if (phase === "intro") {
    ringSpin += ringRate;
    meshes.forEach(placeIntro);
  } else {
    target.x += vel.x; target.y += vel.y;
    vel.x *= 0.94; vel.y *= 0.94;
    const dx = (target.x - smooth.x) * 0.11, dy = (target.y - smooth.y) * 0.11;
    smooth.x += dx; smooth.y += dy;
    group.quaternion.premultiply(qTmp.setFromAxisAngle(AY, dy));
    group.quaternion.premultiply(qTmp.setFromAxisAngle(AX, dx));
    if (autoSpin) group.quaternion.premultiply(qTmp.setFromAxisAngle(spinAxis, 0.001));
    meshes.forEach(placeLive);
  }
  inv.copy(group.quaternion).invert();
  meshes.forEach((m) => m.quaternion.copy(inv));
  boardSync();
  renderer.render(scene, camera);
});

/* input */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(x, y) {
  ndc.set((x / W()) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(meshes).filter((h) => h.object.material.opacity > 0.5);
  if (open.index >= 0) {
    const o = hits.find((h) => h.object.userData.i === open.index);
    return o ? open.index : -1;
  }
  return hits.length ? hits[0].object.userData.i : -1;
}

let drag = null;
stage.addEventListener("pointerdown", (ev) => {
  if (phase !== "live") return;
  drag = { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY, path: 0 };
  stage.setPointerCapture(ev.pointerId);
});
stage.addEventListener("pointermove", (ev) => {
  moveLabel(ev);
  if (phase !== "live") return;
  if (drag) {
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    drag.path += Math.hypot(dx, dy);
    drag.x = ev.clientX; drag.y = ev.clientY;
    if (open.index < 0 && drag.path > 6) {
      vel.y += dx * 0.001; vel.x += dy * 0.001;
      touched();
      stage.style.cursor = "grabbing";
    }
    return;
  }
  const i = pick(ev.clientX, ev.clientY);
  setHover(i);
  const nearCenter = Math.hypot(ev.clientX - W() / 2, ev.clientY - innerHeight / 2) < 250;
  stage.style.cursor = i >= 0 ? "pointer" : open.index < 0 && nearCenter ? "grab" : "default";
});
stage.addEventListener("pointerup", (ev) => {
  if (!drag) return;
  const moved = Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy);
  const click = moved < 6 && drag.path < 10;
  drag = null;
  stage.style.cursor = "default";
  if (click) clickAt(ev.clientX, ev.clientY);
});
stage.addEventListener("wheel", (ev) => {
  if (phase !== "live" || open.index >= 0) return;
  ev.preventDefault();
  vel.y += ev.deltaY * 2e-4;
  touched();
}, { passive: false });

function clickAt(x, y) {
  const i = pick(x, y);
  if (open.index < 0) { if (i >= 0) expand(i); return; }
  if (i === open.index) toggleOverview();
  else collapse();
}

function expand(i) {
  touched();
  open.index = i;
  vel.x = vel.y = 0;
  showCaption(items[i]);
  const board = items[i].board;
  if (board) boardFly(true);
  gsap.to(open, { e: 1, duration: 0.8, ease: "power4.out", overwrite: true });
  showLabel(true);
}

function collapse() {
  if (open.over) toggleOverview(false);
  gsap.to(open, { e: 0, duration: 0.8, ease: "power4.out", overwrite: "auto",
    onComplete: () => { if (items[open.index]?.board) boardFly(false); open.index = -1; } });
  hideCaption();
  showLabel(false);
}

function toggleOverview(force) {
  const on = force ?? !open.over;
  const lines = overview.querySelectorAll("span > span");
  if (on) {
    overview.querySelector("span > span").textContent = items[open.index].text;
    gsap.to(overview, { height: "auto", duration: 0.6, ease: "power4.out" });
    gsap.fromTo(lines, { yPercent: 100 }, { yPercent: 0, duration: 0.9, ease: "power4.out", stagger: 0.1 });
    open.reserve = overview.scrollHeight + 60;
    gsap.to(open, { over: 1, duration: 0.7, ease: "power4.out" });
  } else {
    gsap.to(overview, { height: 0, duration: 0.6, ease: "power4.out" });
    gsap.to(open, { over: 0, duration: 0.7, ease: "power4.out" });
  }
  label.textContent = on ? "Close Overview" : "Overview";
}

/* hover caption */
let capTimer;
function setHover(i) {
  if (open.index >= 0 || i === hover) return;
  hover = i;
  clearTimeout(capTimer);
  if (i >= 0) capTimer = setTimeout(() => showCaption(items[i]), 90);
  else capTimer = setTimeout(hideCaption, 200);
}
function showCaption(item) {
  capName.textContent = item.name;
  capKind.textContent = item.kind;
  gsap.fromTo([capName, capKind], { yPercent: 100, opacity: 0 },
    { yPercent: 0, opacity: 1, duration: 0.9, ease: "power4.out", stagger: 0.07, overwrite: true });
}
function hideCaption() {
  gsap.to([capName, capKind], { yPercent: -100, opacity: 0, duration: 0.75, ease: "power4.out", stagger: 0.07, overwrite: true });
}

/* cursor label */
const lx = gsap.quickTo(label, "x", { duration: 0.5, ease: "power3.out" });
const ly = gsap.quickTo(label, "y", { duration: 0.5, ease: "power3.out" });
gsap.set(counter, { yPercent: 100 });
gsap.set(label, { xPercent: -50, yPercent: -50, opacity: 0, scale: 0.6 });
gsap.set([capName, capKind], { opacity: 0 });
function moveLabel(ev) {
  lx(ev.clientX); ly(ev.clientY);
  if (open.index >= 0) {
    const onCard = pick(ev.clientX, ev.clientY) === open.index;
    label.textContent = onCard ? (open.over ? "Close Overview" : "Overview") : "Close";
  }
}
function showLabel(on) {
  if (W() <= 1024) return;
  gsap.to(label, on ? { opacity: 1, scale: 1, duration: 0.45, ease: "power3.out" }
    : { opacity: 0, scale: 0.6, duration: 0.45, ease: "power3.out" });
}

/* nav pills: the active one shows its name, the rest fold down to their mark */
const pills = [...nav.querySelectorAll(".pill")];
if (reduced) nav.querySelectorAll("svg").forEach((svg) => svg.pauseAnimations());
function setActive(active, instant) {
  pills.forEach((p) => {
    const room = p.querySelector(".pill-room"), text = p.querySelector(".pill-text");
    const on = p === active;
    p.toggleAttribute("aria-current", on);
    const d = instant ? 0 : 0.7;
    gsap.to(room, { width: on ? text.offsetWidth : 0, duration: d, ease: "power3.inOut", overwrite: true });
    gsap.to(text, { opacity: on ? 1 : 0, x: on ? 0 : -8, duration: on ? d : d * 0.6, delay: on && !instant ? 0.12 : 0, ease: on ? "power3.out" : "power2.in", overwrite: true });
  });
}
pills.forEach((p) => {
  p.addEventListener("click", (ev) => { ev.preventDefault(); go(p); });
  p.addEventListener("pointerenter", () => gsap.to(p, { backgroundColor: "rgba(216,216,216,.5)", duration: 0.35, ease: "power2.out" }));
  p.addEventListener("pointerleave", () => gsap.to(p, { backgroundColor: "rgba(237,237,237,.5)", duration: 0.5, ease: "power3.inOut" }));
});
/* routes slide sideways: About comes in from the right, the space leaves left */
const about = document.querySelector(".about");
let route = 0;
function go(p) {
  const to = pills.indexOf(p);
  if (to === route) return;
  setActive(p);
  if (open.index >= 0) collapse();
  route = to;
  const tl = { duration: 1.2, ease: "expo.inOut", overwrite: true };
  if (to === 1) {
    gsap.set(about, { visibility: "visible", xPercent: 100 });
    gsap.to(about, { xPercent: 0, ...tl });
    gsap.to(root, { xPercent: -100, ...tl });
  } else {
    gsap.to(about, { xPercent: 100, ...tl, onComplete: () => gsap.set(about, { visibility: "hidden" }) });
    gsap.to(root, { xPercent: 0, ...tl });
  }
}

/* The board card. Two halves of one trick:
   - in the sphere, the card is a picture of the real window, painted from the
     window's own layout (every box, bevel, line of text and avatar where the
     browser put it), so it is the window, only small;
   - when it is clicked, the real window takes the card's place and rides the
     same animation, matched to the card's size and spot on screen each frame,
     until it lands at full size. Closing runs it back. */
const winEl = document.querySelector(".mb95");
const boardIndex = items.indexOf(BOARD);
const boardMesh = meshes[boardIndex];
const boardCanvas = document.createElement("canvas");
let boardTex = null;
loaded++;
let boardSize = { w: 320, h: 380 };
let flying = false;

function boardFinal() {
  let h = Math.round(H() * 0.7), w = Math.round(h * 0.86);
  if (w > W() * 0.8) { w = Math.round(W() * 0.8); h = Math.round(w / 0.86); }
  return { w, h };
}

function css(el) { return getComputedStyle(el); }
function rgba(str) { return str && str !== "rgba(0, 0, 0, 0)" && str !== "transparent" ? str : null; }
function splitShadows(v) {
  if (!v || v === "none") return [];
  const out = []; let depth = 0, cur = "";
  for (const ch of v) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && !depth) { out.push(cur.trim()); cur = ""; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim());
  return out.map((sh) => {
    const color = (sh.match(/rgba?\([^)]*\)/) || ["#000"])[0];
    const nums = sh.replace(color, "").replace("inset", "").trim().split(/\s+/).map(parseFloat);
    return { color, inset: /inset/.test(sh), x: nums[0] || 0, y: nums[1] || 0, spread: nums[3] || 0 };
  });
}

function paintBoard() {
  if (!winEl) return;
  const size = boardFinal();
  boardSize = size;
  const was = { hidden: winEl.hidden, vis: winEl.style.visibility, tf: winEl.style.transform };
  winEl.style.width = size.w + "px"; winEl.style.height = size.h + "px";
  if (!flying) { winEl.hidden = false; winEl.style.visibility = "hidden"; winEl.style.transform = "none"; }
  const k = 2;
  // A texture's size is fixed once it is on the GPU, so a new size needs a
  // new texture.
  if (!boardTex || boardCanvas.width !== size.w * k || boardCanvas.height !== size.h * k) {
    boardCanvas.width = size.w * k; boardCanvas.height = size.h * k;
    boardTex?.dispose();
    boardTex = new THREE.CanvasTexture(boardCanvas);
    boardTex.colorSpace = THREE.SRGBColorSpace;
    boardMesh.material.map = boardTex;
    boardMesh.material.needsUpdate = true;
  }
  const c = boardCanvas.getContext("2d");
  c.setTransform(k, 0, 0, k, 0, 0);
  c.clearRect(0, 0, size.w, size.h);
  // While flying, the window is scaled; read its layout in its own pixels.
  const base = winEl.getBoundingClientRect();
  const sc = base.width / size.w || 1;
  const R = (r) => ({ x: (r.left - base.left) / sc, y: (r.top - base.top) / sc, w: r.width / sc, h: r.height / sc });

  const clipFor = (el, self) => {
    let r = null;
    for (let p = self ? el : el.parentElement; p && p !== winEl.parentElement; p = p.parentElement) {
      const o = css(p).overflow;
      if (o !== "visible") {
        const q = R(p.getBoundingClientRect());
        r = r ? { x: Math.max(r.x, q.x), y: Math.max(r.y, q.y), w: Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x), h: Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y) } : q;
      }
      if (p === winEl) break;
    }
    return r;
  };
  const withClip = (el, fn, self) => {
    const r = clipFor(el, self);
    c.save();
    if (r) { c.beginPath(); c.rect(r.x, r.y, Math.max(0, r.w), Math.max(0, r.h)); c.clip(); }
    fn(); c.restore();
  };
  const fontOf = (st) => `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;

  for (const el of [winEl, ...winEl.querySelectorAll("*")]) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    const st = css(el);
    if (st.display === "none" || +st.opacity === 0) continue;
    if (el.classList.contains("mb95-trap")) continue;
    const r = R(el.getBoundingClientRect());
    if (!r.w || !r.h) continue;
    withClip(el, () => {
      // outer shadows first, under the box
      const shadows = splitShadows(st.boxShadow);
      for (const sh of shadows.filter((s) => !s.inset).reverse()) {
        c.beginPath();
        c.rect(r.x + sh.x - sh.spread, r.y + sh.y - sh.spread, r.w + 2 * sh.spread, r.h + 2 * sh.spread);
        c.rect(r.x, r.y, r.w, r.h);
        c.fillStyle = sh.color; c.fill("evenodd");
      }
      const bg = rgba(st.backgroundColor);
      if (bg) { c.fillStyle = bg; c.fillRect(r.x, r.y, r.w, r.h); }
      // inset shadows: the first one listed sits on top
      for (const sh of shadows.filter((s) => s.inset).reverse()) {
        c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
        c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.rect(r.x + sh.x, r.y + sh.y, r.w, r.h);
        c.fillStyle = sh.color; c.fill("evenodd"); c.restore();
      }
      for (const [side, x, y, w, h] of [["Top", r.x, r.y, r.w, 0], ["Bottom", r.x, r.y + r.h, r.w, 0], ["Left", r.x, r.y, 0, r.h], ["Right", r.x + r.w, r.y, 0, r.h]]) {
        const bw = parseFloat(st[`border${side}Width`]);
        if (!bw || st[`border${side}Style`] === "none") continue;
        c.fillStyle = st[`border${side}Color`];
        if (side === "Top") c.fillRect(x, y, w, bw);
        if (side === "Bottom") c.fillRect(x, y - bw, w, bw);
        if (side === "Left") c.fillRect(x, y, bw, h);
        if (side === "Right") c.fillRect(x - bw, y, bw, h);
      }
      const tag = el.tagName.toLowerCase();
      if (tag === "img" && el.complete && el.naturalWidth) {
        c.imageSmoothingEnabled = false;
        try { c.drawImage(el, r.x, r.y, r.w, r.h); } catch {}
      }
      if (tag === "svg") {
        c.save(); const vb = el.viewBox.baseVal;
        c.translate(r.x, r.y); c.scale(r.w / vb.width, r.h / vb.height);
        for (const sh of el.querySelectorAll("path, rect")) {
          const p = sh.tagName === "rect" ? (() => { const q = new Path2D(); q.rect(+sh.getAttribute("x"), +sh.getAttribute("y"), +sh.getAttribute("width"), +sh.getAttribute("height")); return q; })() : new Path2D(sh.getAttribute("d"));
          c.fillStyle = sh.getAttribute("fill") || "#000"; c.fill(p);
        }
        c.restore();
      }
      if (tag === "input") {
        const value = el.value || el.placeholder;
        if (value) {
          const ph = !el.value;
          c.font = fontOf(st);
          c.fillStyle = ph ? getComputedStyle(el, "::placeholder").color : st.color;
          c.textBaseline = "middle";
          c.fillText(value, r.x + parseFloat(st.paddingLeft) + parseFloat(st.borderLeftWidth || 0) + 1, r.y + r.h / 2 + 0.5);
        }
      }
    });
  }
  // text, where the browser laid out every word
  const walker = document.createTreeWalker(winEl, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!node.textContent.trim() || el.closest("button.mb95-trap, svg")) continue;
    const st = css(el);
    c.font = fontOf(st); c.fillStyle = st.color; c.textBaseline = "alphabetic";
    const m = c.measureText("Hg");
    const text = node.textContent;
    const re = /\S+/g;
    withClip(el, () => {
      for (let mt = re.exec(text); mt; mt = re.exec(text)) {
        range.setStart(node, mt.index); range.setEnd(node, mt.index + mt[0].length);
        const rr = range.getClientRects()[0];
        if (!rr) continue;
        const q = R(rr);
        c.fillText(mt[0], q.x, q.y + (q.h - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent);
      }
    }, true);
  }
  if (!flying) { winEl.hidden = was.hidden; winEl.style.visibility = was.vis; winEl.style.transform = was.tf; }
  boardMesh.userData.aspect = size.w / size.h;
  boardTex.needsUpdate = true;
}

let paintQueued = false;
function queuePaint() {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => { paintQueued = false; paintBoard(); });
}
document.fonts.load('11px "MS Sans Serif 95"').finally(queuePaint);
window.addEventListener("board:messages", () => setTimeout(queuePaint, 50));
addEventListener("resize", queuePaint);
document.querySelectorAll(".mb95 img").forEach((img) => img.addEventListener("load", queuePaint));

function boardFly(on) {
  if (!winEl) return;
  if (on) {
    paintBoard();
    flying = true;
    winEl.style.width = boardSize.w + "px"; winEl.style.height = boardSize.h + "px";
    winEl.style.visibility = "";
    winEl.hidden = false;
    boardSync();
    window.dispatchEvent(new Event("board:open"));
  } else {
    flying = false;
    paintBoard();
    winEl.hidden = true;
    window.dispatchEvent(new Event("board:close"));
  }
}

const wp = new THREE.Vector3();
function boardSync() {
  if (!flying) return;
  boardMesh.material.opacity = 0;
  boardMesh.getWorldPosition(wp);
  const dist = camera.position.z - wp.z;
  const perPx = innerHeight / (2 * Math.tan(Math.PI / 6) * dist);
  const p = wp.clone().project(camera);
  let cx = (p.x + 1) / 2 * W(), cy = (1 - p.y) / 2 * innerHeight;
  let s = (boardMesh.scale.y * perPx) / boardSize.h;
  if (open.e > 0.999) { s = 1; cx = W() / 2; cy = innerHeight / 2; }
  const x = cx - boardSize.w / 2, y = cy - boardSize.h / 2;
  winEl.style.transform = s === 1 ? `translate(${Math.round(x)}px, ${Math.round(y)}px)` : `translate(${x}px, ${y}px) scale(${s})`;
}
window.addEventListener("board:closed", () => { if (open.index >= 0) collapse(); });
// Like any open card: "Close" follows the pointer off the window, and gets
// out of the way while the pointer is on it.
winEl?.addEventListener("pointerenter", () => { if (open.index === boardIndex) showLabel(false); });
winEl?.addEventListener("pointerleave", () => { if (open.index === boardIndex && open.e > 0) showLabel(true); });
// Like any open card: "Close" follows the pointer off the window, and gets
// out of the way while the pointer is on it.
winEl?.addEventListener("pointerenter", () => { if (open.index === boardIndex) showLabel(false); });
winEl?.addEventListener("pointerleave", () => { if (open.index === boardIndex && open.e > 0) showLabel(true); });

/* about: the time in Utah, ticking, and when the site last changed (the
   server's Last-Modified, which is the last deploy; the date written in the
   page stands if the browser can't tell) */
const clock = document.querySelector(".about-clock");
const utah = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
const tick = () => { clock.textContent = utah.format(new Date()); };
tick();
setInterval(tick, 1000);
const updated = document.querySelector(".about-updated");
const mod = new Date(document.lastModified);
if (!isNaN(mod) && Date.now() - mod > 60000) {
  const pad = (n) => String(n).padStart(2, "0");
  updated.textContent = `${pad(mod.getMonth() + 1)}.${pad(mod.getDate())}.${mod.getFullYear()}`;
  updated.dateTime = mod.toISOString().slice(0, 10);
}

/* now playing */
const ENDPOINT = "https://now-playing.now-playing.workers.dev/";
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " hr ago" : Math.round(m / 1440) + " days ago";
};
async function listen() {
  try {
    const r = await fetch(ENDPOINT, { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    if (!d || !d.track) return;
    MUSIC.name = d.track;
    MUSIC.kind = d.artist || "";
    MUSIC.text = d.playing ? "Listening now." : "Last played" + (d.playedAt ? " " + ago(Date.parse(d.playedAt)) : "") + (d.album ? ", from " + d.album + "." : ".");
    // Last.fm hands over a 300px copy; the same image at full size is 1200.
    const art = d.art && d.art.replace(/\/i\/u\/\d+x\d+\//, "/i/u/_/");
    if (art && art !== MUSIC.src) { MUSIC.src = art; paint(meshes[items.indexOf(MUSIC)], art); }
  } catch {}
}
listen();
setInterval(() => { if (!document.hidden) listen(); }, 30000);

document.fonts.ready.then(() => {
  setActive(pills[0], true);
  intro();
});
