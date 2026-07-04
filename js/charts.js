const colors = {
  grid: "rgba(150,180,210,.14)",
  text: "rgba(190,205,225,.78)",
  accent: "#39d5ff",
  accent2: "#8a6cff",
  green: "#45e6a3"
};

function refreshColors() {
  const style = getComputedStyle(document.documentElement);
  colors.grid = style.getPropertyValue("--chart-grid").trim() || colors.grid;
  colors.text = style.getPropertyValue("--muted").trim() || colors.text;
  colors.accent = style.getPropertyValue("--accent").trim() || colors.accent;
  colors.accent2 = style.getPropertyValue("--accent-2").trim() || colors.accent2;
  colors.green = style.getPropertyValue("--green").trim() || colors.green;
}

function prepare(canvas) {
  refreshColors();
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 500));
  const height = Math.max(1, Math.round(rect.height || canvas.clientHeight || 260));
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";
  return { context, width, height };
}

function empty(canvas, message, show) {
  const target = canvas.parentElement?.querySelector(".chart-empty");
  if (target) {
    target.textContent = message;
    target.hidden = !show;
  }
  canvas.style.opacity = show ? "0" : "1";
}

function extent(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return [0, 1];
  let min = Math.min(...valid);
  let max = Math.max(...valid);
  if (min === max) {
    min -= Math.max(1, Math.abs(min) * 0.1);
    max += Math.max(1, Math.abs(max) * 0.1);
  }
  const pad = (max - min) * 0.15;
  return [min - pad, max + pad];
}

function scale(min, max, start, end) {
  const span = max - min || 1;
  return value => start + (value - min) / span * (end - start);
}

function dateLabel(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

export function drawLineChart(canvas, points, { unit = "", label = "Progress", rankMode = false } = {}) {
  const valid = points.filter(point => point.date && Number.isFinite(Number(point.value)));
  empty(canvas, "Log this exercise at least twice to show progression.", valid.length < 2);
  if (valid.length < 2) return;
  const { context, width, height } = prepare(canvas);
  const area = { left: 48, right: width - 16, top: 18, bottom: height - 34 };
  const times = valid.map(point => new Date(`${point.date}T00:00:00`).getTime());
  const [yMin, yMax] = extent(valid.map(point => Number(point.value)));
  const x = scale(Math.min(...times), Math.max(...times), area.left, area.right);
  const y = scale(yMin, yMax, area.bottom, area.top);

  context.font = "11px system-ui";
  context.fillStyle = colors.text;
  context.strokeStyle = colors.grid;
  context.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const ratio = i / 4;
    const value = yMax - ratio * (yMax - yMin);
    const py = y(value);
    context.beginPath();
    context.moveTo(area.left, py);
    context.lineTo(area.right, py);
    context.stroke();
    const display = rankMode ? value.toFixed(1) : `${Math.round(value * 10) / 10}${unit}`;
    context.fillText(display, 4, py + 4);
  }

  [valid[0], valid.at(-1)].forEach((point, index) => {
    context.textAlign = index === 0 ? "left" : "right";
    context.fillText(dateLabel(point.date), index === 0 ? area.left : area.right, height - 9);
  });
  context.textAlign = "left";

  const gradient = context.createLinearGradient(0, area.top, 0, area.bottom);
  gradient.addColorStop(0, "rgba(57,213,255,.28)");
  gradient.addColorStop(1, "rgba(57,213,255,0)");
  context.beginPath();
  valid.forEach((point, index) => {
    const px = x(new Date(`${point.date}T00:00:00`).getTime());
    const py = y(Number(point.value));
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.lineTo(area.right, area.bottom);
  context.lineTo(area.left, area.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  valid.forEach((point, index) => {
    const px = x(new Date(`${point.date}T00:00:00`).getTime());
    const py = y(Number(point.value));
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.strokeStyle = colors.accent;
  context.lineWidth = 3;
  context.stroke();

  for (const point of valid) {
    const px = x(new Date(`${point.date}T00:00:00`).getTime());
    const py = y(Number(point.value));
    context.beginPath();
    context.fillStyle = colors.accent2;
    context.arc(px, py, 3.5, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = colors.text;
  context.font = "700 11px system-ui";
  context.fillText(label, area.left, area.top - 5);
}

export function drawWeeklyBars(canvas, points, metric = "sessions") {
  const valid = points.filter(point => Number.isFinite(Number(point[metric])));
  empty(canvas, "Complete workouts to build weekly statistics.", valid.length === 0);
  if (!valid.length) return;
  const { context, width, height } = prepare(canvas);
  const area = { left: 40, right: width - 14, top: 18, bottom: height - 38 };
  const max = Math.max(1, ...valid.map(point => Number(point[metric])));
  const gap = 8;
  const barWidth = Math.max(8, (area.right - area.left - gap * (valid.length - 1)) / valid.length);

  context.strokeStyle = colors.grid;
  context.fillStyle = colors.text;
  context.font = "11px system-ui";
  for (let i = 0; i <= 3; i += 1) {
    const value = max - i / 3 * max;
    const y = area.top + i / 3 * (area.bottom - area.top);
    context.beginPath();
    context.moveTo(area.left, y);
    context.lineTo(area.right, y);
    context.stroke();
    context.fillText(String(Math.round(value)), 4, y + 4);
  }

  valid.forEach((point, index) => {
    const value = Number(point[metric]);
    const heightValue = value / max * (area.bottom - area.top);
    const left = area.left + index * (barWidth + gap);
    const top = area.bottom - heightValue;
    const gradient = context.createLinearGradient(0, top, 0, area.bottom);
    gradient.addColorStop(0, colors.accent);
    gradient.addColorStop(1, colors.accent2);
    context.fillStyle = gradient;
    context.beginPath();
    context.roundRect(left, top, barWidth, Math.max(2, heightValue), 5);
    context.fill();
    if (valid.length <= 8 || index % Math.ceil(valid.length / 7) === 0 || index === valid.length - 1) {
      context.fillStyle = colors.text;
      context.textAlign = "center";
      context.fillText(dateLabel(point.date), left + barWidth / 2, height - 12);
    }
  });
  context.textAlign = "left";
}

export function drawDonut(canvas, value, target, label) {
  const safeValue = Math.max(0, Number(value) || 0);
  const safeTarget = Math.max(1, Number(target) || 1);
  const ratio = Math.min(1, safeValue / safeTarget);
  const motionEnabled = document.documentElement.dataset.motion !== "off";

  if (!canvas.__donutAnimation) canvas.__donutAnimation = { frame: null };
  if (canvas.__donutAnimation.frame) cancelAnimationFrame(canvas.__donutAnimation.frame);

  const drawFrame = timestamp => {
    refreshColors();
    const rect = canvas.getBoundingClientRect();
    const cssSize = Math.max(128, Math.min(rect.width || 188, rect.height || 188));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;

    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, cssSize, cssSize);
    context.lineCap = "round";
    context.lineJoin = "round";

    const center = cssSize / 2;
    const radius = cssSize * 0.34;
    const trackWidth = Math.max(11, cssSize * 0.075);
    const start = -Math.PI / 2;
    const end = start + ratio * Math.PI * 2;
    const pulse = motionEnabled ? (Math.sin(timestamp / 520) + 1) / 2 : 0.45;
    const spin = motionEnabled ? timestamp / 1400 : 0;

    // Outer tactical guide ticks.
    context.save();
    context.translate(center, center);
    context.strokeStyle = colors.grid;
    context.lineWidth = 1.2;
    for (let i = 0; i < 40; i += 1) {
      const angle = i / 40 * Math.PI * 2 + spin * 0.08;
      const inner = radius + trackWidth * 0.92;
      const outer = radius + trackWidth * (i % 5 === 0 ? 1.55 : 1.32);
      context.beginPath();
      context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      context.stroke();
    }
    context.restore();

    // Base track.
    context.strokeStyle = colors.grid;
    context.lineWidth = trackWidth;
    context.shadowColor = "transparent";
    context.beginPath();
    context.arc(center, center, radius, start, start + Math.PI * 2);
    context.stroke();

    // Progress track with a small animated highlight, but no fake off-angle marker.
    if (ratio > 0) {
      const gradient = context.createLinearGradient(center - radius, center - radius, center + radius, center + radius);
      gradient.addColorStop(0, colors.accent);
      gradient.addColorStop(0.62, colors.green);
      gradient.addColorStop(1, colors.accent2);
      context.strokeStyle = gradient;
      context.lineWidth = trackWidth;
      context.shadowColor = colors.accent;
      context.shadowBlur = 8 + pulse * 7;
      context.beginPath();
      context.arc(center, center, radius, start, end);
      context.stroke();

      const sweepLength = Math.min(Math.PI * 0.42, ratio * Math.PI * 2);
      const sweepHead = start + ((spin % (Math.PI * 2)) * ratio);
      const sweepStart = Math.max(start, sweepHead - sweepLength);
      const sweepEnd = Math.min(end, sweepHead);
      if (sweepEnd > sweepStart) {
        context.strokeStyle = "rgba(255,255,255,.62)";
        context.lineWidth = Math.max(4, trackWidth * 0.35);
        context.shadowBlur = 6;
        context.beginPath();
        context.arc(center, center, radius, sweepStart, sweepEnd);
        context.stroke();
      }
      context.shadowBlur = 0;

      // Actual progress marker: compact glowing orb locked to the progress endpoint.
      const markerRadius = Math.max(5.5, cssSize * 0.034);
      const markerX = center + Math.cos(end) * radius;
      const markerY = center + Math.sin(end) * radius;
      const markerGradient = context.createRadialGradient(markerX - markerRadius * .35, markerY - markerRadius * .35, 1, markerX, markerY, markerRadius * 1.9);
      markerGradient.addColorStop(0, "rgba(255,255,255,.95)");
      markerGradient.addColorStop(.28, colors.accent);
      markerGradient.addColorStop(.72, colors.accent2);
      markerGradient.addColorStop(1, "rgba(255,255,255,0)");
      context.save();
      context.shadowColor = colors.accent;
      context.shadowBlur = 10 + pulse * 8;
      context.fillStyle = markerGradient;
      context.beginPath();
      context.arc(markerX, markerY, markerRadius * 1.35, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#050810";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(markerX, markerY, markerRadius, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    // Inner readout.
    context.textAlign = "center";
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#fff";
    context.font = `900 ${Math.max(26, cssSize * 0.18)}px system-ui`;
    context.fillText(`${Math.round(safeValue)}/${Math.round(safeTarget)}`, center, center + cssSize * 0.015);
    context.fillStyle = colors.text;
    context.font = `700 ${Math.max(10, cssSize * 0.065)}px system-ui`;
    context.fillText(label, center, center + cssSize * 0.18);
    context.textAlign = "left";

    if (motionEnabled && document.body.contains(canvas)) {
      canvas.__donutAnimation.frame = requestAnimationFrame(drawFrame);
    }
  };

  drawFrame(performance.now());
}

export function redrawOnResize(callback) {
  let timeout;
  window.addEventListener("resize", () => {
    clearTimeout(timeout);
    timeout = setTimeout(callback, 120);
  });
}
