"use strict";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────

const keys = {}; // teclas mantenidas
const justPressed = {}; // teclas recién presionadas (un solo uso)

const GAME_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"];

window.addEventListener("keydown", (e) => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault(); // evita scroll de página
  if (!e.repeat) justPressed[e.code] = true;
  keys[e.code] = true;
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap = (v, max) => ((v % max) + max) % max;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Power-up: disparo triple ──────────────────────────────────────────────────
const TRIPLE_SHOT_DURATION = 5; // segundos de efecto
const POWERUP_MAX_FRACTION = 0.7; // el drop ocurre antes de este % de destrucciones del nivel
const POWERUP_TTL = 8; // segundos visible antes de desaparecer
const FAN_ANGLE = 0.26; // ~15° entre balas del abanico

// ── Power-up: escudo ──────────────────────────────────────────────────────────
const SHIELD_DURATION = 5; // segundos de efecto
const SHIELD_RADIUS = 22; // radio del círculo de energía
const SHIELD_SPAWN_MIN = 15; // intervalo mínimo entre apariciones (s)
const SHIELD_SPAWN_MAX = 25; // intervalo máximo entre apariciones (s)
const SHIELD_GRACE = 1; // invencibilidad breve tras absorber un golpe
const SHIELD_SAFE_DIST = 150; // distancia mínima a la nave al aparecer

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII = [0, 16, 30, 50]; // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32]; // velocidad base por tamaño
const POINTS = [0, 100, 50, 20]; // puntos por tamaño

// Forma fija (de imagen) para asteroides grandes; puntos en px de imagen 400x400
const BIG_SHAPE = [
  [189, 63],
  [267, 86],
  [251, 171],
  [331, 195],
  [308, 282],
  [238, 279],
  [205, 335],
  [108, 287],
  [62, 206],
  [83, 119],
].map(([x, y]) => [(x - 200) / 138, (y - 200) / 138]);

class Asteroid {
  constructor(x, y, size = 3) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Polígono irregular
    const n = randInt(8, 13);
    this.verts = [];
    if (size === 3 && Math.random() < 0.25) {
      // Variante grande basada en la imagen
      this.verts = BIG_SHAPE.map(([x, y]) => [x * this.radius, y * this.radius]);
    } else
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = this.radius * rand(0.6, 1.0);
        this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++) ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = W / 2;
    this.y = H / 2;
    this.angle = -Math.PI / 2;
    this.vx = 0;
    this.vy = 0;
    this.radius = 12;
    this.thrusting = false;
    this.invincible = 3;
    this.shootCooldown = 0;
    this.dead = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible > 0) this.invincible -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;

    const ROT = 3.5; // rad/s
    const THRUST = 260; // px/s²
    const DRAG = 0.987;

    if (keys["ArrowLeft"]) this.angle -= ROT * dt;
    if (keys["ArrowRight"]) this.angle += ROT * dt;

    this.thrusting = !!keys["ArrowUp"];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    if (tripleShotTimer > 0) {
      return [-FAN_ANGLE, 0, FAN_ANGLE].map((d) => new Bullet(ox, oy, this.angle + d));
    }
    return [new Bullet(ox, oy, this.angle)];
  }

  drawShield() {
    if (shieldTimer <= 0) return;
    // Parpadeo rápido en el último segundo y medio
    if (shieldTimer < 1.5 && Math.floor(shieldTimer * 8) % 2 === 0) return;
    const pulse = 0.55 + 0.25 * Math.sin(performance.now() / 120);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = `rgba(102, 255, 102, ${pulse.toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, SHIELD_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  draw() {
    if (this.dead) return;
    this.drawShield();
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo(20, 0); // nariz
    ctx.lineTo(-12, -9); // ala izquierda
    ctx.lineTo(-7, 0); // muesca trasera
    ctx.lineTo(-12, 9); // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, 14), 0);
      ctx.lineTo(-8, 4);
      ctx.strokeStyle = "rgba(255, 130, 0, 0.85)";
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── PowerUp (ítem recolectable) ───────────────────────────────────────────────
const POWERUP_STYLES = {
  triple: { color: "#0ff", label: "3" },
  shield: { color: "#6f6", label: "S" },
};

class PowerUp {
  constructor(x, y, kind = "triple") {
    this.x = x;
    this.y = y;
    this.kind = kind;
    const angle = rand(0, Math.PI * 2);
    this.vx = Math.cos(angle) * 20;
    this.vy = Math.sin(angle) * 20;
    this.radius = 10;
    this.ttl = POWERUP_TTL;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    // Parpadeo en los últimos 2 segundos
    if (this.ttl < 2 && Math.floor(this.ttl * 6) % 2 === 0) return;
    const { color, label } = POWERUP_STYLES[this.kind];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, this.x, this.y + 4.5);
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles;
let powerUp, powerUpKillTarget, levelKills, tripleShotTimer;
let shieldPickup, shieldSpawnTimer, shieldTimer;
let score, lives, level;
let state; // 'playing' | 'dead' | 'gameover'
let deadTimer;

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

// Elige al azar en qué destrucción del nivel aparece el power-up (garantiza uno por nivel).
// Un asteroide grande requiere 7 destrucciones para limpiarse (1 + 2 + 4).
function setupLevelPowerUp(count) {
  levelKills = 0;
  powerUp = null;
  powerUpKillTarget = randInt(1, Math.floor(count * 7 * POWERUP_MAX_FRACTION));
}

// Reinicia la cuenta atrás hasta la próxima aparición del escudo (≥ 15 s).
function resetShieldSpawn() {
  shieldSpawnTimer = rand(SHIELD_SPAWN_MIN, SHIELD_SPAWN_MAX);
}

function spawnShieldPickup() {
  let x, y;
  do {
    x = rand(0, W);
    y = rand(0, H);
  } while (Math.hypot(x - ship.x, y - ship.y) < SHIELD_SAFE_DIST);
  shieldPickup = new PowerUp(x, y, "shield");
}

// Mueve el ítem de escudo; si expira, arranca la espera de la siguiente aparición.
function updateShieldPickup(dt) {
  if (!shieldPickup) return;
  shieldPickup.update(dt);
  if (shieldPickup.dead) {
    shieldPickup = null;
    resetShieldSpawn();
  }
}

// Destruye un asteroide: puntos, partículas, drop de triple shot y fragmentos (en `out`).
function destroyAsteroid(a, out) {
  a.dead = true;
  score += POINTS[a.size];
  explode(a.x, a.y, a.size * 5);
  // El power-up aparece una vez por nivel, en una destrucción al azar
  levelKills++;
  if (levelKills === powerUpKillTarget) powerUp = new PowerUp(a.x, a.y);
  out.push(...a.split());
}

function initGame() {
  ship = new Ship();
  bullets = [];
  asteroids = [];
  particles = [];
  tripleShotTimer = 0;
  shieldTimer = 0;
  shieldPickup = null;
  resetShieldSpawn();
  score = 0;
  lives = 3;
  level = 1;
  state = "playing";
  spawnAsteroids(4);
  setupLevelPowerUp(4);
}

function nextLevel() {
  level++;
  bullets = [];
  particles = [];
  ship.reset();
  spawnAsteroids(3 + level);
  setupLevelPowerUp(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  tripleShotTimer = 0;
  shieldTimer = 0;
  lives--;
  if (lives <= 0) {
    state = "gameover";
  } else {
    state = "dead";
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (state === "gameover") {
    if (pressed("Space")) initGame();
    particles.forEach((p) => p.update(dt));
    particles = particles.filter((p) => !p.dead);
    return;
  }

  if (state === "dead") {
    deadTimer -= dt;
    particles.forEach((p) => p.update(dt));
    particles = particles.filter((p) => !p.dead);
    asteroids.forEach((a) => a.update(dt));
    if (powerUp) {
      powerUp.update(dt);
      if (powerUp.dead) powerUp = null;
    }
    updateShieldPickup(dt);
    if (deadTimer <= 0) {
      state = "playing";
      ship.reset();
    }
    return;
  }

  // Disparar
  if (pressed("Space")) {
    bullets.push(...ship.tryShoot());
  }

  ship.update(dt);
  bullets.forEach((b) => b.update(dt));
  asteroids.forEach((a) => a.update(dt));
  particles.forEach((p) => p.update(dt));
  tripleShotTimer = Math.max(0, tripleShotTimer - dt);
  shieldTimer = Math.max(0, shieldTimer - dt);
  if (powerUp) {
    powerUp.update(dt);
    if (powerUp.dead) powerUp = null;
  }

  // Escudo: un ítem a la vez, con espera mínima entre apariciones
  if (shieldPickup) {
    updateShieldPickup(dt);
  } else {
    shieldSpawnTimer -= dt;
    if (shieldSpawnTimer <= 0) spawnShieldPickup();
  }

  bullets = bullets.filter((b) => !b.dead);
  particles = particles.filter((p) => !p.dead);

  // Nave vs power-up
  if (powerUp && dist(ship, powerUp) < ship.radius + powerUp.radius) {
    tripleShotTimer = TRIPLE_SHOT_DURATION;
    explode(powerUp.x, powerUp.y, 6);
    powerUp = null;
  }

  // Nave vs ítem de escudo
  if (shieldPickup && dist(ship, shieldPickup) < ship.radius + shieldPickup.radius) {
    shieldTimer = SHIELD_DURATION;
    explode(shieldPickup.x, shieldPickup.y, 6);
    shieldPickup = null;
    resetShieldSpawn();
  }

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        destroyAsteroid(a, newAsteroids);
      }
    }
  }
  asteroids = asteroids.filter((a) => !a.dead).concat(newAsteroids);
  bullets = bullets.filter((b) => !b.dead);

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    const hitRadius = shieldTimer > 0 ? SHIELD_RADIUS : ship.radius;
    for (const a of asteroids) {
      if (dist(ship, a) < hitRadius + a.radius * 0.82) {
        if (shieldTimer > 0) {
          // El escudo absorbe el golpe y destruye el asteroide
          shieldTimer = 0;
          const fragments = [];
          destroyAsteroid(a, fragments);
          asteroids = asteroids.filter((x) => !x.dead).concat(fragments);
          ship.invincible = SHIELD_GRACE;
        } else {
          killShip();
        }
        break;
      }
    }
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = "#fff";
  ctx.font = "15px monospace";

  ctx.textAlign = "left";
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  let hudY = 46;
  if (tripleShotTimer > 0) {
    ctx.fillStyle = "#0ff";
    ctx.fillText(`TRIPLE  ${Math.ceil(tripleShotTimer)}s`, 14, hudY);
    hudY += 20;
  }
  if (shieldTimer > 0) {
    ctx.fillStyle = "#6f6";
    ctx.fillText(`ESCUDO  ${Math.ceil(shieldTimer)}s`, 14, hudY);
  }
  ctx.fillStyle = "#fff";

  ctx.textAlign = "center";
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++) drawLifeIcon(W - 16 - i * 22, 18);
}

function drawOverlay(title, sub) {
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 46px monospace";
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font = "18px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  particles.forEach((p) => p.draw());
  asteroids.forEach((a) => a.draw());
  bullets.forEach((b) => b.draw());
  if (powerUp) powerUp.draw();
  if (shieldPickup) shieldPickup.draw();
  ship.draw();

  drawHUD();

  if (state === "gameover")
    drawOverlay("GAME OVER", `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
