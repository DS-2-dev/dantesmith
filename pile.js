/* The tools and languages, as things.

   Every mark in the about section's two rows, extruded from its own SVG
   into a slab with a soft bevel, fired in from the right when about
   opens and left to land in a heap along the bottom of the screen. The
   floor is the window's bottom edge and the walls are its sides, and every
   line of words on the page is solid too: solids() hands over their boxes,
   and they land on them and cannot be dragged through them. They come in
   one after another, shot out of the window's right edge at a height the
   page offers as clear, so they arc past the words rather than onto them.
   Each
   takes its maker's colour, and any of them can be grabbed, carried about
   and thrown. They fall face on, turning only in the
   plane of the screen, so none lands on its back showing nothing but an
   edge; each is drawn with a slight fixed tilt so its depth still shows. Leaving about fades the heap, and coming
   back fires them in again.

   three.js draws and cannon-es does the falling, both from the import map
   in index.html, and this whole file is only fetched the first time about
   opens. If either cannot load, or there is no WebGL, start() throws and
   the rows stay as they were. With motion turned down the heap is settled
   before it is shown, and stays put. */
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as CANNON from 'cannon-es';

const UNIT = 50;             /* css pixels to a world unit */

export async function start({ canvas, icons, still, solids = () => [], opening = null }) {
  if (!document.createElement('canvas').getContext('webgl2')) throw new Error('no webgl');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  /* neutral, so a maker's colour comes out as that colour rather than
     washed toward film */
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  /* Lit like toys on a shelf: a soft sky over a warm floor so no side goes
     murky, a key from high on the left that lays soft shadows across
     whatever sits behind, and a cool light from behind to pick out the
     edges. */
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d2c6, 0.75));
  const key = new THREE.DirectionalLight(0xfff6ea, 1.8);
  key.position.set(-6, 12, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  scene.add(key.target);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.4);
  rim.position.set(5, 6, -8);
  scene.add(rim);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  /* Looking straight on with no perspective, so a world unit is always the
     same number of pixels and the floor sits exactly on the window's edge. */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, 0, 0.1, 100);
  camera.position.set(0, 0, 20);

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -30, 0) });
  world.allowSleep = true;
  /* enough passes that a heap of eighteen holds itself up rather than
     settling slowly into the floor */
  world.solver.iterations = 20;
  world.defaultContactMaterial.friction = 0.6;
  world.defaultContactMaterial.restitution = 0.1;
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  const walls = [-1, 1].map((side) => {
    const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    wall.quaternion.setFromEuler(0, -side * Math.PI / 2, 0);
    world.addBody(wall);
    return wall;
  });

  /* A logo as its maker draws it: every filled shape in its SVG extruded
     in its own colour, each a hair in front of the one before so the
     details drawn on top stand proud of what they sit on, the lot centred
     and scaled so the longer side is one unit. Gradients, which an
     extrusion cannot carry, come out as the average of their stops. A
     one-colour mark is its inline SVG in data-color. */
  const loader = new SVGLoader();
  async function source(svg) {
    if (svg.dataset.model) return (await fetch(svg.dataset.model)).text();
    const copy = svg.cloneNode(true);
    copy.setAttribute('fill', svg.dataset.color);
    return new XMLSerializer().serializeToString(copy);
  }
  /* a gradient's stops, averaged by how opaque each is: the colour, and how
     much of it shows */
  function average(doc, ref) {
    const grad = doc.getElementById(ref.slice(5, -1));
    const stops = grad ? [...grad.querySelectorAll('stop')] : [];
    const mix = new THREE.Color(0, 0, 0);
    let weight = 0;
    stops.forEach((stop) => {
      const given = stop.getAttribute('stop-opacity') || stop.style.stopOpacity;
      const alpha = given ? parseFloat(given) : 1;
      mix.add(new THREE.Color(stop.getAttribute('stop-color') || stop.style.stopColor || '#000').multiplyScalar(alpha));
      weight += alpha;
    });
    return { color: weight ? mix.multiplyScalar(1 / weight) : null, opacity: stops.length ? weight / stops.length : 0 };
  }
  async function build(svg) {
    const text = await source(svg);
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const data = loader.parse(text);
    const box = new THREE.Box3();
    const parts = [];
    data.paths.forEach((path) => {
      const fill = path.userData.style.fill;
      const opacity = path.userData.style.fillOpacity ?? 1;
      /* only what the logo paints: not the outlines it clips or masks with,
         which the loader reads as shapes filled black */
      if (path.userData.node?.closest('clipPath, mask, defs, symbol')) return;
      if (!fill || fill === 'none' || opacity < 0.5) return;
      /* even-odd: some marks cut their counters out by winding alone, and
         read the other way the holes come out solid */
      path.userData.style.fillRule = 'evenodd';
      const shapes = SVGLoader.createShapes(path);
      if (!shapes.length) return;
      /* an overlay that mostly fades to nothing is left out */
      if (fill.startsWith('url(')) {
        const { color, opacity: shows } = average(doc, fill);
        if (color && shows * opacity >= 0.5) parts.push({ shapes, color });
        return;
      }
      parts.push({ shapes, color: new THREE.Color().setStyle(fill) });
    });
    const group = new THREE.Group();
    const geometries = parts.map(({ shapes }) => new THREE.ShapeGeometry(shapes));
    geometries.forEach((g) => { g.computeBoundingBox(); box.union(g.boundingBox); });
    geometries.forEach((g) => g.dispose());
    const size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y);
    const centre = box.getCenter(new THREE.Vector3());
    parts.forEach(({ shapes, color }, i) => {
      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: longest * 0.2,
        bevelEnabled: true,
        bevelThickness: longest * 0.035,
        bevelSize: longest * 0.018,
        bevelSegments: 5,
        curveSegments: 10,
      });
      /* each layer set back behind the last, then the lot turned over
         rather than flipped (SVG counts down the page, and a flip would turn
         the faces inside out as well), which brings the later ones forward */
      geometry.translate(-centre.x, -centre.y, -i * longest * 0.012);
      geometry.rotateX(Math.PI);
      geometry.scale(1 / longest, 1 / longest, 1 / longest);
      geometry.computeVertexNormals();
      /* glossy plastic: a clear coat over a softer body, so highlights run
         crisp along the bevels without the colour going metallic */
      const material = new THREE.MeshPhysicalMaterial({
        color, roughness: 0.42, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    return group;
  }

  /* What a mark collides as: its outline's convex hull, as a prism as deep
     as the mark. Close to the shape it draws, where a box left gaps and
     stacked everything like crates. */
  function hullOf(group) {
    const points = [];
    group.children.forEach(({ geometry }) => {
      const at = geometry.attributes.position;
      for (let i = 0; i < at.count; i += 1) points.push([at.getX(i), at.getY(i)]);
    });
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list) => {
      const out = [];
      list.forEach((p) => {
        while (out.length > 1 && turn(out[out.length - 2], out[out.length - 1], p) <= 1e-9) out.pop();
        out.push(p);
      });
      out.pop();
      return out;
    };
    const hull = half(points).concat(half(points.slice().reverse()));
    /* sixteen corners at most, dropping whichever adds least each time, so
       eighteen of them colliding stays cheap */
    while (hull.length > 16) {
      let least = 0;
      let smallest = Infinity;
      hull.forEach((p, i) => {
        const area = Math.abs(turn(hull[(i + hull.length - 1) % hull.length], p, hull[(i + 1) % hull.length]));
        if (area < smallest) { smallest = area; least = i; }
      });
      hull.splice(least, 1);
    }
    return hull;
  }
  function prism(hull, depth, scale) {
    const n = hull.length;
    const z = (depth * scale) / 2;
    const vertices = hull.map(([x, y]) => new CANNON.Vec3(x * scale, y * scale, z))
      .concat(hull.map(([x, y]) => new CANNON.Vec3(x * scale, y * scale, -z)));
    const faces = [[...Array(n).keys()], [...Array(n).keys()].map((i) => 2 * n - 1 - i)];
    for (let i = 0; i < n; i += 1) faces.push([i, n + i, n + ((i + 1) % n), (i + 1) % n]);
    return new CANNON.ConvexPolyhedron({ vertices, faces });
  }

  const things = (await Promise.all(icons.map(build))).map((model) => {
    const holder = new THREE.Group();
    model.rotation.set(Math.random() * 0.4 - 0.2, Math.random() * 0.4 - 0.2, 0);
    holder.add(model);
    scene.add(holder);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    return { holder, model, size, hull: hullOf(model), body: null };
  });

  /* the hand that holds one: a point the grabbed mark is pinned to where it
     was taken, moved with the pointer, and let go to throw it */
  const hand = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
  world.addBody(hand);
  const ray = new THREE.Raycaster();
  let held = null;
  let holding = null;
  const FASTEST = 22;        /* units a second a carried mark may move */

  let width = 0;
  let height = 0;
  let scale = 1;
  function fit() {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setSize(width, height, false);
    const w = width / UNIT / 2;
    camera.left = -w;
    camera.right = w;
    camera.top = height / UNIT;
    camera.bottom = 0;
    camera.updateProjectionMatrix();
    walls[0].position.set(-w, 0, 0);
    walls[1].position.set(w, 0, 0);
    /* the key's shadows cover the window and the room above it they fall
       through */
    const middle = height / UNIT / 2;
    const reach = Math.max(w, middle) + 4;
    const shade = key.shadow.camera;
    shade.left = shade.bottom = -reach;
    shade.right = shade.top = reach;
    shade.far = 80;
    shade.updateProjectionMatrix();
    key.target.position.set(0, middle, 0);
    key.position.set(-6, middle + 12, 10);
    /* a little over 80px a mark on a desktop, a little under 60 on a phone */
    scale = Math.min(1.7, Math.max(1.15, width / UNIT / 11));
  }

  /* the words on the page, as flat boxes standing where each line is */
  let blocks = [];
  function block() {
    blocks.forEach((b) => world.removeBody(b));
    blocks = solids().filter((r) => r.width > 0 && r.bottom > 0 && r.top < height).map((r) => {
      const b = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(r.width / UNIT / 2, r.height / UNIT / 2, 2)),
      });
      b.position.set((r.left + r.width / 2 - width / 2) / UNIT, (height - r.top - r.height / 2) / UNIT, 0);
      world.addBody(b);
      return b;
    });
    things.forEach(({ body }) => body?.wakeUp());
  }

  /* Where they come in: shot out of the right edge of the window, at the
     height the page offers as clear (opening().top), leftward and a little
     up, so they arc over the open floor rather than dropping on the words. */
  function door() {
    const top = opening?.().top ?? height / 3;
    return {
      x: width / UNIT / 2 - scale * 0.7,
      y: Math.max(scale, (height - top) / UNIT - scale * 0.7),
    };
  }

  let arrivals = [];
  let pending = 0;           /* marks still to come in */
  function enter(thing, at) {
    pending -= 1;
    thing.body.position.set(at.x, at.y + Math.random() * scale, 0);
    thing.body.velocity.set(-(9 + Math.random() * 13), 2 + Math.random() * 7, 0);
    thing.body.quaternion.setFromEuler(0, 0, Math.random() * Math.PI * 2);
    thing.body.angularVelocity.set(0, 0, 4 + Math.random() * 6);
    world.addBody(thing.body);
    thing.holder.visible = true;
    sync();
    wake();
  }
  function launch() {
    arrivals.forEach(clearTimeout);
    const at = door();
    const order = things.slice().sort(() => Math.random() - 0.5);
    pending = order.length;
    arrivals = order.map((thing, i) => {
      if (thing.body) world.removeBody(thing.body);
      thing.holder.scale.setScalar(scale);
      thing.holder.visible = false;
      /* still enough to sleep soon after landing, and damped enough that a
         heap at rest does not shiver */
      thing.body = new CANNON.Body({
        mass: 1,
        shape: prism(thing.hull, thing.size.z, scale),
        sleepSpeedLimit: 0.35,
        sleepTimeLimit: 0.4,
        linearDamping: 0.08,
        angularDamping: 0.45,
        linearFactor: new CANNON.Vec3(1, 1, 0),
        angularFactor: new CANNON.Vec3(0, 0, 1),
      });
      if (still.matches) {
        enter(thing, at);
        return 0;
      }
      return setTimeout(() => enter(thing, at), i * 110);
    });
  }

  /* anything that still gets out, thrown hard past a wall or squeezed
     through the floor, comes back in from above */
  function rescue(body) {
    const w = width / UNIT / 2;
    if (body.position.y > -scale && Math.abs(body.position.x) < w + scale) return;
    const at = door();
    body.position.set(at.x, at.y, 0);
    body.velocity.setZero();
    body.angularVelocity.setZero();
    body.wakeUp();
  }

  function sync() {
    things.forEach(({ holder, body }) => {
      if (!body || !body.world) return;
      rescue(body);
      holder.position.copy(body.position);
      holder.quaternion.copy(body.quaternion);
    });
  }

  let frame = 0;
  let then = 0;
  let on = false;
  function tick(now) {
    frame = 0;
    const dt = Math.min((now - (then || now)) / 1000, 1 / 30);
    then = now;
    /* carried, a mark is held to a speed it cannot tunnel through a thin
       line of words at */
    if (holding && holding.velocity.length() > FASTEST) holding.velocity.scale(FASTEST / holding.velocity.length(), holding.velocity);
    world.step(1 / 60, dt, 3);
    sync();
    renderer.render(scene, camera);
    const resting = !pending && things.every(({ body }) => body.sleepState === CANNON.Body.SLEEPING);
    if (on && (held || !resting)) frame = requestAnimationFrame(tick);
    else then = 0;
  }
  function wake() {
    if (on && !frame) frame = requestAnimationFrame(tick);
  }

  function settle() {
    for (let i = 0; i < 900; i += 1) world.step(1 / 60);
    sync();
    renderer.render(scene, camera);
  }

  /* where the pointer is, kept inside the window by half a mark so the
     hand can never drag one through the floor or a wall */
  function at(event) {
    const w = width / UNIT / 2 - scale / 2;
    const x = Math.max(-w, Math.min(w, (event.clientX - width / 2) / UNIT));
    const y = Math.max(scale / 2, Math.min(height / UNIT, (height - event.clientY) / UNIT));
    return new CANNON.Vec3(x, y, 0);
  }
  function hit(event) {
    const ndc = new THREE.Vector2((event.clientX / width) * 2 - 1, 1 - (event.clientY / height) * 2);
    ray.setFromCamera(ndc, camera);
    const found = ray.intersectObjects(things.map((thing) => thing.model), true)[0];
    return found && things.find((thing) => thing.model === found.object.parent);
  }

  window.addEventListener('pointerdown', (event) => {
    if (!on || event.button !== 0 || event.target.closest('a, button')) return;
    const thing = hit(event);
    if (!thing) return;
    event.preventDefault();
    const point = at(event);
    hand.position.copy(point);
    const local = thing.body.pointToLocalFrame(point);
    /* a pull, not a weld: strong enough to carry it, too weak to force it
       through a line of words or the floor, which push back harder */
    held = new CANNON.PointToPointConstraint(thing.body, local, hand, new CANNON.Vec3(0, 0, 0), 60);
    world.addConstraint(held);
    holding = thing.body;
    thing.body.wakeUp();
    document.documentElement.classList.add('is-holding');
    wake();
  });
  window.addEventListener('pointermove', (event) => {
    if (!on) return;
    if (held) {
      hand.position.copy(at(event));
      wake();
    } else if (event.pointerType === 'mouse') {
      document.documentElement.classList.toggle('is-over-pile', !!hit(event));
    }
  }, { passive: true });
  function letGo() {
    if (!held) return;
    world.removeConstraint(held);
    held = null;
    holding = null;
    document.documentElement.classList.remove('is-holding');
    wake();
  }
  window.addEventListener('pointerup', letGo);
  window.addEventListener('pointercancel', letGo);
  /* a finger on one carries it rather than scrolling the section */
  window.addEventListener('touchstart', (event) => {
    if (on && hit(event.touches[0])) event.preventDefault();
  }, { passive: false });

  window.addEventListener('resize', () => {
    fit();
    block();
    if (!on) return;
    if (still.matches) settle();
    else {
      things.forEach(({ body }) => body?.wakeUp());
      wake();
    }
  });

  fit();
  return {
    show() {
      on = true;
      block();
      launch();
      if (still.matches) settle();
      else wake();
    },
    /* the words moved, scrolled or reflowed */
    moved() {
      if (!on) return;
      block();
      wake();
    },
    hide() {
      arrivals.forEach(clearTimeout);
      pending = 0;
      letGo();
      on = false;
      document.documentElement.classList.remove('is-over-pile');
    },
  };
}
