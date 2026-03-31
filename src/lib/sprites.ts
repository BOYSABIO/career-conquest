/**
 * Procedural sprite generation for the battle map.
 * All sprites are drawn programmatically as stick figures on offscreen canvases,
 * then converted to textures for PixiJS.
 */

export interface SpriteFrames {
  frames: HTMLCanvasElement[];
  width: number;
  height: number;
}

const SPRITE_SCALE = 1;

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = w * SPRITE_SCALE;
  canvas.height = h * SPRITE_SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  return [canvas, ctx];
}

function drawStickFigure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  armAngle: number,
  legSpread: number,
  color: string = "#2c1810",
  size: number = 1
) {
  const s = 8 * size;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5 * size;
  ctx.lineCap = "round";

  // Head
  ctx.beginPath();
  ctx.arc(x, y - s * 1.8, s * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.45);
  ctx.lineTo(x, y - s * 0.5);
  ctx.stroke();

  // Arms
  ctx.beginPath();
  ctx.moveTo(x - s * 0.6 * Math.cos(armAngle), y - s * 1.1 - s * 0.4 * Math.sin(armAngle));
  ctx.lineTo(x, y - s * 1.2);
  ctx.lineTo(x + s * 0.6 * Math.cos(armAngle), y - s * 1.1 + s * 0.4 * Math.sin(armAngle));
  ctx.stroke();

  // Legs
  ctx.beginPath();
  ctx.moveTo(x - s * 0.4 * legSpread, y);
  ctx.lineTo(x, y - s * 0.5);
  ctx.lineTo(x + s * 0.4 * legSpread, y);
  ctx.stroke();
}

export function generateMarchingFrames(): SpriteFrames {
  const w = 20, h = 26;
  const frames: HTMLCanvasElement[] = [];

  for (let i = 0; i < 6; i++) {
    const [canvas, ctx] = createCanvas(w, h);
    const phase = (i / 6) * Math.PI * 2;

    // Body bob: peaks at mid-stride (when legs pass each other)
    const bobY = -Math.abs(Math.sin(phase)) * 2;

    // Legs alternate: one forward, one back
    const leftLegAngle = Math.sin(phase) * 0.5;
    const rightLegAngle = -Math.sin(phase) * 0.5;

    // Arms swing opposite to legs
    const leftArmSwing = -Math.sin(phase) * 0.6;
    const rightArmSwing = Math.sin(phase) * 0.6;

    const cx = w / 2;
    const baseY = h - 2 + bobY;
    const s = 8;

    ctx.strokeStyle = "#2c1810";
    ctx.fillStyle = "#2c1810";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";

    // Head (bobs with body)
    ctx.beginPath();
    ctx.arc(cx, baseY - s * 1.8, s * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.moveTo(cx, baseY - s * 1.45);
    ctx.lineTo(cx, baseY - s * 0.5);
    ctx.stroke();

    // Left arm
    ctx.beginPath();
    ctx.moveTo(cx, baseY - s * 1.2);
    ctx.lineTo(cx - s * 0.5 * Math.cos(leftArmSwing + 0.3), baseY - s * 0.8 + s * 0.4 * Math.sin(leftArmSwing));
    ctx.stroke();

    // Right arm (holds spear)
    ctx.beginPath();
    ctx.moveTo(cx, baseY - s * 1.2);
    ctx.lineTo(cx + s * 0.5 * Math.cos(rightArmSwing + 0.3), baseY - s * 0.8 + s * 0.4 * Math.sin(rightArmSwing));
    ctx.stroke();

    // Left leg
    const leftFootX = cx + s * 0.45 * Math.sin(leftLegAngle);
    const leftFootY = h - 2;
    ctx.beginPath();
    ctx.moveTo(cx, baseY - s * 0.5);
    ctx.lineTo(leftFootX, leftFootY);
    ctx.stroke();

    // Right leg
    const rightFootX = cx + s * 0.45 * Math.sin(rightLegAngle);
    const rightFootY = h - 2;
    ctx.beginPath();
    ctx.moveTo(cx, baseY - s * 0.5);
    ctx.lineTo(rightFootX, rightFootY);
    ctx.stroke();

    // Spear (held by right hand, bobs with body)
    const spearHandX = cx + s * 0.5 * Math.cos(rightArmSwing + 0.3);
    const spearHandY = baseY - s * 0.8 + s * 0.4 * Math.sin(rightArmSwing);
    ctx.strokeStyle = "#2c1810";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(spearHandX, spearHandY);
    ctx.lineTo(spearHandX, spearHandY - 14);
    ctx.stroke();

    // Spear tip
    ctx.fillStyle = "#666";
    ctx.beginPath();
    ctx.moveTo(spearHandX, spearHandY - 16);
    ctx.lineTo(spearHandX - 2, spearHandY - 13);
    ctx.lineTo(spearHandX + 2, spearHandY - 13);
    ctx.closePath();
    ctx.fill();

    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}

export function generateFightingFrames(): SpriteFrames {
  const w = 22, h = 26;
  const frames: HTMLCanvasElement[] = [];

  for (let i = 0; i < 4; i++) {
    const [canvas, ctx] = createCanvas(w, h);
    const phase = (i / 4) * Math.PI * 2;

    const cx = w / 2;
    const baseY = h - 2;
    const s = 8;

    ctx.strokeStyle = "#2c1810";
    ctx.fillStyle = "#2c1810";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";

    // Head
    ctx.beginPath();
    ctx.arc(cx, baseY - s * 1.8, s * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Body — slight lean into the swing
    const lean = Math.sin(phase) * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx + lean, baseY - s * 1.45);
    ctx.lineTo(cx, baseY - s * 0.5);
    ctx.stroke();

    // Legs — wide stable stance, no walking
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.45, baseY);
    ctx.lineTo(cx, baseY - s * 0.5);
    ctx.lineTo(cx + s * 0.45, baseY);
    ctx.stroke();

    // Left arm — shield arm, held steady
    ctx.beginPath();
    ctx.moveTo(cx + lean, baseY - s * 1.2);
    ctx.lineTo(cx - s * 0.55, baseY - s * 0.9);
    ctx.stroke();

    // Shield (small rectangle on left arm)
    ctx.fillStyle = "#8B6914";
    ctx.fillRect(cx - s * 0.7, baseY - s * 1.1, s * 0.35, s * 0.5);
    ctx.fillStyle = "#2c1810";

    // Right arm — swinging weapon
    const swingAngle = Math.sin(phase) * 1.2;
    const handX = cx + lean + s * 0.6 * Math.cos(swingAngle - 0.3);
    const handY = baseY - s * 1.2 + s * 0.5 * Math.sin(swingAngle);
    ctx.beginPath();
    ctx.moveTo(cx + lean, baseY - s * 1.2);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    // Sword from hand
    const swordLen = 10;
    const swordAngle = swingAngle - 0.8;
    const swordTipX = handX + swordLen * Math.cos(swordAngle);
    const swordTipY = handY - swordLen * Math.sin(swordAngle);
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(swordTipX, swordTipY);
    ctx.stroke();

    // Swing trail on the attack frame
    if (i === 1 || i === 2) {
      ctx.strokeStyle = "rgba(200, 200, 200, 0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(handX, handY, swordLen * 0.8, -swordAngle - 0.5, -swordAngle + 0.5);
      ctx.stroke();
    }

    ctx.strokeStyle = "#2c1810";
    ctx.lineWidth = 1.5;
    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}

export function generateFallenFrames(): SpriteFrames {
  const w = 24, h = 12;
  const [canvas, ctx] = createCanvas(w, h);

  ctx.strokeStyle = "#5c3020";
  ctx.fillStyle = "#5c3020";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.6;

  // Fallen figure lying on ground
  // Head
  ctx.beginPath();
  ctx.arc(4, 6, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Body (horizontal)
  ctx.beginPath();
  ctx.moveTo(6, 6);
  ctx.lineTo(16, 7);
  ctx.stroke();

  // Arms splayed
  ctx.beginPath();
  ctx.moveTo(9, 6);
  ctx.lineTo(8, 3);
  ctx.moveTo(11, 7);
  ctx.lineTo(13, 4);
  ctx.stroke();

  // Legs
  ctx.beginPath();
  ctx.moveTo(16, 7);
  ctx.lineTo(20, 5);
  ctx.moveTo(16, 7);
  ctx.lineTo(20, 9);
  ctx.stroke();

  // X eyes
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(3, 5);
  ctx.lineTo(5, 7);
  ctx.moveTo(5, 5);
  ctx.lineTo(3, 7);
  ctx.stroke();

  return { frames: [canvas], width: w, height: h };
}

export function generateSiegeClimberFrames(): SpriteFrames {
  const w = 16, h = 30;
  const frames: HTMLCanvasElement[] = [];

  for (let i = 0; i < 4; i++) {
    const [canvas, ctx] = createCanvas(w, h);
    const phase = (i / 4) * Math.PI * 2;

    // Ladder
    ctx.strokeStyle = "#8B6914";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(4, h);
    ctx.moveTo(12, 0);
    ctx.lineTo(12, h);
    ctx.stroke();

    // Rungs
    ctx.lineWidth = 1;
    for (let r = 4; r < h; r += 5) {
      ctx.beginPath();
      ctx.moveTo(4, r);
      ctx.lineTo(12, r);
      ctx.stroke();
    }

    // Climber
    const climbY = 8 + 3 * Math.sin(phase);
    drawStickFigure(ctx, 8, climbY + 12, 1.2 + 0.3 * Math.sin(phase), 0.3, "#2c1810", 0.8);

    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}

export function generateCatapultFrames(): SpriteFrames {
  const w = 40, h = 30;
  const frames: HTMLCanvasElement[] = [];

  for (let i = 0; i < 6; i++) {
    const [canvas, ctx] = createCanvas(w, h);
    const armAngle = i < 3 ? (i / 3) * -Math.PI * 0.6 : (-Math.PI * 0.6);

    // Base/wheels
    ctx.fillStyle = "#6B4226";
    ctx.strokeStyle = "#4a2e18";
    ctx.lineWidth = 2;

    // Platform
    ctx.fillRect(5, h - 10, 30, 4);

    // Wheels
    ctx.beginPath();
    ctx.arc(10, h - 4, 4, 0, Math.PI * 2);
    ctx.arc(30, h - 4, 4, 0, Math.PI * 2);
    ctx.stroke();

    // Upright
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, h - 10);
    ctx.lineTo(20, h - 22);
    ctx.stroke();

    // Arm
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(20, h - 20);
    ctx.rotate(armAngle);
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(15, 0);
    ctx.stroke();

    // Projectile (only in early frames)
    if (i < 3) {
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.arc(15, -2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Projectile in flight (later frames)
    if (i >= 3 && i < 6) {
      const t = (i - 3) / 3;
      const px = 30 + t * 10;
      const py = (h - 24) - t * 15 + t * t * 10;
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.arc(px, Math.max(0, py), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}

/**
 * Battering ram + two full-scale troops (same stick size as marching: s=8, h=26).
 * Ram drawn between walkers; troops use marching-like bob and stride.
 */
export function generateBatteringRamFrames(): SpriteFrames {
  const w = 100,
    h = 26;
  const frames: HTMLCanvasElement[] = [];
  const groundY = h - 2;

  for (let i = 0; i < 6; i++) {
    const [canvas, ctx] = createCanvas(w, h);
    const phase = (i / 6) * Math.PI * 2;
    const roll = phase * 1.2;

    const leftPhase = phase;
    const rightPhase = phase + Math.PI;
    const bobL = -Math.abs(Math.sin(leftPhase)) * 2;
    const bobR = -Math.abs(Math.sin(rightPhase)) * 2;
    const legL = 0.35 + 0.35 * Math.sin(leftPhase);
    const legR = 0.35 + 0.35 * Math.sin(rightPhase);
    const armL = Math.sin(leftPhase) * 0.6;
    const armR = Math.sin(rightPhase) * 0.6;

    const swing = Math.sin(phase) * 1.2;

    // --- Ram (center, behind troops) ---
    const wheelR = 3.5;
    const wl = 40;
    const wr = 60;
    const wheelY = groundY - wheelR;

    ctx.strokeStyle = "#4a3018";
    ctx.lineWidth = 1.2;
    for (const wx of [wl, wr]) {
      ctx.beginPath();
      ctx.arc(wx, wheelY, wheelR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 0.65;
      for (let sp = 0; sp < 4; sp++) {
        const a = roll + (sp / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(wx, wheelY);
        ctx.lineTo(wx + Math.cos(a) * (wheelR - 0.5), wheelY + Math.sin(a) * (wheelR - 0.5));
        ctx.stroke();
      }
      ctx.lineWidth = 1.2;
    }

    ctx.fillStyle = "#6b4a28";
    ctx.strokeStyle = "#3d2810";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(34, wheelY - 9, 32, 5, 1);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#4a2810";
    ctx.strokeStyle = "#2a1408";
    ctx.beginPath();
    ctx.roundRect(36 + swing * 0.25, wheelY - 15, 28, 6, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#777";
    ctx.fillRect(42 + swing * 0.25, wheelY - 15, 2, 6);
    ctx.fillRect(54 + swing * 0.25, wheelY - 15, 2, 6);

    ctx.fillStyle = "#b0b0b0";
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(62 + swing, wheelY - 16);
    ctx.lineTo(74 + swing, wheelY - 12);
    ctx.lineTo(62 + swing, wheelY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Ropes to hands (after figures for clarity — draw now under troops? Actually under)
    ctx.strokeStyle = "rgba(55, 40, 25, 0.75)";
    ctx.lineWidth = 0.85;
    ctx.setLineDash([2, 1]);
    ctx.beginPath();
    ctx.moveTo(38 + swing * 0.25, wheelY - 11);
    ctx.lineTo(14, groundY - 10 + bobL);
    ctx.moveTo(62 + swing * 0.25, wheelY - 11);
    ctx.lineTo(w - 14, groundY - 10 + bobR);
    ctx.stroke();
    ctx.setLineDash([]);

    // --- Two troops: full scale (size 1 = same as marching stick figures) ---
    const lx = 10;
    const rx = w - 10;
    drawStickFigure(ctx, lx, groundY + bobL, armL + 0.25, legL, "#2c1810", 1);
    drawStickFigure(ctx, rx, groundY + bobR, armR - 0.25, legR, "#2c1810", 1);

    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}

export function generateSuperSoldierFrames(): SpriteFrames {
  const w = 24, h = 32;
  const frames: HTMLCanvasElement[] = [];

  for (let i = 0; i < 6; i++) {
    const [canvas, ctx] = createCanvas(w, h);
    const phase = (i / 6) * Math.PI * 2;

    const cx = w / 2;
    const baseY = h - 2;
    const s = 10; // Larger than normal soldiers (8)

    // Body bob
    const bobY = -Math.abs(Math.sin(phase)) * 2;

    ctx.strokeStyle = "#1a0e05";
    ctx.fillStyle = "#1a0e05";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    // Helmet (larger head with plume)
    ctx.fillStyle = "#666";
    ctx.beginPath();
    ctx.arc(cx, baseY + bobY - s * 1.85, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    // Helmet plume
    ctx.fillStyle = "#b22222";
    ctx.beginPath();
    ctx.ellipse(cx, baseY + bobY - s * 2.3, 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Face visor slit
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 2, baseY + bobY - s * 1.85);
    ctx.lineTo(cx + 2, baseY + bobY - s * 1.85);
    ctx.stroke();

    ctx.strokeStyle = "#1a0e05";
    ctx.lineWidth = 2;

    // Body (thicker — armored)
    ctx.beginPath();
    ctx.moveTo(cx, baseY + bobY - s * 1.45);
    ctx.lineTo(cx, baseY + bobY - s * 0.5);
    ctx.stroke();
    // Shoulder armor
    ctx.fillStyle = "#555";
    ctx.fillRect(cx - s * 0.5, baseY + bobY - s * 1.35, s, s * 0.25);

    ctx.fillStyle = "#1a0e05";
    ctx.strokeStyle = "#1a0e05";

    // Legs — marching
    const leftLeg = Math.sin(phase) * 0.5;
    const rightLeg = -Math.sin(phase) * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.4 * Math.sin(leftLeg), baseY);
    ctx.lineTo(cx, baseY + bobY - s * 0.5);
    ctx.lineTo(cx + s * 0.4 * Math.sin(rightLeg), baseY);
    ctx.stroke();

    // Left arm — holds shield
    ctx.beginPath();
    ctx.moveTo(cx, baseY + bobY - s * 1.2);
    ctx.lineTo(cx - s * 0.55, baseY + bobY - s * 0.7);
    ctx.stroke();

    // Shield (large)
    ctx.fillStyle = "#8B6914";
    ctx.strokeStyle = "#5a4010";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx - s * 0.85, baseY + bobY - s * 1.1, s * 0.55, s * 0.8, 2);
    ctx.fill();
    ctx.stroke();
    // Shield emblem
    ctx.fillStyle = "#daa520";
    ctx.beginPath();
    ctx.arc(cx - s * 0.58, baseY + bobY - s * 0.7, 2, 0, Math.PI * 2);
    ctx.fill();

    // Right arm — swinging great sword
    ctx.strokeStyle = "#1a0e05";
    ctx.lineWidth = 2;
    const swordSwing = Math.sin(phase) * 0.8;
    const handX = cx + s * 0.55 * Math.cos(swordSwing);
    const handY = baseY + bobY - s * 1.0 + s * 0.3 * Math.sin(swordSwing);
    ctx.beginPath();
    ctx.moveTo(cx, baseY + bobY - s * 1.2);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    // Great sword
    const swordLen = 14;
    const swordAngle = swordSwing - 0.6;
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(handX + swordLen * Math.cos(swordAngle), handY - swordLen * Math.sin(swordAngle));
    ctx.stroke();

    // Sword guard
    ctx.strokeStyle = "#daa520";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(handX - 2 * Math.sin(swordAngle), handY - 2 * Math.cos(swordAngle));
    ctx.lineTo(handX + 2 * Math.sin(swordAngle), handY + 2 * Math.cos(swordAngle));
    ctx.stroke();

    // Cape flowing behind
    ctx.fillStyle = "rgba(40, 80, 180, 0.5)";
    ctx.beginPath();
    ctx.moveTo(cx - 2, baseY + bobY - s * 1.35);
    ctx.lineTo(cx + 2, baseY + bobY - s * 1.35);
    ctx.lineTo(cx + 3 - Math.sin(phase) * 3, baseY + bobY - s * 0.3);
    ctx.lineTo(cx - 3 - Math.sin(phase) * 2, baseY + bobY - s * 0.4);
    ctx.closePath();
    ctx.fill();

    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}

export function generateCastleSprite(name: string, isPlayer: boolean): HTMLCanvasElement {
  const w = 80, h = 70;
  const [canvas, ctx] = createCanvas(w, h);

  const wallColor = isPlayer ? "#c4a46c" : "#8a7a6a";
  const roofColor = isPlayer ? "#8b0000" : "#444";
  const flagColor = isPlayer ? "#daa520" : "#8b0000";

  // Main keep
  ctx.fillStyle = wallColor;
  ctx.fillRect(20, 25, 40, 35);

  // Battlements
  for (let bx = 18; bx < 62; bx += 8) {
    ctx.fillRect(bx, 20, 6, 8);
  }

  // Tower left
  ctx.fillRect(10, 20, 16, 40);
  ctx.fillStyle = roofColor;
  ctx.beginPath();
  ctx.moveTo(8, 20);
  ctx.lineTo(18, 5);
  ctx.lineTo(28, 20);
  ctx.closePath();
  ctx.fill();

  // Tower right
  ctx.fillStyle = wallColor;
  ctx.fillRect(54, 20, 16, 40);
  ctx.fillStyle = roofColor;
  ctx.beginPath();
  ctx.moveTo(52, 20);
  ctx.lineTo(62, 5);
  ctx.lineTo(72, 20);
  ctx.closePath();
  ctx.fill();

  // Gate
  ctx.fillStyle = "#3a2a1a";
  ctx.beginPath();
  ctx.moveTo(32, 60);
  ctx.lineTo(32, 45);
  ctx.arc(40, 45, 8, Math.PI, 0);
  ctx.lineTo(48, 60);
  ctx.closePath();
  ctx.fill();

  // Flag
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(40, 5);
  ctx.lineTo(40, -5);
  ctx.stroke();

  ctx.fillStyle = flagColor;
  ctx.beginPath();
  ctx.moveTo(40, -5);
  ctx.lineTo(52, -1);
  ctx.lineTo(40, 3);
  ctx.closePath();
  ctx.fill();

  // Name label (supports multi-line names like "BOYSABIO's\\nKingdom")
  const lines = name.split("\n").map((line) => line.trim()).filter(Boolean);
  const displayLines = lines.length > 0 ? lines : [name];
  const longestLine = displayLines.reduce((max, line) => Math.max(max, line.length), 1);
  const fontSize = Math.max(9, Math.min(13, Math.floor(120 / longestLine)));
  const lineHeight = Math.max(9, Math.floor(fontSize * 0.92));
  const totalHeight = lineHeight * displayLines.length;
  const startY = 65 - totalHeight + lineHeight;

  ctx.fillStyle = "#2c1810";
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  ctx.textAlign = "center";
  for (let i = 0; i < displayLines.length; i++) {
    ctx.fillText(displayLines[i], 40, startY + i * lineHeight);
  }

  return canvas;
}

export function generateFortressSprite(name: string, status: string): HTMLCanvasElement {
  const w = 80, h = 65;
  const [canvas, ctx] = createCanvas(w, h);

  const isFallen = status === "fallen";
  const isSieging = status === "sieging";
  const isConquered = status === "conquered";

  // Hash the name to drive visual variation
  let nameHash = 0;
  for (let i = 0; i < name.length; i++) {
    nameHash = ((nameHash << 5) - nameHash) + name.charCodeAt(i);
    nameHash |= 0;
  }
  nameHash = Math.abs(nameHash);

  const variant = nameHash % 3; // 0=left tower, 1=center tower, 2=right tower
  const wallHeight = 20 + (nameHash % 8); // 20-27px tall walls
  const merlonCount = 4 + (nameHash % 4); // 4-7 battlements
  const pointedRoof = (nameHash % 2) === 0;

  let wallColor = "#7a6a5a";
  let flagColor = "#8b0000";
  const wallTint = (nameHash >> 3) % 3;
  if (wallTint === 1) wallColor = "#8a7a68";
  else if (wallTint === 2) wallColor = "#6e6050";

  if (isFallen) {
    wallColor = "#5a4a3a";
  } else if (isConquered) {
    wallColor = "#9a8a6a";
    flagColor = "#daa520";
  }

  ctx.globalAlpha = isFallen ? 0.5 : 1;

  // Offset fortress drawing to center in the wider canvas
  const ox = 10;
  const wallTop = 40 - wallHeight;
  const wallBottom = 40;

  // Main walls
  ctx.fillStyle = wallColor;
  ctx.fillRect(ox + 10, wallTop, 40, wallHeight);

  // Battlements (merlons along the top)
  const merlonSpacing = 40 / merlonCount;
  for (let m = 0; m < merlonCount; m++) {
    const mx = ox + 10 + m * merlonSpacing + merlonSpacing * 0.15;
    ctx.fillRect(mx, wallTop - 5, merlonSpacing * 0.6, 6);
  }

  // Tower — position varies by variant
  let towerX: number;
  if (variant === 0) towerX = ox + 10;
  else if (variant === 1) towerX = ox + 22;
  else towerX = ox + 34;

  const towerW = 16;
  const towerTop = wallTop - 12;
  ctx.fillStyle = wallColor;
  ctx.fillRect(towerX, towerTop, towerW, wallBottom - towerTop);

  // Roof — pointed or flat
  const roofColor = isFallen ? "#333" : "#555";
  ctx.fillStyle = roofColor;
  if (pointedRoof) {
    ctx.beginPath();
    ctx.moveTo(towerX - 2, towerTop);
    ctx.lineTo(towerX + towerW / 2, towerTop - 10);
    ctx.lineTo(towerX + towerW + 2, towerTop);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(towerX - 2, towerTop - 4, towerW + 4, 5);
    for (let fm = 0; fm < 3; fm++) {
      ctx.fillRect(towerX + fm * 6, towerTop - 8, 4, 5);
    }
  }

  // Gate
  ctx.fillStyle = "#2a1a0a";
  const gateX = variant === 1 ? ox + 26 : (variant === 0 ? ox + 34 : ox + 18);
  ctx.fillRect(gateX, wallBottom - 10, 8, 10);
  ctx.beginPath();
  ctx.arc(gateX + 4, wallBottom - 10, 4, Math.PI, 0);
  ctx.fill();

  // Flag on tower
  const flagPoleX = towerX + towerW / 2;
  const flagPoleTop = pointedRoof ? towerTop - 10 : towerTop - 8;
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(flagPoleX, flagPoleTop);
  ctx.lineTo(flagPoleX, flagPoleTop - 8);
  ctx.stroke();

  ctx.fillStyle = flagColor;
  ctx.beginPath();
  ctx.moveTo(flagPoleX, flagPoleTop - 8);
  ctx.lineTo(flagPoleX + 10, flagPoleTop - 5);
  ctx.lineTo(flagPoleX, flagPoleTop - 2);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;

  // Damage marks for fallen
  if (isFallen) {
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox + 15, wallTop + 2);
    ctx.lineTo(ox + 20, wallTop + wallHeight * 0.5);
    ctx.lineTo(ox + 17, wallBottom - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox + 42, wallTop + 4);
    ctx.lineTo(ox + 38, wallTop + wallHeight * 0.6);
    ctx.stroke();
  }

  // Fire glow for sieging
  if (isSieging) {
    ctx.fillStyle = "rgba(255, 100, 0, 0.3)";
    ctx.beginPath();
    ctx.arc(w / 2, wallTop + wallHeight / 2, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  // Name label — bigger and more readable
  ctx.fillStyle = isFallen ? "#5c3020" : "#2c1810";
  const fontSize = Math.max(10, Math.min(13, 100 / name.length));
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.fillText(name, w / 2, 55, 76);

  return canvas;
}

export function generateFlagBearerFrames(): SpriteFrames {
  const w = 16, h = 24;
  const frames: HTMLCanvasElement[] = [];

  for (let i = 0; i < 2; i++) {
    const [canvas, ctx] = createCanvas(w, h);

    drawStickFigure(ctx, 6, h - 2, 0.2 * (i === 0 ? 1 : -1), 0.7, "#555", 0.7);

    // Flag pole
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, h - 18);
    ctx.lineTo(10, h - 4);
    ctx.stroke();

    // Waving flag
    ctx.fillStyle = "#daa520";
    ctx.beginPath();
    ctx.moveTo(10, h - 18);
    ctx.lineTo(16, h - 16 + (i * 2));
    ctx.lineTo(10, h - 14);
    ctx.closePath();
    ctx.fill();

    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}

export function generateCelebrationFrames(): SpriteFrames {
  const w = 20, h = 24;
  const frames: HTMLCanvasElement[] = [];

  for (let i = 0; i < 2; i++) {
    const [canvas, ctx] = createCanvas(w, h);
    const armUp = i === 0 ? -0.8 : -1.2;

    drawStickFigure(ctx, w / 2, h - 2, armUp, 0.8, "#2c1810");

    // Confetti-like dots
    ctx.fillStyle = "#daa520";
    for (let j = 0; j < 4; j++) {
      const cx = 3 + Math.random() * 14;
      const cy = 2 + Math.random() * 8;
      ctx.fillRect(cx, cy, 2, 2);
    }

    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}

export function generateDragonFrames(): SpriteFrames {
  const w = 48, h = 36;
  const frames: HTMLCanvasElement[] = [];

  for (let i = 0; i < 6; i++) {
    const [canvas, ctx] = createCanvas(w, h);
    const phase = (i / 6) * Math.PI * 2;
    const wingFlap = Math.sin(phase) * 0.6;

    const cx = w / 2;
    const cy = h / 2 + 2;

    // Shadow on ground
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.beginPath();
    ctx.ellipse(cx, h - 3, 14, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body bob from wing flaps
    const bob = Math.sin(phase) * 2;

    // Tail — sinuous curve
    ctx.strokeStyle = "#8b1a1a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy + bob);
    ctx.quadraticCurveTo(
      cx - 20, cy + bob + 4 + Math.sin(phase + 1) * 3,
      cx - 24, cy + bob + 2 + Math.sin(phase + 2) * 4
    );
    ctx.stroke();
    // Tail spike
    ctx.fillStyle = "#6b0e0e";
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy + bob + 2 + Math.sin(phase + 2) * 4);
    ctx.lineTo(cx - 27, cy + bob - 1 + Math.sin(phase + 2) * 4);
    ctx.lineTo(cx - 26, cy + bob + 5 + Math.sin(phase + 2) * 4);
    ctx.closePath();
    ctx.fill();

    // Body
    ctx.fillStyle = "#a52020";
    ctx.beginPath();
    ctx.ellipse(cx - 2, cy + bob, 11, 6, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Belly scales
    ctx.fillStyle = "#c44040";
    ctx.beginPath();
    ctx.ellipse(cx - 1, cy + bob + 2, 7, 3.5, 0.1, 0, Math.PI);
    ctx.fill();

    // Wings
    ctx.fillStyle = "rgba(180, 30, 30, 0.7)";
    ctx.strokeStyle = "#6b0e0e";
    ctx.lineWidth = 1;

    // Left wing
    ctx.save();
    ctx.translate(cx - 4, cy + bob - 4);
    ctx.rotate(-0.3 + wingFlap);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -14);
    ctx.lineTo(-4, -10);
    ctx.lineTo(-14, -12);
    ctx.lineTo(-8, -6);
    ctx.lineTo(-16, -6);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Right wing
    ctx.save();
    ctx.translate(cx + 2, cy + bob - 4);
    ctx.rotate(0.3 - wingFlap);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(8, -14);
    ctx.lineTo(4, -10);
    ctx.lineTo(14, -12);
    ctx.lineTo(8, -6);
    ctx.lineTo(16, -6);
    ctx.lineTo(6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Neck
    ctx.strokeStyle = "#a52020";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + 8, cy + bob - 2);
    ctx.quadraticCurveTo(cx + 14, cy + bob - 8, cx + 16, cy + bob - 12);
    ctx.stroke();

    // Head
    ctx.fillStyle = "#8b1a1a";
    ctx.beginPath();
    ctx.ellipse(cx + 17, cy + bob - 14, 5, 4, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = "#ff6600";
    ctx.beginPath();
    ctx.arc(cx + 19, cy + bob - 15, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // Pupil
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(cx + 19.3, cy + bob - 15, 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Horns
    ctx.strokeStyle = "#4a0a0a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 15, cy + bob - 17);
    ctx.lineTo(cx + 13, cy + bob - 22);
    ctx.moveTo(cx + 18, cy + bob - 17);
    ctx.lineTo(cx + 17, cy + bob - 22);
    ctx.stroke();

    // Snout / jaw
    ctx.fillStyle = "#8b1a1a";
    ctx.beginPath();
    ctx.moveTo(cx + 22, cy + bob - 14);
    ctx.lineTo(cx + 26, cy + bob - 13);
    ctx.lineTo(cx + 22, cy + bob - 11);
    ctx.closePath();
    ctx.fill();

    // Fire breath (on attack frames)
    if (i >= 2 && i <= 4) {
      const fireIntensity = i === 3 ? 1 : 0.6;
      // Outer flame
      ctx.fillStyle = `rgba(255, 100, 0, ${0.4 * fireIntensity})`;
      ctx.beginPath();
      ctx.moveTo(cx + 26, cy + bob - 13);
      ctx.lineTo(cx + 38, cy + bob - 16 + Math.sin(phase * 3) * 2);
      ctx.lineTo(cx + 36, cy + bob - 10);
      ctx.lineTo(cx + 40, cy + bob - 12 + Math.sin(phase * 2) * 3);
      ctx.lineTo(cx + 26, cy + bob - 11);
      ctx.closePath();
      ctx.fill();
      // Inner flame (hotter)
      ctx.fillStyle = `rgba(255, 200, 50, ${0.5 * fireIntensity})`;
      ctx.beginPath();
      ctx.moveTo(cx + 26, cy + bob - 13);
      ctx.lineTo(cx + 34, cy + bob - 14);
      ctx.lineTo(cx + 33, cy + bob - 11);
      ctx.lineTo(cx + 26, cy + bob - 11);
      ctx.closePath();
      ctx.fill();
    }

    // Legs (dangling below body while flying)
    ctx.strokeStyle = "#8b1a1a";
    ctx.lineWidth = 1.5;
    const legDangle = Math.sin(phase + 0.5) * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + bob + 5);
    ctx.lineTo(cx - 6, cy + bob + 11 + legDangle);
    ctx.moveTo(cx + 3, cy + bob + 5);
    ctx.lineTo(cx + 1, cy + bob + 11 - legDangle);
    ctx.stroke();
    // Claws
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + bob + 11 + legDangle);
    ctx.lineTo(cx - 8, cy + bob + 13 + legDangle);
    ctx.moveTo(cx - 6, cy + bob + 11 + legDangle);
    ctx.lineTo(cx - 4, cy + bob + 13 + legDangle);
    ctx.moveTo(cx + 1, cy + bob + 11 - legDangle);
    ctx.lineTo(cx - 1, cy + bob + 13 - legDangle);
    ctx.moveTo(cx + 1, cy + bob + 11 - legDangle);
    ctx.lineTo(cx + 3, cy + bob + 13 - legDangle);
    ctx.stroke();

    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}

/**
 * Camp rest / sleep — side-lying pose (no duplicate fire; camp site draws the fire).
 * Gentle breathing + occasional shift reads clearly as asleep.
 */
export function generateRestingFrames(): SpriteFrames {
  const w = 30,
    h = 16;
  const frames: HTMLCanvasElement[] = [];

  for (let i = 0; i < 8; i++) {
    const [canvas, ctx] = createCanvas(w, h);
    const phase = (i / 8) * Math.PI * 2;
    const breathe = Math.sin(phase * 0.5) * 0.35;
    const sleepShift = Math.sin(phase * 0.25) * 0.4;

    const groundY = h - 2;
    const hx = 9 + sleepShift;
    const hy = groundY - 4 + breathe;

    ctx.strokeStyle = "#3a2818";
    ctx.fillStyle = "#3a2818";
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";

    // Rolled bedroll / cloak under head
    ctx.fillStyle = "rgba(90, 70, 50, 0.85)";
    ctx.beginPath();
    ctx.ellipse(hx - 2, hy + 2, 5, 2.2, -0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#3a2818";
    // Head (profile toward +x)
    ctx.beginPath();
    ctx.arc(hx, hy, 3.2, 0, Math.PI * 2);
    ctx.fill();
    // Closed eye — short line
    ctx.strokeStyle = "#2a1810";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx + 0.5, hy - 0.5);
    ctx.lineTo(hx + 2.2, hy - 0.3);
    ctx.stroke();

    ctx.strokeStyle = "#3a2818";
    ctx.lineWidth = 1.4;
    // Torso (horizontal)
    ctx.beginPath();
    ctx.moveTo(hx + 2.5, hy + 1);
    ctx.lineTo(hx + 16 + breathe * 0.2, hy + 0.5 + breathe * 0.15);
    ctx.stroke();

    // Near arm draped on body
    ctx.beginPath();
    ctx.moveTo(hx + 4, hy + 0.5);
    ctx.quadraticCurveTo(hx + 8, hy + 3, hx + 12, hy + 2);
    ctx.stroke();

    // Legs (bent, relaxed)
    ctx.beginPath();
    ctx.moveTo(hx + 15, hy + 1);
    ctx.lineTo(hx + 22, hy + 3);
    ctx.lineTo(hx + 26, groundY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx + 14, hy + 2);
    ctx.lineTo(hx + 20, hy + 4);
    ctx.lineTo(hx + 24, groundY);
    ctx.stroke();

    // Ground shadow
    ctx.fillStyle = "rgba(35, 28, 20, 0.22)";
    ctx.beginPath();
    ctx.ellipse(hx + 10, groundY + 1, 12, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}

/** Victory — hops, raised arms, small sparkles */
export function generateCelebratingFrames(): SpriteFrames {
  const w = 26,
    h = 32;
  const frames: HTMLCanvasElement[] = [];

  for (let i = 0; i < 8; i++) {
    const [canvas, ctx] = createCanvas(w, h);
    const phase = (i / 8) * Math.PI * 2;
    const cx = w / 2;
    const baseY = h - 2;
    const s = 8;
    const hop = Math.abs(Math.sin(phase)) * 4;
    const sway = Math.sin(phase * 2) * 1.5;

    ctx.strokeStyle = "#2c1810";
    ctx.fillStyle = "#2c1810";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.arc(cx + sway, baseY - s * 1.85 - hop, s * 0.36, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx + sway, baseY - s * 1.45 - hop);
    ctx.lineTo(cx + sway, baseY - s * 0.48 - hop);
    ctx.stroke();

    const cheer = Math.sin(phase) * 0.55;
    ctx.beginPath();
    ctx.moveTo(cx + sway, baseY - s * 1.25 - hop);
    ctx.lineTo(cx + sway - s * 0.85, baseY - s * 1.85 - hop - cheer * 5);
    ctx.moveTo(cx + sway, baseY - s * 1.25 - hop);
    ctx.lineTo(cx + sway + s * 0.85, baseY - s * 1.85 - hop - cheer * 5);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + sway - s * 0.35, baseY - hop);
    ctx.lineTo(cx + sway, baseY - s * 0.5 - hop);
    ctx.lineTo(cx + sway + s * 0.35, baseY - hop);
    ctx.stroke();

    for (let sp = 0; sp < 4; sp++) {
      const a = (sp / 4) * Math.PI * 2 + phase;
      const pr = 12 + sp * 3;
      ctx.fillStyle = `rgba(255, 210, 80, ${0.35 + 0.2 * Math.sin(phase + sp)})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * pr, baseY - s * 2.2 - hop + Math.sin(a) * pr * 0.3, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}

/** Wounded retreat — bandage, blood smear, heavy limp, muted palette */
export function generateRetreatingFrames(): SpriteFrames {
  const w = 22,
    h = 28;
  const frames: HTMLCanvasElement[] = [];
  const skin = "#4a3028";
  const cloth = "#3d2820";
  const blood = "rgba(120, 25, 25, 0.75)";
  const bandage = "#d4c4a8";

  for (let i = 0; i < 8; i++) {
    const [canvas, ctx] = createCanvas(w, h);
    const phase = (i / 8) * Math.PI * 2;
    const cx = w / 2;
    const baseY = h - 1;
    const s = 8;
    const lean = Math.sin(phase) * 0.22;
    const stagger = Math.sin(phase * 2) * 0.9;
    const headY = baseY - s * 1.78 + stagger;

    ctx.fillStyle = blood;
    ctx.beginPath();
    ctx.ellipse(cx + lean * 4 + 3, baseY - s * 0.3, 4, 2, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = cloth;
    ctx.fillStyle = skin;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.arc(cx + lean * 4 + stagger * 0.3, headY, s * 0.33, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = bandage;
    ctx.fillRect(cx + lean * 4 - 4 + stagger * 0.3, headY - 4, 8, 3);

    ctx.strokeStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(cx + lean * 4 + stagger * 0.3, headY + s * 0.35);
    ctx.lineTo(cx + lean * 3 + stagger, baseY - s * 0.42);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + lean * 3 + stagger, baseY - s * 1.05);
    ctx.lineTo(cx + lean * 2.2 + stagger - s * 0.5, baseY - s * 0.82);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + lean * 3 + stagger, baseY - s * 1.05);
    ctx.lineTo(cx + lean * 2.8 + stagger + s * 0.35, baseY - s * 0.88);
    ctx.stroke();

    const limp = Math.sin(phase * 2) * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + lean * 2 - s * 0.35 + limp, baseY);
    ctx.lineTo(cx + lean * 3 + stagger, baseY - s * 0.45);
    ctx.lineTo(cx + lean * 2 + s * 0.42 - limp, baseY + 1);
    ctx.stroke();

    ctx.fillStyle = blood;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(cx + lean * 2 + 2, baseY - s * 0.5);
    ctx.lineTo(cx + lean * 3 + 5, baseY - s * 0.2);
    ctx.lineTo(cx + lean * 2 + 4, baseY + 1);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}

/** Progressive camp: stakes → tent → bedrolls → fire — draw centered on anchor */
export function generateCampSiteFrames(): SpriteFrames {
  const w = 56,
    h = 40;
  const frames: HTMLCanvasElement[] = [];

  for (let fi = 0; fi < 8; fi++) {
    const [canvas, ctx] = createCanvas(w, h);
    const cx = w / 2;
    const groundY = h - 6;
    const p = (fi + 1) / 8;

    ctx.fillStyle = "rgba(45, 38, 28, 0.25)";
    ctx.beginPath();
    ctx.ellipse(cx, groundY + 2, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#5c4a32";
    ctx.lineWidth = 1.2;
    for (let s = 0; s < 4; s++) {
      const ang = (s / 4) * Math.PI * 2 + 0.2;
      const len = 4 + fi * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * 10, groundY - 2 + Math.sin(ang) * 3);
      ctx.lineTo(
        cx + Math.cos(ang) * (10 + len),
        groundY - 2 + Math.sin(ang) * 3 - len * 0.4
      );
      ctx.stroke();
    }

    if (fi >= 2) {
      ctx.fillStyle = `rgba(90, 70, 45, ${0.35 + p * 0.25})`;
      ctx.beginPath();
      ctx.moveTo(cx - 14, groundY);
      ctx.lineTo(cx, groundY - 14 - fi * 0.4);
      ctx.lineTo(cx + 14, groundY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#4a3828";
      ctx.stroke();
    }

    if (fi >= 4) {
      ctx.fillStyle = "rgba(70, 55, 38, 0.9)";
      ctx.fillRect(cx - 10, groundY - 4, 20, 5);
      ctx.strokeStyle = "#3a2818";
      ctx.strokeRect(cx - 10, groundY - 4, 20, 5);
    }

    if (fi >= 5) {
      ctx.fillStyle = "rgba(55, 45, 32, 0.85)";
      ctx.beginPath();
      ctx.ellipse(cx - 8, groundY - 2, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 8, groundY - 2, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (fi >= 6) {
      const pulse = 0.4 + Math.sin(fi * 0.8) * 0.15;
      const g = ctx.createRadialGradient(cx, groundY - 6, 0, cx, groundY - 6, 10);
      g.addColorStop(0, `rgba(255, 140, 40, ${pulse})`);
      g.addColorStop(0.6, `rgba(200, 60, 20, ${pulse * 0.5})`);
      g.addColorStop(1, "rgba(80, 30, 10, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, groundY - 6, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(60, 40, 20, 0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, groundY - 6, 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    frames.push(canvas);
  }

  return { frames, width: w, height: h };
}
