// CalmAir – venstre: lyd (dB + alarm), højre: CO2 (tegnet ansigt + alarm)
// Bold League Spartan overalt. Separate mutes. Start/Stop ændrer ikke mutes.

let mic, aktiv = false, vol = 0, volSmooth = 0;

// CO2 simulering: stiger mod 1300 over ~2.75 min, derefter rolig drift 1100–1400
let co2 = 600, co2StartMillis = 0, co2DriftTarget = 1300;
const CO2_START = 600, CO2_TARGET = 1300, CO2_RISE_SECONDS = 165;

let alarmOsc = null;       // én oscillator til alarmtone
let muteLyd = false;       // mute for lyd-alarm (venstre)
let muteCO2 = false;       // mute for CO2-alarm (højre)

let muteBtnLeft = null;    // hitbox venstre "Stop/Tænd lyd"
let muteBtnRight = null;   // hitbox højre  "Stop/Tænd lyd"

function setup() {
  createCanvas(windowWidth, windowHeight);
  smooth();                // blødere kanter/tekst
  angleMode(DEGREES);
  textFont('League Spartan');
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
  mic = new p5.AudioIn();
  co2StartMillis = millis();
}

function windowResized(){ resizeCanvas(windowWidth, windowHeight); }

function draw() {
  background('#F6D466');

  // Kræv landscape
  if (height > width) {
    fill(30);
    textSize(min(width, height) * 0.05);
    text('Vend til landscape', width/2, height/2);
    return;
  }

  const topH = height * 0.7;
  const bottomH = height - topH;

  // ===== Separatorer (sort, tydelige) =====
  noStroke();
  fill(0, 200); rect(width/2 - 3, 0, 6, height); // vertikal – fuld højde
  fill(0, 160); rect(0, topH - 3, width, 6);     // horisontal

  // ===== Lyd (smooth + log-mapping) =====
  if (aktiv) vol = mic.getLevel();
  volSmooth = lerp(volSmooth, vol, 0.15);
  const dbfs = 20 * Math.log10(Math.max(volSmooth, 1e-6)); // -∞..0
  let dB = map(dbfs, -60, 0, 30, 100, true);               // 30..100

  // ===== CO2: stigning → drift =====
  const elapsed = (millis() - co2StartMillis) / 1000;
  if (elapsed <= CO2_RISE_SECONDS) {
    const t = constrain(elapsed / CO2_RISE_SECONDS, 0, 1);
    co2 = CO2_START + (CO2_TARGET - CO2_START) * t;        // lineær stigning
  } else {
    if (frameCount % 240 === 0)
      co2DriftTarget = constrain(CO2_TARGET + random(-150, 150), 1100, 1400);
    co2 = lerp(co2, co2DriftTarget, 0.01);
  }

  // ===== Venstre top: dB gauge =====
  const R = min(width/2, topH) * 0.52;         // kompakt radius
  const leftCX = width * 0.25;
  const leftCY = R + topH * 0.10;              // rykket ned så buen er i boksen
  drawGauge(leftCX, leftCY, R, dB);

  fill(255);
  textSize(R * 0.17); text('dB', leftCX, leftCY + R * 0.22);
  textSize(R * 0.18); text(int(dB) + ' dB', leftCX, leftCY + R * 0.40);

  // ===== Højre top: tegnet CO2-ansigt =====
  const rightCX = width * 0.75;
  const rightCY = topH * 0.50;
  const dia = min(width/2, topH) * 0.78;
  drawCO2Face(rightCX, rightCY, dia, co2);

  // ===== Bund: venstre Start/Stop + højre ppm =====
  drawBottomBar(topH, bottomH);

  // ===== Alarmer (hver sin side) =====
  const isLydRed = aktiv && dB > 85;   // venstre alarm (kun hvis måling kører)
  const isCO2Red = co2 >= 1200;        // højre alarm

  // Alarmtone kører hvis mindst én rød alarm ikke er mutet
  const playTone = (isLydRed && !muteLyd) || (isCO2Red && !muteCO2);
  handleAlarmSound(playTone);

  // Bannere kun på relevante sider
  drawLeftAlarmBanner(isLydRed, topH);
  drawRightAlarmBanner(isCO2Red, topH);
}

/* ---------------- Gauge (venstre) ---------------- */
function drawGauge(cx, cy, R, dB) {
  push();
  translate(cx, cy);

  const segs = ['#2EBF6B','#6CD06A','#B7DB5E','#F4D046','#F79A3A','#F04A3A'];
  const arcW = R * 0.16;
  const d = R * 2 - arcW;

  strokeWeight(arcW);
  noFill();
  strokeCap(SQUARE);

  let a0 = -180;
  for (let i = 0; i < segs.length; i++) {
    const a1 = lerp(-180, 0, (i + 1) / segs.length);
    stroke(segs[i]);
    arc(0, 0, d, d, a0, a1);
    a0 = a1;
  }

  // Viser
  const theta = map(dB, 30, 100, -180, 0, true);
  stroke(0);
  strokeCap(ROUND);
  strokeWeight(arcW * 0.35);
  const L = R - arcW * 0.9;
  line(0, 0, L * cos(theta), L * sin(theta));
  noStroke();
  fill(0);
  circle(0, 0, arcW * 0.8);
  pop();
}

/* ---------------- Tegnet CO2-ansigt (højre) ---------------- */
function drawCO2Face(cx, cy, dia, ppm) {
  // Farve
  let faceCol = '#22A95B';         // grøn
  if (ppm >= 800 && ppm < 1200) faceCol = '#F7D84D';  // gul
  if (ppm >= 1200)             faceCol = '#F46B5E';  // rød

  // Geometri
  const eyeR = dia * 0.10;
  const eyeOffX = dia * 0.22;
  const eyeOffY = dia * 0.18;

  push();
  translate(cx, cy);

  // Ansigt
  stroke(0);
  strokeWeight(dia * 0.06);
  fill(faceCol);
  circle(0, 0, dia);

  // Øjne
  noStroke();
  fill(0);
  circle(-eyeOffX, -eyeOffY, eyeR);
  circle( +eyeOffX, -eyeOffY, eyeR);

  // Mund / Bryn efter niveau
  if (ppm < 800) {
    // smil (opad bue)
    noFill(); stroke(0); strokeWeight(dia * 0.06);
    arc(0, dia * 0.05, dia * 0.45, dia * 0.28, 20, 160);
  } else if (ppm < 1200) {
    // flad mund (vandret streg)
    stroke(0); strokeWeight(dia * 0.06);
    const mw = dia * 0.38, my = dia * 0.12;
    line(-mw/2, my, mw/2, my);
  } else {
    // trist/sur: nedadbue + skrå bryn
    noFill(); stroke(0); strokeWeight(dia * 0.06);
    arc(0, dia * 0.22, dia * 0.45, dia * 0.28, 200, 340);
    const browLen = dia * 0.28;
    const by = -eyeOffY - eyeR*0.9;
    stroke(0); strokeWeight(dia * 0.045);
    // venstre bryn
    line(-eyeOffX - browLen*0.5, by - browLen*0.10,
         -eyeOffX + browLen*0.2,  by + browLen*0.10);
    // højre bryn
    line( eyeOffX + browLen*0.5,  by - browLen*0.10,
          eyeOffX - browLen*0.2,  by + browLen*0.10);
  }

  pop();
}

/* ---------------- Bundbar (Start/Stop + ppm) ---------------- */
function drawBottomBar(topH, h) {
  // Venstre: Start/Stop
  if (aktiv) {
    const pulse = 0.75 + 0.25 * (sin(frameCount * 0.4) * 0.5 + 0.5);
    fill(244, 67, 54);                 // rød
    rect(0, topH, width/2, h);
    // lys puls-overlay øverst
    fill(255, 255 * (pulse - 0.75));
    rect(0, topH, width/2, h * 0.18);
  } else {
    fill('#22A95B');                   // grøn
    rect(0, topH, width/2, h);
  }

  // Højre: ppm
  fill('#22A95B');
  rect(width/2, topH, width/2, h);

  // Labels
  fill(255);
  textStyle(BOLD);
  textSize(h * 0.58);
  text(aktiv ? 'Stop' : 'Start', width * 0.25, topH + h/2);
  text(int(co2) + ' ppm',        width * 0.75, topH + h/2);
}

/* ---------------- Venstre alarm-banner (LYD) ---------------- */
function drawLeftAlarmBanner(active, topH) {
  muteBtnLeft = null;
  if (!active) return;

  const x = 0, w = width/2;
  const y = topH * 0.02, bh = topH * 0.16;
  const pulse = 0.65 + 0.35 * (sin(frameCount * 0.6) * 0.5 + 0.5);

  noStroke(); fill(244, 67, 54, 255 * pulse); rect(x, y, w, bh);
  noFill();  stroke(255, 235, 59); strokeWeight(4); rect(x+2, y+2, w-4, bh-4);

  noStroke(); fill(255); textSize(bh * 0.45);
  text('ALARM – LYD for høj', x + w/2, y + bh/2);

  // "Stop/Tænd lyd" knap (toggle muteLyd)
  const btnW = w * 0.44, btnH = bh * 0.55;
  const btnX = x + w * 0.04, btnY = y + bh + topH * 0.02;
  noStroke(); fill(255); rect(btnX, btnY, btnW, btnH, 12);
  fill(244, 67, 54); textSize(btnH * 0.55);
  text(muteLyd ? 'Tænd lyd' : 'Stop lyd', btnX + btnW/2, btnY + btnH/2);
  muteBtnLeft = {x: btnX, y: btnY, w: btnW, h: btnH};
}

/* ---------------- Højre alarm-banner (CO2) ---------------- */
function drawRightAlarmBanner(active, topH) {
  muteBtnRight = null;
  if (!active) return;

  const w = width/2, x = width/2;
  const y = topH * 0.02, bh = topH * 0.16;
  const pulse = 0.65 + 0.35 * (sin(frameCount * 0.6) * 0.5 + 0.5);

  noStroke(); fill(244, 67, 54, 255 * pulse); rect(x, y, w, bh);
  noFill();  stroke(255, 235, 59); strokeWeight(4); rect(x+2, y+2, w-4, bh-4);

  noStroke(); fill(255); textSize(bh * 0.45);
  text('ALARM – CO₂ for høj', x + w/2, y + bh/2);

  // "Stop/Tænd lyd" knap (toggle muteCO2)
  const btnW = w * 0.44, btnH = bh * 0.55;
  const btnX = x + w * 0.52, btnY = y + bh + topH * 0.02;
  noStroke(); fill(255); rect(btnX, btnY, btnW, btnH, 12);
  fill(244, 67, 54); textSize(btnH * 0.55);
  text(muteCO2 ? 'Tænd lyd' : 'Stop lyd', btnX + btnW/2, btnY + btnH/2);
  muteBtnRight = {x: btnX, y: btnY, w: btnW, h: btnH};
}

/* ---------------- Alarmtone (kontinuerlig) ---------------- */
function handleAlarmSound(play) {
  if (play) {
    if (!alarmOsc) {
      alarmOsc = new p5.Oscillator('sine');
      alarmOsc.freq(880);
      alarmOsc.amp(0);
      alarmOsc.start();
    }
    alarmOsc.amp(0.18, 0.05);  // ramp op
  } else if (alarmOsc) {
    alarmOsc.amp(0, 0.1);      // ramp ned
  }
}

/* ---------------- Interaktion (klik + touch) ---------------- */
function isInRect(x, y, r){ return x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h; }

function handlePress(x, y){
  const topH = height * 0.7;

  // Venstre/højre "Stop/Tænd lyd" (mute-toggles)
  if (muteBtnLeft && isInRect(x, y, muteBtnLeft)) { muteLyd = !muteLyd; return; }
  if (muteBtnRight && isInRect(x, y, muteBtnRight)) { muteCO2 = !muteCO2; return; }

  // Bund venstre: Start/Stop måling
  if (y >= topH && x < width/2) {
    getAudioContext().resume();
    if (!aktiv) { mic.start(); aktiv = true; }
    else { mic.stop(); aktiv = false; }
    return;
  }
}

function mousePressed(){ handlePress(mouseX, mouseY); }
function touchStarted(){
  // p5 kalder ofte også mousePressed ved touch, men vi sikrer os alligevel
  getAudioContext().resume();
  if (touches && touches.length) {
    handlePress(touches[0].x, touches[0].y);
  } else {
    handlePress(mouseX, mouseY);
  }
  // return false for at forhindre dobbelte events på mobil
  return false;
}
