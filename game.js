/* ============================================================
 * Arctic Survivor — v3
 * + Persistence (localStorage)
 * + Wall collision (only gate passable)
 * + Weapons market & placement (towers + spike traps)
 * ============================================================ */

(() => {
  "use strict";

  // ---------- Setup ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const ui = {
    hudMoney: document.getElementById("hudMoney"),
    hudWood: document.getElementById("hudWood"),
    hudMeat: document.getElementById("hudMeat"),
    hudAxe: document.getElementById("hudAxe"),
    hudBaseBar: document.getElementById("hudBaseBar"),
    hudScore: document.getElementById("hudScore"),
    shop: document.getElementById("shop"),
    shopTitle: document.getElementById("shopTitle"),
    shopBody: document.getElementById("shopBody"),
    shopClose: document.getElementById("shopClose"),
    toast: document.getElementById("toast"),
    btnAction: document.getElementById("btnAction"),
    joy: document.getElementById("joystick"),
    stick: document.getElementById("stick"),
    start: document.getElementById("start"),
    btnStart: document.getElementById("btnStart"),
    btnReset: document.getElementById("btnReset"),
    placeBar: document.getElementById("placeBar"),
    placeBarText: document.getElementById("placeBarText"),
    placeCancel: document.getElementById("placeCancel"),
    inputNickname: document.getElementById("inputNickname"),
    skinPrev: document.getElementById("skinPrev"),
    skinNext: document.getElementById("skinNext"),
    skinIcon: document.getElementById("skinIcon"),
    skinName: document.getElementById("skinName"),
    skinPrice: document.getElementById("skinPrice"),
    btnBuySkin: document.getElementById("btnBuySkin"),
    btnSelectSkin: document.getElementById("btnSelectSkin"),
    leaderboardList: document.getElementById("leaderboardList"),
    btnPause: document.getElementById("btnPause"),
    pauseMenu: document.getElementById("pauseMenu"),
    btnResume: document.getElementById("btnResume"),
    btnSettings: document.getElementById("btnSettings"),
    btnToLobby: document.getElementById("btnToLobby"),
  };

  const view = { w: 0, h: 0 };
  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.floor(view.w * dpr);
    canvas.height = Math.floor(view.h * dpr);
    canvas.style.width = view.w + "px";
    canvas.style.height = view.h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- Constants ----------
  const TAU = Math.PI * 2;
  const WORLD_R = 1500;
  const GRACE_TIME = 15;
  const PICKUP_RADIUS = 90;
  const GATE_ANGLE = Math.PI / 2; // south
  const GATE_SPAN = 0.22;
  const SAVE_KEY = "arctic_save_v1";

  // ---------- Weapon defs ----------
  const WEAPON_DEFS = {
    bow: {
      id: "bow",
      name: "Yay Kulesi",
      icon: "🏹",
      cost: { money: 50, wood: 12 },
      desc: "Hızlı ok atar. Orta menzil.",
      range: 180,
      rate: 0.9,
      dmg: 4,
      proj: "arrow",
      r: 12,
    },
    cannon: {
      id: "cannon",
      name: "Top Kulesi",
      icon: "💥",
      cost: { money: 150, wood: 30 },
      desc: "Yavaş atar ama alan hasarı yapar.",
      range: 200,
      rate: 2.0,
      dmg: 14,
      splash: 55,
      proj: "ball",
      r: 16,
    },
    spike: {
      id: "spike",
      name: "Çivi Tuzağı",
      icon: "🪤",
      cost: { money: 25, wood: 6 },
      desc: "Yerde durur. Üzerinden geçenleri yavaşlatır ve hasar verir.",
      range: 26,
      dps: 9,
      slow: 0.55,
      r: 14,
      isTrap: true,
    },
  };

  // ---------- Game state ----------
  const player = {
    x: 0, y: 80, r: 16, speed: 200,
    angle: 0, walkT: 0, faceX: 1,
    money: 30, wood: 0, meat: 0,
    hp: 100, maxHp: 100,
    axeLevel: 1, speedLevel: 0,
    swingT: 0, swingDir: 1,
    invuln: 0,
    footT: 0,
    score: 0,
  };

  const base = { x: 0, y: 0, r: 240, hp: 1000, maxHp: 1000, level: 1 };

  const stations = [
    { id: "axe",  x: -150, y: -30, label: "🪓 Balta",  color: "#7fb6ff" },
    { id: "wall", x:  -50, y: -60, label: "🛡 Üs",     color: "#9dffb3" },
    { id: "meat", x:   50, y: -60, label: "🥩 Et",     color: "#ffb3b3" },
    { id: "health", x: 0, y: -140, label: "❤️ Sağlık", color: "#ff8a8a" },
    { id: "guns", x:  150, y: -30, label: "🏹 Silah",  color: "#ffd66b" },
  ];

  const trees = [];
  const enemies = [];
  const drops = [];
  const customers = [];
  const particles = [];
  const swings = [];
  const footprints = [];
  const fallingTrees = [];
  const snowflakes = [];
  const projectiles = [];

  const weapons = {
    owned: { bow: 0, cannon: 0, spike: 0 },
    levels: { bow: 1, cannon: 1, spike: 1 },
    placed: [], // { type, x, y, cd, aim, hp }
  };

  function getWeaponRange(type) {
    const def = WEAPON_DEFS[type];
    const level = weapons.levels[type] || 1;
    if (type === "spike") return def.range + (level - 1) * 2;
    if (type === "bow") return def.range + (level - 1) * 15;
    if (type === "cannon") return def.range + (level - 1) * 20;
    return def.range;
  }

  function getWeaponMaxCapacity(type) {
    if (type === "bow") return Math.floor(2 + (base.level - 1) * 0.6); // Base 1: 2, Base 6: 5
    if (type === "cannon") return Math.floor(1 + base.level * 0.4); // Base 1: 1, Base 6: 3
    if (type === "spike") return 3 + (base.level - 1) * 1; // Base 1: 3, Base 6: 8
    return 5;
  }

  let placeMode = null; // { type, ghostWX, ghostWY, valid }

  let spawnTimer = 0;
  let waveNumber = 1;
  let waveTimer = GRACE_TIME;
  let waveEnemiesToSpawn = 0;
  let waveState = "waiting"; // "waiting", "spawning", "fighting"
  let customerTimer = 0;
  let treeRespawnTimer = 0;
  let camX = 0, camY = 0;
  let shake = 0;
  let timeAlive = 0;
  let isPaused = false;

  // Lobby & Skins
  const SKINS = [
    { id: "default", name: "Standart", icon: "🧍", price: 0, color: "#fff" },
    { id: "ninja", name: "Ninja", icon: "🥷", price: 200, color: "#444" },
    { id: "knight", name: "Şövalye", icon: "🛡️", price: 500, color: "#a8b5c2" },
    { id: "king", name: "Kral", icon: "👑", price: 1000, color: "#ffd66b" }
  ];
  const lobbyState = {
    nickname: "Oyuncu",
    selectedSkin: "default",
    ownedSkins: ["default"],
    leaderboard: [],
    skinIndex: 0
  };

  const input = { moveX: 0, moveY: 0, actionPressed: false, actionHeld: false };

  // ---------- Utils ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  function toast(text, ms = 1400) {
    ui.toast.textContent = text;
    ui.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => ui.toast.classList.remove("show"), ms);
  }
  function angleDelta(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  }
  function inGate(ang) {
    return Math.abs(angleDelta(ang, GATE_ANGLE)) < GATE_SPAN;
  }

  // ---------- Persistence ----------
  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: player.money, wood: player.wood, meat: player.meat,
        axeLevel: player.axeLevel, speedLevel: player.speedLevel, meatLevel: player.meatLevel,
        baseLevel: base.level, baseMaxHp: base.maxHp, baseR: base.r,
        playerMaxHp: player.maxHp,
        owned: weapons.owned,
        levels: weapons.levels,
        placed: weapons.placed.map(p => ({ type: p.type, x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp })),
        lobby: lobbyState
      }));
    } catch (e) {}
  }
  function loadGame() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      if (!s) return null;
      return JSON.parse(s);
    } catch (e) { return null; }
  }
  function resetSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  // ---------- World init ----------
  function initWorld(useSave = true) {
    trees.length = 0;
    enemies.length = 0;
    drops.length = 0;
    customers.length = 0;
    particles.length = 0;
    swings.length = 0;
    footprints.length = 0;
    fallingTrees.length = 0;
    projectiles.length = 0;

    // Defaults
    player.money = 30;
    player.wood = 0;
    player.meat = 0;
    player.axeLevel = 1;
    player.speedLevel = 0;
    player.meatLevel = 1;
    player.hp = 100;
    player.maxHp = 100;
    player.speed = 200;
    base.level = 1;
    base.maxHp = 1000;
    base.r = 240;
    weapons.owned = { bow: 0, cannon: 0, spike: 0 };
    weapons.levels = { bow: 1, cannon: 1, spike: 1 };
    weapons.placed = [];

    // Apply saved state if any
    if (useSave) {
      const s = loadGame();
      if (s) {
        player.money = s.money ?? 30;
        player.wood = s.wood ?? 0;
        player.meat = s.meat ?? 0;
        player.axeLevel = s.axeLevel ?? 1;
        player.speedLevel = s.speedLevel ?? 0;
        player.meatLevel = s.meatLevel ?? 1;
        player.maxHp = s.playerMaxHp ?? 100;
        player.hp = player.maxHp;
        player.speed = 200 + player.speedLevel * 12;
        base.level = s.baseLevel ?? 1;
        if (base.level > 6) base.level = 6;
        base.maxHp = s.baseMaxHp ?? 1000;
        if (base.maxHp > 3500) base.maxHp = 3500;
        base.r = 240 + (base.level - 1) * 30;
        base.hp = base.maxHp;
        if (s.lobby) {
          lobbyState.nickname = s.lobby.nickname || "Oyuncu";
          lobbyState.selectedSkin = s.lobby.selectedSkin || "default";
          lobbyState.ownedSkins = s.lobby.ownedSkins || ["default"];
          lobbyState.leaderboard = s.lobby.leaderboard || [];
          lobbyState.skinIndex = SKINS.findIndex(sk => sk.id === lobbyState.selectedSkin) || 0;
          if (lobbyState.skinIndex === -1) lobbyState.skinIndex = 0;
        }
        weapons.owned = s.owned || { bow: 0, cannon: 0, spike: 0 };
        weapons.levels = s.levels || { bow: 1, cannon: 1, spike: 1 };
        weapons.placed = [];
        if (Array.isArray(s.placed)) {
          for (const p of s.placed) {
            if (WEAPON_DEFS[p.type]) {
              const tw = makeTower(p.type, p.x, p.y);
              tw.maxHp = p.maxHp || 100;
              tw.hp = p.hp ?? tw.maxHp;
              weapons.placed.push(tw);
            }
          }
        }
      }
    }

    // Runtime
    player.x = 0; player.y = 80;
    player.hp = player.maxHp;
    player.score = 0;
    base.hp = base.maxHp;
    timeAlive = 0;
    waveTimer = 0;
    spawnTimer = GRACE_TIME;
    customerTimer = 5;

    for (let i = 0; i < 55; i++) spawnTree();
    if (snowflakes.length === 0) seedSnow();

    cancelPlaceMode();
  }

  function makeTower(type, x, y) {
    return { type, x, y, cd: 0, aim: 0, hp: 100 };
  }

  function seedSnow() {
    for (let i = 0; i < 80; i++) {
      snowflakes.push({
        x: rand(-view.w, view.w),
        y: rand(-view.h, view.h),
        vx: rand(-12, 4),
        vy: rand(20, 50),
        r: rand(1, 2.4),
        a: rand(0.3, 0.9),
      });
    }
  }

  function spawnTree() {
    let x, y, tries = 0;
    do {
      const a = Math.random() * TAU;
      const r = rand(base.r + 80, WORLD_R - 80);
      x = Math.cos(a) * r; y = Math.sin(a) * r;
      tries++;
    } while (tries < 8 && trees.some(t => dist(t.x, t.y, x, y) < 64));
    const isMoney = Math.random() < 0.22;
    trees.push({ x, y, r: 18, hp: 3, maxHp: 3, money: isMoney, shake: 0 });
  }

  function spawnEnemy(kind) {
    const a = Math.random() * TAU;
    const r = WORLD_R - 30;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    // Scale difficulty based on wave number instead of score
    const difficultyMul = 1 + (waveNumber * 0.3);
    if (kind === "bear") {
      const hp = Math.floor(50 * difficultyMul);
      const dmg = Math.floor(22 * difficultyMul);
      enemies.push({ kind, x, y, r: 22, speed: 65, hp, maxHp: hp, dmg, atkCd: 0, flash: 0, walkT: 0, slowT: 0, slowMul: 1 });
    } else {
      const hp = Math.floor(8 * difficultyMul);
      const dmg = Math.floor(10 * difficultyMul);
      enemies.push({ kind: "zombie", x, y, r: 14, speed: 55, hp, maxHp: hp, dmg, atkCd: 0, flash: 0, walkT: 0, slowT: 0, slowMul: 1 });
    }
  }

  function spawnCustomer() {
    const a = -Math.PI / 2 + rand(-0.6, 0.6);
    const r = WORLD_R - 40;
    const stand = stations.find(s => s.id === "meat");
    customers.push({
      x: Math.cos(a) * r, y: Math.sin(a) * r,
      r: 12, speed: 55,
      tx: stand.x, ty: stand.y,
      state: "incoming", patience: 14, walkT: 0, paid: false,
    });
  }

  function drop(x, y, type, value = 1) {
    drops.push({
      x: x + rand(-10, 10), y: y + rand(-10, 10),
      vx: rand(-50, 50), vy: rand(-90, -30),
      z: 0, vz: rand(160, 220),
      spin: rand(-8, 8), angle: 0,
      type, value, life: 30, pick: 0.35,
    });
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.flash = 0.12;
    spawnHit(e.x, e.y - 4);
    floatText(e.x, e.y - 18, "-" + Math.round(dmg), "#fff");
    if (e.hp <= 0 && !e.dead) {
      if (e.kind === "bear") {
        for (let i = 0; i < 4; i++) drop(e.x, e.y, "meat", 1);
        drop(e.x, e.y, "money", 6);
        player.score += 50;
      } else {
        drop(e.x, e.y, "money", 3);
        if (Math.random() < 0.3) drop(e.x, e.y, "meat", 1);
        player.score += 10;
      }
      e.dead = true;
      shake = Math.min(8, shake + 3);
    }
  }

  function damageTree(t, dmg) {
    t.hp -= dmg;
    t.shake = 0.35;
    for (let i = 0; i < 5; i++) {
      particles.push({
        x: t.x + rand(-8, 8), y: t.y - rand(8, 24),
        vx: rand(-90, 90), vy: rand(-180, -60),
        life: 0.6, max: 0.6, color: "#c08a4a", size: 3, gravity: 360,
      });
    }
    if (t.hp <= 0) {
      const woodN = 4 + Math.floor(Math.random() * 2);
      for (let i = 0; i < woodN; i++) drop(t.x, t.y, "wood", 1);
      if (t.money) drop(t.x, t.y, "money", 8 + Math.floor(Math.random() * 8));
      const dx = t.x - player.x, dy = t.y - player.y;
      const fallDir = Math.atan2(dy, dx);
      fallingTrees.push({ x: t.x, y: t.y, money: t.money, angle: 0, targetAngle: fallDir, t: 0, life: 1.2 });
      t.dead = true;
    }
  }

  function spawnHit(x, y) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU;
      const s = rand(40, 130);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, max: 0.4, color: "#fff", size: 3, gravity: 200 });
    }
  }

  function floatText(x, y, text, color) {
    particles.push({ x, y, vx: rand(-10, 10), vy: -50, life: 0.9, max: 0.9, color, text });
  }

  // ---------- Player attack ----------
  function playerAttack() {
    if (player.swingT > 0) return;
    player.swingT = 0.26;
    player.swingDir *= -1;

    const reach = 50 + player.axeLevel * 4;
    const ax = player.x + Math.cos(player.angle) * reach * 0.55;
    const ay = player.y + Math.sin(player.angle) * reach * 0.55;
    const dmgTree = 1 + Math.floor(player.axeLevel * 0.8);
    const dmgEnemy = 4 + player.axeLevel * 2;

    swings.push({ x: player.x, y: player.y, angle: player.angle, dir: player.swingDir, reach, t: 0, life: 0.26 });

    let hit = false;
    for (const t of trees) {
      if (t.dead) continue;
      if (dist(t.x, t.y, ax, ay) < reach * 0.65 + t.r) { damageTree(t, dmgTree); hit = true; }
    }
    for (const e of enemies) {
      if (e.dead) continue;
      if (dist(e.x, e.y, ax, ay) < reach * 0.65 + e.r) {
        damageEnemy(e, dmgEnemy);
        const dx = e.x - player.x, dy = e.y - player.y;
        const len = Math.hypot(dx, dy) || 1;
        e.x += (dx / len) * 10; e.y += (dy / len) * 10;
        hit = true;
        shake = Math.min(6, shake + 1.5);
      }
    }
    if (!hit) {
      for (let i = 0; i < 3; i++) particles.push({ x: ax, y: ay, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.25, max: 0.25, color: "rgba(255,255,255,0.7)", size: 2, gravity: 60 });
    }
  }

  // ---------- Towers ----------
  function fireProjectile(tower, target) {
    const def = WEAPON_DEFS[tower.type];
    const dx = target.x - tower.x, dy = target.y - tower.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = def.proj === "arrow" ? 460 : 280;
    projectiles.push({
      x: tower.x, y: tower.y - 14,
      vx: (dx / len) * speed, vy: (dy / len) * speed,
      dmg: def.dmg * (1 + ((weapons.levels[tower.type] || 1) - 1) * 0.5), splash: def.splash || 0,
      type: def.proj, life: getWeaponRange(tower.type) / speed * 1.3,
      angle: Math.atan2(dy, dx),
    });
  }

  function updateTowers(dt) {
    for (const tw of weapons.placed) {
      const def = WEAPON_DEFS[tw.type];
      if (def.isTrap) continue;
      tw.cd = Math.max(0, tw.cd - dt);
      // find nearest live enemy in range
      let target = null, td = Infinity;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = dist(e.x, e.y, tw.x, tw.y);
        if (d < getWeaponRange(tw.type) && d < td) { td = d; target = e; }
      }
      if (target) {
        tw.aim = lerp(tw.aim, Math.atan2(target.y - tw.y, target.x - tw.x), clamp(8 * dt, 0, 1));
        if (tw.cd <= 0) { fireProjectile(tw, target); tw.cd = def.rate; }
      }
    }
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      let hitE = null;
      for (const e of enemies) {
        if (e.dead) continue;
        if (dist(p.x, p.y, e.x, e.y) < e.r + 4) { hitE = e; break; }
      }
      if (hitE) {
        damageEnemy(hitE, p.dmg);
        if (p.splash > 0) {
          // splash effect ring
          for (let k = 0; k < 14; k++) {
            const a = Math.random() * TAU;
            particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 0.5, max: 0.5, color: "#ffb05a", size: 4, gravity: 120 });
          }
          shake = Math.min(10, shake + 4);
          for (const e of enemies) {
            if (e.dead || e === hitE) continue;
            const d = dist(p.x, p.y, e.x, e.y);
            if (d < p.splash) damageEnemy(e, p.dmg * (1 - d / p.splash) * 0.7);
          }
        }
        projectiles.splice(i, 1);
        continue;
      }
      if (p.life <= 0) projectiles.splice(i, 1);
    }
  }

  // ---------- Loop ----------
  let last = performance.now();
  let running = false;
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (running && !isPaused) update(dt);
    render(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function update(dt) {
    timeAlive += dt;

    // ---- Player movement ----
    const mlen = Math.hypot(input.moveX, input.moveY);
    let moving = false;
    if (mlen > 0.15) {
      const nx = input.moveX / mlen, ny = input.moveY / mlen;
      player.x += nx * player.speed * dt;
      player.y += ny * player.speed * dt;
      player.angle = Math.atan2(ny, nx);
      player.faceX = nx >= 0 ? 1 : -1;
      player.walkT += dt * 10;
      moving = true;
    } else {
      player.walkT *= 0.85;
    }
    const pr = Math.hypot(player.x, player.y);
    if (pr > WORLD_R - 20) { const k = (WORLD_R - 20) / pr; player.x *= k; player.y *= k; }
    if (player.swingT > 0) player.swingT -= dt;
    if (player.invuln > 0) player.invuln -= dt;

    // footprints
    if (moving) {
      player.footT -= dt;
      if (player.footT <= 0) {
        player.footT = 0.18;
        const side = -(footprints._side = -(footprints._side || 1));
        const ox = Math.cos(player.angle + Math.PI / 2) * 4 * side;
        const oy = Math.sin(player.angle + Math.PI / 2) * 4 * side;
        footprints.push({ x: player.x + ox, y: player.y + oy + 8, life: 6, max: 6, angle: player.angle });
        if (footprints.length > 60) footprints.shift();
      }
    }

    // ---- Action button ----
    if (input.actionPressed) {
      input.actionPressed = false;
      if (placeMode) {
        // act = place at player position (mobile fallback)
        tryPlaceAt(player.x, player.y - 6);
      } else {
        const st = nearestStation();
        if (st && dist(player.x, player.y, st.x, st.y) < 70) openShop(st.id);
        else playerAttack();
      }
    } else if (input.actionHeld && player.swingT <= 0 && !placeMode) {
      const st = nearestStation();
      if (!st || dist(player.x, player.y, st.x, st.y) >= 70) playerAttack();
    }

    // ---- Trees ----
    for (let i = trees.length - 1; i >= 0; i--) {
      const t = trees[i];
      t.shake = Math.max(0, t.shake - dt);
      if (t.dead) trees.splice(i, 1);
    }
    treeRespawnTimer -= dt;
    if (treeRespawnTimer <= 0 && trees.length < 65) {
      treeRespawnTimer = 2.0;
      spawnTree();
    }

    // ---- Falling trees ----
    for (let i = fallingTrees.length - 1; i >= 0; i--) {
      const f = fallingTrees[i];
      f.t += dt;
      const k = clamp(f.t / 0.5, 0, 1);
      f.angle = (k * k) * (Math.PI / 2);
      if (f.t >= f.life) fallingTrees.splice(i, 1);
    }

    // ---- Spawning (Wave System) ----
    if (waveState === "waiting") {
      waveTimer -= dt;
      if (waveTimer <= 0) {
        waveState = "spawning";
        waveEnemiesToSpawn = 7 + Math.floor(waveNumber * 4.5);
        spawnTimer = 0.5;
        toast(`Dalga ${waveNumber} Başladı!`, 2000);
      }
    } else if (waveState === "spawning") {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        // Higher chance of bears on later waves
        const bearChance = Math.min(0.35, waveNumber * 0.08);
        const kind = Math.random() < bearChance ? "bear" : "zombie";
        spawnEnemy(kind);
        waveEnemiesToSpawn--;
        
        // Spawn faster on higher waves
        spawnTimer = clamp(2.0 - waveNumber * 0.15, 0.3, 2.0);
        
        if (waveEnemiesToSpawn <= 0) {
          waveState = "fighting";
        }
      }
    } else if (waveState === "fighting") {
      if (enemies.length === 0) {
        waveState = "waiting";
        waveNumber++;
        waveTimer = 10; // 10 seconds break
        toast("Dalga Temizlendi! Yeni dalga 10 saniye sonra.", 3000);
      }
    }

    // ---- Spike traps (apply BEFORE moving enemy) ----
    for (const e of enemies) e.slowMul = 1;
    for (const tw of weapons.placed) {
      const def = WEAPON_DEFS[tw.type];
      if (!def.isTrap) continue;
      for (const e of enemies) {
        if (e.dead) continue;
        if (dist(tw.x, tw.y, e.x, e.y) < getWeaponRange(tw.type) + e.r * 0.4) {
          e.slowMul = def.slow;
          // dot
          const twLevel = weapons.levels[tw.type] || 1;
          e.hp -= def.dps * (1 + (twLevel - 1) * 0.5) * dt;
          if (Math.random() < 0.2) {
            particles.push({ x: e.x + rand(-6, 6), y: e.y + rand(-6, 6), vx: rand(-20, 20), vy: rand(-40, -10), life: 0.3, max: 0.3, color: "#ff8a8a", size: 2, gravity: 120 });
          }
          if (e.hp <= 0 && !e.dead) {
            // delegate to damageEnemy logic for drops
            e.hp = 1; damageEnemy(e, 1);
          }
        }
      }
    }

    // ---- Enemies ----
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) { enemies.splice(i, 1); continue; }
      if (e.flash > 0) e.flash -= dt;
      e.walkT += dt * 8;

      // Find nearest weapon
      let nearestWeapon = null, minWDist = Infinity;
      for (const tw of weapons.placed) {
        const d = dist(e.x, e.y, tw.x, tw.y);
        if (d < minWDist) { minWDist = d; nearestWeapon = tw; }
      }

      // Target choice
      const distPlayer = dist(e.x, e.y, player.x, player.y);
      let tx, ty;
      const playerInBase = Math.hypot(player.x, player.y) < base.r - 5;
      const enemyInBase = Math.hypot(e.x, e.y) < base.r - 5;
      
      if (nearestWeapon && minWDist < 80 && !enemyInBase) {
        tx = nearestWeapon.x; ty = nearestWeapon.y;
      } else if (enemyInBase || distPlayer < 200 || playerInBase) {
        tx = player.x; ty = player.y;
      } else {
        tx = Math.cos(GATE_ANGLE) * (base.r + 12);
        ty = Math.sin(GATE_ANGLE) * (base.r + 12);
      }

      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = e.speed * e.slowMul;
      const nx = e.x + (dx / d) * sp * dt;
      const ny = e.y + (dy / d) * sp * dt;

      // Weapon collision
      let hitWeapon = false;
      if (nearestWeapon && dist(nx, ny, nearestWeapon.x, nearestWeapon.y) < e.r + (WEAPON_DEFS[nearestWeapon.type].r || 16)) {
        hitWeapon = true;
        e.atkCd = Math.max(0, e.atkCd - dt);
        if (e.atkCd <= 0) {
          nearestWeapon.hp -= e.dmg;
          e.atkCd = 0.9;
          spawnHit(nearestWeapon.x, nearestWeapon.y - 10);
          shake = Math.min(4, shake + 1);
          if (nearestWeapon.hp <= 0) {
            weapons.placed.splice(weapons.placed.indexOf(nearestWeapon), 1);
            for (let k = 0; k < 6; k++) particles.push({ x: nearestWeapon.x, y: nearestWeapon.y, vx: rand(-60, 60), vy: rand(-100, -20), life: 0.5, max: 0.5, color: "#888", size: 4, gravity: 200 });
          }
        }
      }

      if (!hitWeapon) {
        // Wall collision (strict check, only gate passable)
        const newDist = Math.hypot(nx, ny);
        const oldDist = Math.hypot(e.x, e.y);
        const ang = Math.atan2(ny, nx);
        const allowedR = base.r + e.r * 0.4;
        const isOutside = oldDist >= allowedR - 2;
        
        if (!inGate(ang) && isOutside && newDist < allowedR) {
          // Block: clamp to wall
          const k = allowedR / Math.max(newDist, 0.01);
          e.x = nx * k;
          e.y = ny * k;
          // Attack the wall
          e.atkCd = Math.max(0, e.atkCd - dt);
          if (e.atkCd <= 0) {
            base.hp -= e.dmg * 2;
            e.atkCd = 0.9;
            spawnHit(e.x, e.y);
            floatText(e.x, e.y - 18, "-" + Math.round(e.dmg * 2), "#ff8a8a");
            shake = Math.min(6, shake + 1);
            if (base.hp <= 0) gameOver();
          }
        } else {
          e.x = nx; e.y = ny;
          e.atkCd = Math.max(0, e.atkCd - dt);
        }
      }

      // Hit player
      if (dist(e.x, e.y, player.x, player.y) < e.r + player.r + 2 && e.atkCd <= 0 && player.invuln <= 0) {
        player.hp -= e.dmg;
        player.invuln = 0.5;
        e.atkCd = 0.9;
        spawnHit(player.x, player.y);
        shake = Math.min(10, shake + 4);
        if (player.hp <= 0) gameOver();
      }
    }

    // ---- Projectiles & Towers ----
    updateTowers(dt);
    updateProjectiles(dt);

    // ---- Drops with magnet ----
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.life -= dt;
      d.angle += d.spin * dt;
      if (d.z > 0 || d.vz !== 0) {
        d.vz -= 700 * dt;
        d.z += d.vz * dt;
        if (d.z < 0) { d.z = 0; d.vz = 0; d.vx *= 0.5; d.vy *= 0.5; }
      }
      d.vx *= 0.92; d.vy *= 0.92;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.pick -= dt;
      if (d.pick <= 0) {
        const dd = dist(d.x, d.y, player.x, player.y);
        if (dd < PICKUP_RADIUS) {
          const mx = player.x - d.x, my = player.y - d.y;
          const len = Math.hypot(mx, my) || 1;
          const pull = lerp(120, 480, 1 - dd / PICKUP_RADIUS);
          d.x += (mx / len) * pull * dt;
          d.y += (my / len) * pull * dt;
          d.spin += 0.2;
        }
        if (dd < 22) {
          if (d.type === "money") player.money += d.value;
          else if (d.type === "wood") player.wood += d.value;
          else if (d.type === "meat") player.meat += d.value;
          floatText(player.x, player.y - 22,
            (d.type === "money" ? "+$" : d.type === "wood" ? "+🪵" : "+🥩") + d.value,
            d.type === "money" ? "#ffd66b" : d.type === "wood" ? "#c08a4a" : "#ff8a8a");
          for (let k = 0; k < 5; k++) particles.push({ x: d.x, y: d.y, vx: rand(-50, 50), vy: rand(-90, -20), life: 0.3, max: 0.3, color: d.type === "money" ? "#ffd66b" : d.type === "wood" ? "#c08a4a" : "#ff8a8a", size: 2, gravity: 200 });
          drops.splice(i, 1); continue;
        }
      }
      if (d.life <= 0) drops.splice(i, 1);
    }

    // ---- Customers ----
    customerTimer -= dt;
    if (customerTimer <= 0) {
      customerTimer = rand(8, 14);
      if (customers.length < 4) spawnCustomer();
    }
    for (let i = customers.length - 1; i >= 0; i--) {
      const c = customers[i];
      const dx = c.tx - c.x, dy = c.ty - c.y;
      const d = Math.hypot(dx, dy) || 1;
      const mv = c.state !== "leaving" ? d > 18 : true;
      if (mv) { c.x += (dx / d) * c.speed * dt; c.y += (dy / d) * c.speed * dt; c.walkT += dt * 7; }
      else if (c.state === "incoming") c.state = "waiting";
      if (c.state === "waiting") {
        c.patience -= dt;
        if (player.meat > 0) {
          const price = 12 + base.level * 2;
          player.meat -= 1; player.money += price;
          c.paid = true; c.state = "leaving";
          const ang = Math.atan2(c.y, c.x);
          c.tx = Math.cos(ang) * (WORLD_R + 60);
          c.ty = Math.sin(ang) * (WORLD_R + 60);
          floatText(c.x, c.y - 22, "+$" + price, "#ffd66b");
        } else if (c.patience <= 0) {
          c.state = "leaving";
          const ang = Math.atan2(c.y, c.x);
          c.tx = Math.cos(ang) * (WORLD_R + 60);
          c.ty = Math.sin(ang) * (WORLD_R + 60);
          floatText(c.x, c.y - 22, "😠", "#ff8a8a");
        }
      }
      if (c.state === "leaving" && Math.hypot(c.x, c.y) > WORLD_R) customers.splice(i, 1);
    }

    // ---- Particles ----
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = footprints.length - 1; i >= 0; i--) { footprints[i].life -= dt; if (footprints[i].life <= 0) footprints.splice(i, 1); }
    for (let i = swings.length - 1; i >= 0; i--) { swings[i].t += dt; if (swings[i].t >= swings[i].life) swings.splice(i, 1); }

    updateSnow(dt);

    camX = lerp(camX, player.x, clamp(8 * dt, 0, 1));
    camY = lerp(camY, player.y, clamp(8 * dt, 0, 1));
    shake = Math.max(0, shake - dt * 18);

    // HUD
    ui.hudMoney.textContent = player.money;
    ui.hudWood.textContent = player.wood;
    ui.hudMeat.textContent = player.meat;
    ui.hudAxe.textContent = player.axeLevel;
    ui.hudBaseBar.style.width = clamp(base.hp / base.maxHp, 0, 1) * 100 + "%";
    
    // Score updates over time
    if (timeAlive > GRACE_TIME) {
      player.score += dt * 5; // 5 points per second
    }
    ui.hudScore.textContent = Math.floor(player.score);

    // Auto-save every ~3 seconds
    if (!update._saveT || (update._saveT -= dt) <= 0) { saveGame(); update._saveT = 3; }
  }

  function updateSnow(dt) {
    if (snowflakes.length === 0) seedSnow();
    for (const s of snowflakes) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      const wx = view.w * 0.6, wy = view.h * 0.6;
      if (s.y > player.y + wy) { s.y = player.y - wy; s.x = player.x + rand(-wx, wx); }
      if (s.x < player.x - wx) s.x = player.x + wx;
      if (s.x > player.x + wx) s.x = player.x - wx;
    }
  }

  function nearestStation() {
    let best = null, bd = Infinity;
    for (const s of stations) {
      const d = dist(player.x, player.y, s.x, s.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // ---------- Render ----------
  function render(dt) {
    const W = view.w, H = view.h;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#cfe6f3"); g.addColorStop(1, "#e9f3fa");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const shx = shake ? rand(-shake, shake) : 0;
    const shy = shake ? rand(-shake, shake) : 0;
    const camOffX = -camX + W / 2 + shx;
    const camOffY = -camY + H / 2 + shy;

    ctx.save();
    ctx.translate(camOffX, camOffY);

    drawWorld();
    drawFootprints();
    drawBase();
    drawStations();

    // Spike traps under everything else (low layer)
    for (const tw of weapons.placed) {
      if (WEAPON_DEFS[tw.type].isTrap) drawTrap(tw);
    }

    const layered = [];
    for (const t of trees) layered.push({ y: t.y, draw: () => drawTree(t) });
    for (const f of fallingTrees) layered.push({ y: f.y, draw: () => drawFallingTree(f) });
    for (const d of drops) layered.push({ y: d.y, draw: () => drawDrop(d) });
    for (const c of customers) layered.push({ y: c.y, draw: () => drawCustomer(c) });
    for (const e of enemies) layered.push({ y: e.y, draw: () => drawEnemy(e) });
    for (const tw of weapons.placed) if (!WEAPON_DEFS[tw.type].isTrap) layered.push({ y: tw.y, draw: () => drawTower(tw) });
    layered.push({ y: player.y, draw: drawPlayer });
    layered.sort((a, b) => a.y - b.y);
    for (const it of layered) it.draw();

    drawProjectiles();
    drawSwings();
    drawParticles();
    drawPlaceGhost();

    ctx.restore();

    drawSnow(camOffX, camOffY);

    // Wave Banner
    if (waveState === "waiting") {
      const left = Math.ceil(waveTimer);
      ctx.save();
      ctx.fillStyle = "rgba(11,29,42,0.7)";
      const text = waveNumber === 1 ? `🛡 Hazırlık: ${left}s` : `Dalga ${waveNumber} Bekleniyor: ${left}s`;
      ctx.font = "bold 16px sans-serif";
      const w = ctx.measureText(text).width + 24;
      const x = (W - w) / 2, y = 60;
      roundRect(x, y, w, 30, 14); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, W / 2, y + 15);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(11,29,42,0.5)";
      const text = `Dalga ${waveNumber}`;
      ctx.font = "bold 14px sans-serif";
      const w = ctx.measureText(text).width + 20;
      const x = (W - w) / 2, y = 60;
      roundRect(x, y, w, 24, 12); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, W / 2, y + 12);
      ctx.restore();
    }

    const st = nearestStation();
    const inside = st && dist(player.x, player.y, st.x, st.y) < 70;
    if (placeMode) ui.btnAction.textContent = "📍";
    else ui.btnAction.textContent = inside ? "🛒" : "⚔";
  }

  function drawWorld() {
    ctx.beginPath(); ctx.arc(0, 0, WORLD_R, 0, TAU);
    ctx.fillStyle = "#dfeef8"; ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 60; i++) {
      const a = (i * 137.5) % 360 * Math.PI / 180;
      const r = (i * 73) % WORLD_R;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      ctx.beginPath(); ctx.ellipse(x, y, 24, 6, a, 0, TAU); ctx.fill();
    }
  }

  function drawFootprints() {
    for (const f of footprints) {
      ctx.save();
      ctx.translate(f.x, f.y); ctx.rotate(f.angle);
      ctx.fillStyle = `rgba(120,140,160,${0.18 * (f.life / f.max)})`;
      ctx.fillRect(-3, -2, 6, 4);
      ctx.restore();
    }
  }

  function drawBase() {
    ctx.beginPath(); ctx.arc(0, 0, base.r, 0, TAU);
    ctx.fillStyle = base.level >= 5 ? "#d0e4f2" : (base.level >= 3 ? "#e2f2fc" : "#f4fbff"); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(120,90,60,0.18)"; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, base.r - 4, 0, TAU); ctx.clip();
    ctx.strokeStyle = "rgba(160,120,80,0.08)"; ctx.lineWidth = 1;
    for (let r = -base.r; r < base.r; r += 18) { ctx.beginPath(); ctx.moveTo(-base.r, r); ctx.lineTo(base.r, r); ctx.stroke(); }
    ctx.restore();

    const segments = 40;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * TAU - Math.PI / 2;
      // Skip gate posts that fall within gate span
      if (Math.abs(angleDelta(a, GATE_ANGLE)) < GATE_SPAN) continue;
      const x = Math.cos(a) * base.r;
      const y = Math.sin(a) * base.r;
      drawFencePost(x, y, a);
    }
    drawGate(0, base.r);
  }

  function drawFencePost(x, y, a) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(-6, 6, 12, 4);
    const grad = ctx.createLinearGradient(-5, -22, 5, 8);
    grad.addColorStop(0, "#a06a35"); grad.addColorStop(1, "#6b3f1d");
    ctx.fillStyle = grad; ctx.fillRect(-5, -22, 10, 30);
    ctx.fillStyle = "#7a4f25";
    ctx.beginPath(); ctx.moveTo(-5, -22); ctx.lineTo(0, -32); ctx.lineTo(5, -22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.moveTo(-5, -22); ctx.lineTo(0, -29); ctx.lineTo(5, -22); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawGate(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#8a5a2b"; ctx.fillRect(-30, -6, 14, 18); ctx.fillRect(16, -6, 14, 18);
    ctx.fillStyle = "#a06a35"; ctx.fillRect(-28, -4, 10, 14); ctx.fillRect(18, -4, 10, 14);
    ctx.fillStyle = "#fff"; ctx.fillRect(-30, -8, 14, 3); ctx.fillRect(16, -8, 14, 3);
    ctx.restore();
  }

  function drawStations() {
    for (const s of stations) {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath(); ctx.ellipse(s.x, s.y + 14, 30, 8, 0, 0, TAU); ctx.fill();
      const g = ctx.createLinearGradient(0, s.y - 16, 0, s.y + 10);
      g.addColorStop(0, "#b27a4a"); g.addColorStop(1, "#7a4f25");
      ctx.fillStyle = g; roundRect(s.x - 30, s.y - 14, 60, 22, 5); ctx.fill();
      ctx.fillStyle = "#5a3a18"; ctx.fillRect(s.x - 28, s.y + 8, 6, 14); ctx.fillRect(s.x + 22, s.y + 8, 6, 14);
      ctx.strokeStyle = "#5a3a18"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.x, s.y - 14); ctx.lineTo(s.x, s.y - 30); ctx.stroke();
      ctx.fillStyle = s.color; roundRect(s.x - 30, s.y - 50, 60, 24, 6); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = "#0b1d2a";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(s.label, s.x, s.y - 38);

      const pulse = 1 + Math.sin(performance.now() / 240) * 0.06;
      ctx.save(); ctx.translate(s.x, s.y - 4); ctx.scale(pulse, pulse);
      if (s.id === "axe") {
        ctx.fillStyle = "#cfd6dd"; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#5a6470"; ctx.stroke();
      } else if (s.id === "meat") {
        ctx.fillStyle = "#d8546a"; ctx.beginPath(); ctx.ellipse(0, 0, 8, 5, 0, 0, TAU); ctx.fill();
      } else if (s.id === "guns") {
        // mini bow icon
        ctx.strokeStyle = "#7a4f25"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 6, -1, 1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
      } else if (s.id === "health") {
        // red cross
        ctx.fillStyle = "#ff4d4d";
        ctx.fillRect(-2, -6, 4, 12);
        ctx.fillRect(-6, -2, 12, 4);
      } else {
        ctx.fillStyle = "#a8723f"; roundRect(-8, -3, 16, 6, 2); ctx.fill();
      }
      ctx.restore();

      if (dist(player.x, player.y, s.x, s.y) < 70) {
        const t = performance.now() / 300;
        ctx.beginPath(); ctx.arc(s.x, s.y - 4, 38 + Math.sin(t) * 2, 0, TAU);
        ctx.strokeStyle = "rgba(255, 214, 107, 0.9)"; ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  function drawTree(t) {
    const sx = Math.sin(t.shake * 30) * 2;
    ctx.fillStyle = "rgba(0,0,0,0.20)";
    ctx.beginPath(); ctx.ellipse(t.x, t.y + 6, 20, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#6b3f1d"; roundRect(t.x - 4 + sx, t.y - 10, 8, 14, 2); ctx.fill();
    drawPineLayers(t.x + sx, t.y, t.money);
    if (t.money) {
      const pulse = 1 + Math.sin(performance.now() / 220) * 0.1;
      ctx.save(); ctx.translate(t.x + 14 + sx, t.y - 30); ctx.scale(pulse, pulse);
      ctx.fillStyle = "#ffd66b"; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.stroke();
      ctx.fillStyle = "#7a4d00"; ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", 0, 1);
      ctx.restore();
    }
    if (t.hp < t.maxHp) {
      ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(t.x - 14, t.y - 52, 28, 4);
      ctx.fillStyle = "#9dffb3"; ctx.fillRect(t.x - 14, t.y - 52, 28 * (t.hp / t.maxHp), 4);
    }
  }

  function drawPineLayers(x, y, money) {
    const baseGreen = money ? "#3aa459" : "#256d3b";
    const lightGreen = money ? "#5cd17c" : "#3a8a52";
    ctx.fillStyle = baseGreen;
    ctx.beginPath(); ctx.moveTo(x - 22, y - 8); ctx.lineTo(x, y - 28); ctx.lineTo(x + 22, y - 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lightGreen;
    ctx.beginPath(); ctx.moveTo(x - 18, y - 18); ctx.lineTo(x, y - 38); ctx.lineTo(x + 18, y - 18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = baseGreen;
    ctx.beginPath(); ctx.moveTo(x - 13, y - 28); ctx.lineTo(x, y - 48); ctx.lineTo(x + 13, y - 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 32); ctx.lineTo(x, y - 44); ctx.lineTo(x + 9, y - 32);
    ctx.lineTo(x + 5, y - 30); ctx.lineTo(x, y - 36); ctx.lineTo(x - 5, y - 30);
    ctx.closePath(); ctx.fill();
  }

  function drawFallingTree(f) {
    const k = clamp(f.t / f.life, 0, 1);
    const alpha = 1 - clamp((f.t - 0.5) / 0.7, 0, 1);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(Math.cos(f.targetAngle) * f.angle);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath(); ctx.ellipse(0, 6, 22 + k * 18, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#6b3f1d"; roundRect(-4, -10, 8, 14, 2); ctx.fill();
    drawPineLayers(0, 0, f.money);
    ctx.restore();
  }

  function drawDrop(d) {
    const yy = d.y - d.z * 0.4;
    ctx.fillStyle = `rgba(0,0,0,${0.25 - d.z * 0.002})`;
    ctx.beginPath(); ctx.ellipse(d.x, d.y + 4, Math.max(3, 7 - d.z * 0.05), 3, 0, 0, TAU); ctx.fill();
    const glow = d.type === "money" ? "rgba(255,214,107,0.35)" : d.type === "wood" ? "rgba(192,138,74,0.25)" : "rgba(216,84,106,0.25)";
    const grd = ctx.createRadialGradient(d.x, yy, 0, d.x, yy, 16);
    grd.addColorStop(0, glow); grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd; ctx.fillRect(d.x - 16, yy - 16, 32, 32);
    ctx.save(); ctx.translate(d.x, yy); ctx.rotate(d.angle);
    if (d.type === "money") {
      ctx.fillStyle = "#ffd66b"; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#a8740d"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = "#7a4d00"; ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", 0, 1);
    } else if (d.type === "wood") {
      ctx.fillStyle = "#a8723f"; roundRect(-9, -5, 18, 10, 3); ctx.fill();
      ctx.strokeStyle = "#6b3f1d"; ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
    } else {
      ctx.fillStyle = "#d8546a"; ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(3, -2, 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawCustomer(c) {
    const bob = Math.sin(c.walkT) * 1.5;
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath(); ctx.ellipse(c.x, c.y + 12, 10, 4, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.fillStyle = "#3a3a3a";
    const sw = Math.sin(c.walkT) * 3;
    ctx.fillRect(-5, 8, 4, 6 + sw); ctx.fillRect(1, 8, 4, 6 - sw);
    ctx.fillStyle = c.paid ? "#9dffb3" : c.state === "waiting" && c.patience < 5 ? "#ffb38a" : "#c2a78a";
    roundRect(-9, -6, 18, 18, 6); ctx.fill();
    ctx.fillStyle = "#f1c598"; ctx.beginPath(); ctx.arc(0, -10, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = "#5a3d2a"; ctx.beginPath(); ctx.arc(0, -12, 7, Math.PI, TAU); ctx.fill();
    ctx.restore();
    if (c.state === "waiting") {
      ctx.font = "16px sans-serif"; ctx.textAlign = "center";
      ctx.fillStyle = "#000"; ctx.fillText(c.patience < 5 ? "😠" : "🥩", c.x, c.y - 24);
    }
  }

  function drawEnemy(e) {
    const bob = Math.sin(e.walkT) * 1.5;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.55, e.r, e.r * 0.35, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(e.x, e.y + bob);
    if (e.kind === "bear") {
      ctx.fillStyle = "#5a4030"; ctx.beginPath(); ctx.ellipse(0, 0, 24, 16, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#3e2c20"; ctx.beginPath(); ctx.ellipse(-3, 4, 18, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#5a4030"; ctx.beginPath(); ctx.arc(18, -6, 12, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(12, -14, 4, 0, TAU); ctx.arc(24, -14, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = "#7a5a45"; ctx.beginPath(); ctx.ellipse(26, -2, 5, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.arc(20, -8, 2, 0, TAU); ctx.fill();
      const lp = Math.sin(e.walkT) * 4;
      ctx.fillStyle = "#3e2c20"; ctx.fillRect(-16, 10, 6, 6 + lp); ctx.fillRect(8, 10, 6, 6 - lp);
    } else {
      const lp = Math.sin(e.walkT) * 4;
      ctx.fillStyle = "#2f5e40"; ctx.fillRect(-6, 8, 4, 6 + lp); ctx.fillRect(2, 8, 4, 6 - lp);
      ctx.fillStyle = "#5d8c5b"; roundRect(-9, -6, 18, 18, 6); ctx.fill();
      ctx.fillStyle = "#3e6840"; ctx.fillRect(-9, 4, 18, 4);
      ctx.fillStyle = "#7ab584"; ctx.beginPath(); ctx.arc(0, -12, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ff4d4d"; ctx.fillRect(-4, -13, 2, 2); ctx.fillRect(2, -13, 2, 2);
      ctx.fillStyle = "#5d8c5b";
      const arm = Math.sin(e.walkT * 0.5) * 2;
      ctx.fillRect(-13, -3 + arm, 4, 8); ctx.fillRect(9, -3 - arm, 4, 8);
    }
    if (e.flash > 0) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = `rgba(255,255,255,${e.flash * 6})`;
      ctx.fillRect(-30, -28, 60, 60);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
    if (e.hp < e.maxHp) {
      const w = e.kind === "bear" ? 40 : 24;
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(e.x - w / 2, e.y - e.r - 14, w, 4);
      ctx.fillStyle = "#ff5b5b"; ctx.fillRect(e.x - w / 2, e.y - e.r - 14, w * (e.hp / e.maxHp), 4);
    }
  }

  function drawTower(tw) {
    const def = WEAPON_DEFS[tw.type];
    const twLevel = weapons.levels[tw.type] || 1;
    const scale = 1 + (twLevel - 1) * 0.05;
    ctx.save();
    ctx.translate(tw.x, tw.y);
    ctx.scale(scale, scale);
    ctx.translate(-tw.x, -tw.y);
    
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(tw.x, tw.y + 10, 18, 6, 0, 0, TAU); ctx.fill();
    // base platform (stone)
    ctx.fillStyle = "#6b7480"; roundRect(tw.x - 16, tw.y - 6, 32, 16, 5); ctx.fill();
    ctx.fillStyle = "#8a96a3"; roundRect(tw.x - 14, tw.y - 4, 28, 8, 4); ctx.fill();
    // post
    ctx.fillStyle = "#6b3f1d"; ctx.fillRect(tw.x - 3, tw.y - 22, 6, 18);

    if (tw.type === "bow") {
      // arrow head turret
      ctx.save();
      ctx.translate(tw.x, tw.y - 22);
      ctx.rotate(tw.aim);
      ctx.fillStyle = "#7a4f25"; roundRect(-3, -3, 18, 6, 2); ctx.fill();
      // bow string arc
      ctx.strokeStyle = "#3a2a1a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 9, -1.1, 1.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
      // arrow tip
      ctx.fillStyle = "#cfd6dd";
      ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(11, -3); ctx.lineTo(11, 3); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (tw.type === "cannon") {
      ctx.save();
      ctx.translate(tw.x, tw.y - 22);
      // dome
      ctx.fillStyle = "#4a4a4a";
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = "#6a6a6a";
      ctx.beginPath(); ctx.arc(-2, -2, 8, 0, TAU); ctx.fill();
      ctx.rotate(tw.aim);
      ctx.fillStyle = "#2a2a2a"; roundRect(0, -5, 22, 10, 3); ctx.fill();
      ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.arc(22, 0, 4, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // range ring on hover (when player nearby)
    if (dist(player.x, player.y, tw.x, tw.y) < 60) {
      ctx.beginPath(); ctx.arc(tw.x, tw.y, getWeaponRange(tw.type) * scale, 0, TAU);
      ctx.strokeStyle = "rgba(127,200,255,0.3)"; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    
    if (tw.hp < (tw.maxHp || 100)) {
      const w = 24;
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(tw.x - w / 2, tw.y - 28 * scale, w, 4);
      ctx.fillStyle = "#58e07f"; ctx.fillRect(tw.x - w / 2, tw.y - 28 * scale, w * (tw.hp / (tw.maxHp || 100)), 4);
    }
  }

  function drawTrap(tw) {
    const def = WEAPON_DEFS[tw.type];
    // ground patch
    ctx.fillStyle = "rgba(60,40,30,0.25)";
    ctx.beginPath(); ctx.arc(tw.x, tw.y, def.range, 0, TAU); ctx.fill();
    // spikes (5)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const r = 8;
      const sx = tw.x + Math.cos(a) * r;
      const sy = tw.y + Math.sin(a) * r;
      ctx.fillStyle = "#cfd6dd";
      ctx.beginPath(); ctx.moveTo(sx - 3, sy + 3); ctx.lineTo(sx, sy - 8); ctx.lineTo(sx + 3, sy + 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#5a6470"; ctx.lineWidth = 0.8; ctx.stroke();
    }
    // center peg
    ctx.fillStyle = "#5a3a18";
    ctx.beginPath(); ctx.arc(tw.x, tw.y, 3, 0, TAU); ctx.fill();
  }

  function drawProjectiles() {
    for (const p of projectiles) {
      if (p.type === "arrow") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.strokeStyle = "#7a4f25"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.fillStyle = "#cfd6dd";
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(4, -3); ctx.lineTo(4, 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillRect(-12, -2, 3, 4);
        ctx.restore();
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = "#ffb05a";
        ctx.beginPath(); ctx.arc(p.x - 2, p.y - 2, 1.5, 0, TAU); ctx.fill();
      }
    }
  }

  function drawPlayer() {
    const skinDef = SKINS.find(s => s.id === lobbyState.selectedSkin) || SKINS[0];
    const skinColor = skinDef.color;

    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath(); ctx.ellipse(player.x, player.y + 12, 14, 5, 0, 0, TAU); ctx.fill();
    drawCarryStack(player.x, player.y - 14);
    ctx.save();
    ctx.translate(player.x, player.y);
    const bob = Math.sin(player.walkT) * 1.5;
    ctx.translate(0, bob);
    const lp = Math.sin(player.walkT) * 3.5;
    ctx.fillStyle = "#2c2c2c"; ctx.fillRect(-6, 6, 4, 8 + lp); ctx.fillRect(2, 6, 4, 8 - lp);
    ctx.fillStyle = "#1a1a1a"; ctx.fillRect(-7, 13 + lp, 6, 3); ctx.fillRect(1, 13 - lp, 6, 3);
    const flashing = (player.invuln > 0 && Math.floor(performance.now() / 90) % 2 === 0);
    ctx.fillStyle = flashing ? "#fff" : skinColor;
    roundRect(-11, -8, 22, 18, 7); ctx.fill();
    ctx.fillStyle = "#5a3a18"; ctx.fillRect(-11, 4, 22, 3);
    ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(-11, -8, 22, 2);
    const sw = Math.sin(player.walkT) * 1.5;
    ctx.fillStyle = flashing ? "#fff" : skinColor;
    ctx.fillRect(-13, -4 + sw, 4, 9); ctx.fillRect(9, -4 - sw, 4, 9);
    ctx.fillStyle = "#f4c89d"; ctx.beginPath(); ctx.arc(0, -14, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = flashing ? "#fff" : skinColor;
    ctx.beginPath(); ctx.arc(0, -16, 8.5, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, -10, 8.2, Math.PI, TAU); ctx.fill();
    const swingPhase = clamp(1 - player.swingT / 0.26, 0, 1);
    const swingArc = (player.swingDir > 0 ? -1 : 1) * (1.3 - swingPhase * 2.6);
    const ang = player.angle + (player.swingT > 0 ? swingArc : 0.5 * player.swingDir);
    const ax = Math.cos(ang) * 14, ay = Math.sin(ang) * 14;
    ctx.strokeStyle = "#7a4f25"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ax, ay); ctx.stroke();
    const bladeSize = 5 + player.axeLevel;
    ctx.fillStyle = "#e8edf2"; ctx.beginPath(); ctx.arc(ax, ay, bladeSize, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#5a6470"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath(); ctx.arc(ax - bladeSize * 0.4, ay - bladeSize * 0.4, bladeSize * 0.35, 0, TAU); ctx.fill();
    ctx.restore();
    const w = 32;
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(player.x - w / 2, player.y - 34, w, 4);
    const hpRatio = clamp(player.hp / player.maxHp, 0, 1);
    ctx.fillStyle = hpRatio > 0.5 ? "#58e07f" : hpRatio > 0.25 ? "#ffd66b" : "#ff5b5b";
    ctx.fillRect(player.x - w / 2, player.y - 34, w * hpRatio, 4);
  }

  function drawCarryStack(x, y) {
    const items = [];
    const woodCount = Math.min(player.wood, 6);
    const meatCount = Math.min(player.meat, 6);
    for (let i = 0; i < woodCount; i++) items.push("wood");
    for (let i = 0; i < meatCount; i++) items.push("meat");
    const max = Math.min(items.length, 8);
    for (let i = 0; i < max; i++) {
      const item = items[i];
      const ox = (i % 2 === 0 ? -4 : 4);
      const oy = -i * 4;
      if (item === "wood") {
        ctx.fillStyle = "#a8723f"; roundRect(x - 7 + ox, y - 3 + oy, 14, 5, 2); ctx.fill();
        ctx.strokeStyle = "#6b3f1d"; ctx.lineWidth = 1; ctx.stroke();
      } else {
        ctx.fillStyle = "#d8546a"; ctx.beginPath(); ctx.ellipse(x + ox, y + oy, 6, 3.5, 0, 0, TAU); ctx.fill();
      }
    }
    if (player.wood + player.meat > 0) {
      ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
      ctx.fillStyle = "#0b1d2a"; ctx.fillText(player.wood + player.meat + "", x, y - max * 4 - 6);
    }
  }

  function drawSwings() {
    for (const s of swings) {
      const k = s.t / s.life; const a = 1 - k;
      const sweep = Math.PI * 0.9;
      const startAng = s.angle - sweep / 2 * s.dir + (sweep * k) * s.dir;
      const r1 = s.reach * 0.45, r2 = s.reach * 0.85;
      ctx.save(); ctx.translate(s.x, s.y);
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * a})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r1, startAng - 0.2, startAng + 0.2, false); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.3 * a})`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, r2, startAng - 0.4, startAng + 0.4, false); ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      if (p.text) {
        ctx.fillStyle = p.color; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.color; const s = p.size || 3;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawPlaceGhost() {
    if (!placeMode) return;
    const def = WEAPON_DEFS[placeMode.type];
    const x = placeMode.ghostWX;
    const y = placeMode.ghostWY;
    const valid = isValidPlacement(x, y);
    ctx.save();
    ctx.globalAlpha = 0.7;
    if (def.isTrap) {
      drawTrap({ x, y, type: placeMode.type });
    } else {
      drawTower({ x, y, type: placeMode.type, aim: 0 });
    }
    // ring
    ctx.beginPath(); ctx.arc(x, y, getWeaponRange(placeMode.type), 0, TAU);
    ctx.strokeStyle = valid ? "rgba(127,200,255,0.7)" : "rgba(255,90,90,0.7)";
    ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    if (!valid) {
      ctx.fillStyle = "rgba(255,90,90,0.25)"; ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawSnow(camOffX, camOffY) {
    ctx.save();
    for (const s of snowflakes) {
      const sx = s.x + camOffX, sy = s.y + camOffY;
      ctx.globalAlpha = s.a; ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ---------- Placement ----------
  function startPlaceMode(type, existingTower = null) {
    if (!existingTower) {
      const typeCount = weapons.placed.filter(w => w.type === type).length;
      const typeMax = getWeaponMaxCapacity(type);
      if (typeCount >= typeMax && weapons.owned[type] > 0) {
        toast(`Maksimum limit dolu (${typeMax})! Üssü geliştir.`);
        return;
      }
    }
    placeMode = { type, existingTower, ghostWX: player.x, ghostWY: player.y - 6, valid: false };
    ui.placeBar.classList.remove("hidden");
    ui.placeBarText.textContent =
      `${WEAPON_DEFS[type].icon} ${WEAPON_DEFS[type].name} yerleştir — üs içine dokun`;
    ui.shop.classList.add("hidden");
    toast(existingTower ? "Yerini değiştirmek için dokun" : "Yerleştirmek için üs içinde bir noktaya dokun", 2200);
  }
  function cancelPlaceMode() {
    if (placeMode && placeMode.existingTower) {
      weapons.placed.push(placeMode.existingTower);
    }
    placeMode = null;
    ui.placeBar.classList.add("hidden");
  }
  function isValidPlacement(x, y) {
    if (Math.hypot(x, y) > base.r - 22) return false;
    // not on a station
    for (const s of stations) {
      if (dist(x, y, s.x, s.y) < 36) return false;
    }
    // not too close to another tower
    for (const tw of weapons.placed) {
      if (dist(x, y, tw.x, tw.y) < 28) return false;
    }
    return true;
  }
  function tryPlaceAt(wx, wy) {
    if (!placeMode) return;
    
    if (!placeMode.existingTower) {
      const typeCount = weapons.placed.filter(w => w.type === placeMode.type).length;
      const typeMax = getWeaponMaxCapacity(placeMode.type);
      if (typeCount >= typeMax) {
        toast(`Maksimum limit dolu (${typeMax})! Üssü geliştir.`);
        cancelPlaceMode();
        return;
      }
    }
    
    if (!isValidPlacement(wx, wy)) {
      toast("Buraya yerleştirilemez", 1100);
      return;
    }
    
    if (placeMode.existingTower) {
      const tw = placeMode.existingTower;
      tw.x = wx;
      tw.y = wy;
      weapons.placed.push(tw);
      toast("Silah taşındı.", 2000);
      placeMode.existingTower = null;
      cancelPlaceMode();
    } else {
      weapons.placed.push(makeTower(placeMode.type, wx, wy));
      weapons.owned[placeMode.type] -= 1;
      toast(`${WEAPON_DEFS[placeMode.type].name} kuruldu.`, 3000);
      const typeCount = weapons.placed.filter(w => w.type === placeMode.type).length;
      const typeMax = getWeaponMaxCapacity(placeMode.type);
      if (weapons.owned[placeMode.type] <= 0 || typeCount >= typeMax) {
        cancelPlaceMode();
      }
    }
    saveGame();
  }
  function screenToWorld(sx, sy) {
    const W = view.w, H = view.h;
    const camOffX = -camX + W / 2;
    const camOffY = -camY + H / 2;
    return { x: sx - camOffX, y: sy - camOffY };
  }

  // ---------- Shop ----------
  function shopDef(stationId) {
    if (stationId === "axe") return {
      title: "Balta Atölyesi",
      items: [{
        icon: "🪓", iconColor: "#cfd6dd",
        title: `Balta Yükselt (Lv ${player.axeLevel} → ${player.axeLevel + 1})`,
        desc: "Daha hızlı kesme, daha çok hasar, daha geniş menzil.",
        cost: { money: 15 + player.axeLevel * 20, wood: 4 + player.axeLevel * 4 },
        buy: () => { player.axeLevel++; toast("Balta yükseldi! Lv " + player.axeLevel); },
      }],
    };
    if (stationId === "wall") {
      const maxed = base.level >= 6;
      return {
        title: "Üs Güçlendirme",
        items: [{
          icon: "🛡",
          title: maxed ? `Duvarlar Maksimum (Lv ${base.level})` : `Duvarları Güçlendir (Lv ${base.level} → ${base.level + 1})`,
          desc: "Üs canını, alanını ve silah sınırını artırır.",
          cost: maxed ? {} : { money: 60 + base.level * 40, wood: 20 + base.level * 15 },
          disabled: maxed,
          buy: () => { base.level++; base.maxHp += 500; base.hp = base.maxHp; base.r += 30; toast("Üs güçlendi! Lv " + base.level); },
        }, {
          icon: "🔧",
          title: "Üssü Tamir Et",
          desc: "Mevcut canı yenile.",
          cost: { wood: 6 },
          buy: () => { base.hp = base.maxHp; toast("Üs tamir edildi"); },
        }],
      };
    }
    if (stationId === "health") return {
      title: "Sağlık Çadırı",
      items: [{
        icon: "❤️",
        title: "Tam Can Yenileme",
        desc: "Karakterin canını tamamen doldurur.",
        cost: { money: 15, meat: 1 },
        disabled: player.hp >= player.maxHp,
        buy: () => { player.hp = player.maxHp; toast("Canın tamamen yenilendi!"); },
      }, {
        icon: "💪",
        title: "Karakter Maks Canını Artır",
        desc: `Maks canı 25 artırır (Şu an: ${player.maxHp}).`,
        cost: { money: 100 + (player.maxHp - 100) },
        buy: () => { player.maxHp += 25; player.hp += 25; toast("Maksimum canın arttı!"); },
      }, {
        icon: "⚡",
        title: `Karakter Hızını Artır (Lv ${player.speedLevel}/8)`,
        desc: player.speedLevel >= 8 ? "Maksimum hıza ulaşıldı." : "Karakterin hareket hızını biraz artırır.",
        cost: { money: 40 + player.speedLevel * 30 },
        disabled: player.speedLevel >= 8,
        buy: () => { player.speedLevel++; player.speed = 200 + player.speedLevel * 12; toast("Daha hızlı koşuyorsun!"); },
      }],
    };
    if (stationId === "meat") return {
      title: "Et Tezgâhı",
      items: [{
        icon: "🥩",
        title: `Hızlı Sat (${player.meat} et)`,
        desc: `Sırtındaki tüm eti hemen sat. Birim fiyat: $${10 + player.meatLevel * 2}`,
        cost: {}, disabled: player.meat <= 0,
        buy: () => { const price = (10 + player.meatLevel * 2) * player.meat; player.money += price; toast("+$" + price); player.meat = 0; },
      }, {
        icon: "📈",
        title: "Tezgâhı Yenile",
        desc: "Müşteri sabrını ve fiyatları artırır.",
        cost: { money: 25 + player.meatLevel * 18, wood: 8 },
        buy: () => { player.meatLevel++; toast("Tezgâh yükseldi! Lv " + player.meatLevel); },
      }],
    };
    if (stationId === "guns") {
      const items = [];
      const placedByType = { bow: 0, cannon: 0, spike: 0 };
      for (const p of weapons.placed) placedByType[p.type]++;

      for (const id of ["bow", "cannon", "spike"]) {
        const w = WEAPON_DEFS[id];
        const owned = weapons.owned[id] || 0;
        const placed = placedByType[id] || 0;
        const total = owned + placed;
        const typeMax = getWeaponMaxCapacity(id);
        const currentLevel = weapons.levels[id] || 1;
        const maxWeaponLevel = base.level + 2;

        const canBuyOrPlace = (owned > 0 && placed < typeMax) || (owned === 0 && total < typeMax);

        items.push({
          icon: w.icon,
          owned,
          title: total >= typeMax ? `${w.name} (Limit: ${typeMax})` : `${w.name} (Lv ${currentLevel}/${maxWeaponLevel})`,
          desc: w.desc,
          cost: owned > 0 ? {} : w.cost,
          disabled: !canBuyOrPlace,
          buy: () => {
            if (owned === 0) { weapons.owned[id] = 1; saveGame(); }
            startPlaceMode(id);
          },
          extra: {
            label: currentLevel >= maxWeaponLevel ? "Max" : `Yükselt ($${50 * currentLevel})`,
            action: () => {
              if (currentLevel >= maxWeaponLevel) { toast("Önce üssü geliştir!"); return; }
              const upCost = 50 * currentLevel;
              if (player.money >= upCost) {
                player.money -= upCost;
                weapons.levels[id] = currentLevel + 1;
                saveGame();
                openShop(stationId);
                toast(`${w.name} Seviye ${currentLevel + 1} oldu!`);
              } else {
                toast("Yetersiz para!");
              }
            },
            cls: currentLevel >= maxWeaponLevel ? "" : "place",
          }
        });
      }
      return { title: "Silah Marketi", items };
    }
    return { title: "Market", items: [] };
  }

  function openShop(stationId) {
    if (placeMode) cancelPlaceMode();
    const def = shopDef(stationId);
    ui.shopTitle.textContent = def.title;
    ui.shopBody.innerHTML = "";
    for (const it of def.items) {
      const row = document.createElement("div");
      row.className = "shop-row";
      const ic = document.createElement("div");
      ic.className = "icon"; ic.textContent = it.icon || "•";
      if (it.owned !== undefined && it.owned > 0) {
        const b = document.createElement("span");
        b.className = "badge"; b.textContent = "x" + it.owned;
        ic.appendChild(b);
      }
      const info = document.createElement("div");
      info.className = "info";
      const title = document.createElement("div");
      title.className = "title"; title.textContent = it.title;
      const desc = document.createElement("div");
      desc.className = "desc"; desc.textContent = it.desc;
      const cost = document.createElement("div");
      cost.className = "cost"; cost.textContent = formatCost(it.cost);
      info.append(title, desc, cost);
      row.append(ic, info);

      // primary button
      const btn = document.createElement("button");
      btn.textContent = it.disabled ? "—" : (it.owned > 0 ? "Kur" : "Al");
      btn.disabled = !!it.disabled || !canAfford(it.cost);
      btn.onclick = () => {
        if (it.disabled) return;
        if (!canAfford(it.cost)) { toast("Yetersiz kaynak"); return; }
        pay(it.cost);
        it.buy();
        saveGame();
        if (!placeMode) openShop(stationId);
      };
      row.append(btn);

      if (it.extra) {
        const eb = document.createElement("button");
        eb.textContent = it.extra.label;
        if (it.extra.cls) eb.className = it.extra.cls;
        eb.onclick = () => { it.extra.action(); };
        row.append(eb);
      }

      ui.shopBody.append(row);
    }
    ui.shop.classList.remove("hidden");
  }
  function formatCost(c) {
    const parts = [];
    if (c.money) parts.push("$" + c.money);
    if (c.wood) parts.push("🪵 " + c.wood);
    if (c.meat) parts.push("🥩 " + c.meat);
    return parts.length ? "Maliyet: " + parts.join("  ") : "Bedava";
  }
  function canAfford(c) {
    if (c.money && player.money < c.money) return false;
    if (c.wood && player.wood < c.wood) return false;
    if (c.meat && player.meat < c.meat) return false;
    return true;
  }
  function pay(c) {
    if (c.money) player.money -= c.money;
    if (c.wood) player.wood -= c.wood;
    if (c.meat) player.meat -= c.meat;
  }
  ui.shopClose.addEventListener("click", () => ui.shop.classList.add("hidden"));
  ui.placeCancel.addEventListener("click", () => cancelPlaceMode());

  // ---------- Game over / respawn ----------
  function gameOver() {
    if (!running) return;
    running = false;
    
    // Add to leaderboard
    lobbyState.leaderboard.push({ name: lobbyState.nickname, score: player.score });
    lobbyState.leaderboard.sort((a, b) => b.score - a.score);
    if (lobbyState.leaderboard.length > 10) lobbyState.leaderboard = lobbyState.leaderboard.slice(0, 10);
    
    saveGame();
    initLobby(); // refresh UI
    
    ui.start.classList.remove("hidden");
    ui.start.querySelector("h1").textContent = base.hp <= 0 ? "Üs düştü!" : "Eyvah, can bitti!";
    ui.btnStart.textContent = "Devam Et";
  }

  function respawn() {
    // Keep persistent fields, reset runtime entities
    player.x = 0; player.y = 80;
    player.hp = player.maxHp;
    player.invuln = 1.5;
    base.hp = base.maxHp;
    enemies.length = 0;
    drops.length = 0;
    customers.length = 0;
    particles.length = 0;
    swings.length = 0;
    projectiles.length = 0;
    timeAlive = 0;
    waveNumber = 1;
    waveTimer = GRACE_TIME;
    waveEnemiesToSpawn = 0;
    waveState = "waiting";
    player.score = 0;
    spawnTimer = 0;
  }

  // ---------- Input ----------
  const joyState = { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0, R: 55 };
  function joyStart(e) {
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    const rect = ui.joy.getBoundingClientRect();
    joyState.cx = rect.left + rect.width / 2;
    joyState.cy = rect.top + rect.height / 2;
    joyState.active = true;
    joyState.id = e.touches ? e.touches[0].identifier : null;
    joyMove(e);
  }
  function joyMove(e) {
    if (!joyState.active) return;
    e.preventDefault();
    let t;
    if (e.touches) {
      for (const tt of e.touches) if (tt.identifier === joyState.id) { t = tt; break; }
      if (!t) return;
    } else { t = e; }
    let dx = t.clientX - joyState.cx, dy = t.clientY - joyState.cy;
    const len = Math.hypot(dx, dy);
    if (len > joyState.R) { dx = dx / len * joyState.R; dy = dy / len * joyState.R; }
    joyState.x = dx; joyState.y = dy;
    ui.stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    input.moveX = dx / joyState.R; input.moveY = dy / joyState.R;
  }
  function joyEnd(e) {
    if (!joyState.active) return;
    if (e.touches && [...e.touches].some(t => t.identifier === joyState.id)) return;
    joyState.active = false; joyState.id = null;
    ui.stick.style.transform = "translate(-50%, -50%)";
    input.moveX = 0; input.moveY = 0;
  }
  ui.joy.addEventListener("touchstart", joyStart, { passive: false });
  window.addEventListener("touchmove", joyMove, { passive: false });
  window.addEventListener("touchend", joyEnd);
  window.addEventListener("touchcancel", joyEnd);
  ui.joy.addEventListener("mousedown", joyStart);
  window.addEventListener("mousemove", e => { if (joyState.active) joyMove(e); });
  window.addEventListener("mouseup", joyEnd);

  function actStart(e) { e.preventDefault(); input.actionPressed = true; input.actionHeld = true; }
  function actEnd() { input.actionHeld = false; }
  ui.btnAction.addEventListener("touchstart", actStart, { passive: false });
  ui.btnAction.addEventListener("touchend", actEnd);
  ui.btnAction.addEventListener("mousedown", actStart);
  window.addEventListener("mouseup", actEnd);

  // Canvas pointer for placement / ghost preview
  function isInteractiveTarget(t) {
    if (!t) return false;
    return ui.joy.contains(t) || ui.btnAction.contains(t) || ui.shop.contains(t) || 
           ui.placeBar.contains(t) || ui.start.contains(t) ||
           ui.btnPause.contains(t) || ui.pauseMenu.contains(t);
  }
  function canvasPointerMove(e) {
    if (!placeMode) return;
    const t = e.touches ? e.touches[0] : e;
    if (!t) return;
    const wp = screenToWorld(t.clientX, t.clientY);
    placeMode.ghostWX = wp.x;
    placeMode.ghostWY = wp.y;
  }
  function canvasPointerDown(e) {
    if (isInteractiveTarget(e.target)) return;
    
    const t = e.touches ? e.touches[0] : e;
    const wp = screenToWorld(t.clientX, t.clientY);

    if (placeMode) {
      e.preventDefault();
      placeMode.ghostWX = wp.x;
      placeMode.ghostWY = wp.y;
      tryPlaceAt(wp.x, wp.y);
      return;
    }
    
    // Move tower
    let clickedTower = null;
    let clickedIndex = -1;
    for (let i = 0; i < weapons.placed.length; i++) {
      const tw = weapons.placed[i];
      if (dist(wp.x, wp.y, tw.x, tw.y) < 50) {
        clickedTower = tw;
        clickedIndex = i;
        break;
      }
    }
    
    if (clickedTower) {
      e.preventDefault();
      weapons.placed.splice(clickedIndex, 1);
      startPlaceMode(clickedTower.type, clickedTower);
    }
  }

  canvas.addEventListener("mousemove", canvasPointerMove);
  canvas.addEventListener("touchmove", canvasPointerMove, { passive: false });
  canvas.addEventListener("mousedown", canvasPointerDown);
  canvas.addEventListener("touchstart", canvasPointerDown, { passive: false });

  const keys = {};
  window.addEventListener("keydown", e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === " ") { input.actionPressed = true; input.actionHeld = true; }
    if (e.key === "Escape") { 
      if (!ui.shop.classList.contains("hidden")) {
        ui.shop.classList.add("hidden");
      } else if (placeMode) {
        cancelPlaceMode();
      } else {
        togglePause();
      }
    }
    updateKeyboardMove();
  });
  window.addEventListener("keyup", e => {
    keys[e.key.toLowerCase()] = false;
    if (e.key === " ") input.actionHeld = false;
    updateKeyboardMove();
  });
  function updateKeyboardMove() {
    if (joyState.active) return;
    let x = 0, y = 0;
    if (keys["w"] || keys["arrowup"]) y -= 1;
    if (keys["s"] || keys["arrowdown"]) y += 1;
    if (keys["a"] || keys["arrowleft"]) x -= 1;
    if (keys["d"] || keys["arrowright"]) x += 1;
    input.moveX = x; input.moveY = y;
  }

  // ---------- Start / Reset ----------
  function startGame() {
    lobbyState.nickname = ui.inputNickname.value || "Oyuncu";
    const hadSave = !!loadGame();
    if (hadSave && player.hp <= 0) {
      respawn();
    } else {
      initWorld(true);
    }
    running = true;
    last = performance.now();
    ui.start.classList.add("hidden");
    saveGame(); // save nickname etc.
    toast("Oyun başladı");
  }

  function togglePause() {
    if (!running) return;
    isPaused = !isPaused;
    if (isPaused) {
      ui.pauseMenu.classList.remove("hidden");
    } else {
      ui.pauseMenu.classList.add("hidden");
      last = performance.now(); // prevent large dt after pause
    }
  }

  ui.btnPause.addEventListener("click", togglePause);
  ui.btnResume.addEventListener("click", togglePause);
  ui.btnSettings.addEventListener("click", () => {
    toast("Ayarlar menüsü yakında eklenecek!");
  });
  ui.btnToLobby.addEventListener("click", () => {
    running = false;
    isPaused = false;
    ui.pauseMenu.classList.add("hidden");
    saveGame();
    initLobby();
    ui.start.classList.remove("hidden");
    ui.start.querySelector("h1").textContent = "Arctic Survivor";
    ui.btnStart.textContent = "Devam Et";
  });

  ui.btnStart.addEventListener("click", startGame);
  ui.btnReset.addEventListener("click", () => {
    if (!confirm("Tüm ilerleme silinsin mi?")) return;
    resetSave();
    initWorld(false);
    lobbyState.leaderboard = [];
    lobbyState.ownedSkins = ["default"];
    lobbyState.selectedSkin = "default";
    lobbyState.nickname = "Oyuncu";
    lobbyState.skinIndex = 0;
    initLobby();
    toast("İlerleme sıfırlandı");
  });

  function renderLobbySkin() {
    const sk = SKINS[lobbyState.skinIndex];
    ui.skinIcon.textContent = sk.icon;
    ui.skinName.textContent = sk.name;
    const isOwned = lobbyState.ownedSkins.includes(sk.id);
    const isSelected = lobbyState.selectedSkin === sk.id;
    
    if (isOwned) {
      ui.skinPrice.textContent = "Sahipsin";
      ui.btnBuySkin.classList.add("hidden");
      if (isSelected) {
        ui.btnSelectSkin.classList.add("hidden");
        ui.skinPrice.textContent = "Seçili";
      } else {
        ui.btnSelectSkin.classList.remove("hidden");
      }
    } else {
      ui.skinPrice.textContent = `$${sk.price}`;
      ui.btnBuySkin.classList.remove("hidden");
      ui.btnSelectSkin.classList.add("hidden");
    }
  }

  ui.skinPrev.addEventListener("click", () => {
    lobbyState.skinIndex = (lobbyState.skinIndex - 1 + SKINS.length) % SKINS.length;
    renderLobbySkin();
  });
  ui.skinNext.addEventListener("click", () => {
    lobbyState.skinIndex = (lobbyState.skinIndex + 1) % SKINS.length;
    renderLobbySkin();
  });
  ui.btnBuySkin.addEventListener("click", () => {
    const sk = SKINS[lobbyState.skinIndex];
    if (player.money >= sk.price) {
      player.money -= sk.price;
      lobbyState.ownedSkins.push(sk.id);
      lobbyState.selectedSkin = sk.id;
      saveGame();
      renderLobbySkin();
      toast("Kostüm alındı!");
    } else {
      toast("Para yetersiz!");
    }
  });
  ui.btnSelectSkin.addEventListener("click", () => {
    const sk = SKINS[lobbyState.skinIndex];
    lobbyState.selectedSkin = sk.id;
    saveGame();
    renderLobbySkin();
  });

  function initLobby() {
    ui.inputNickname.value = lobbyState.nickname;
    lobbyState.skinIndex = SKINS.findIndex(sk => sk.id === lobbyState.selectedSkin) || 0;
    renderLobbySkin();
    
    ui.leaderboardList.innerHTML = "";
    if (lobbyState.leaderboard.length === 0) {
      ui.leaderboardList.innerHTML = "<li><span class='name'>Yok</span><span class='score'>-</span></li>";
    } else {
      for (const entry of lobbyState.leaderboard) {
        const li = document.createElement("li");
        li.innerHTML = `<span class='name'>${entry.name}</span><span class='score'>${entry.score}</span>`;
        ui.leaderboardList.appendChild(li);
      }
    }
  }

  initWorld(true);
})();
