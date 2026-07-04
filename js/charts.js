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
  const { context, width, height } = prepare(canvas);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.32;
  const ratio = Math.min(1, Math.max(0, Number(value) / Math.max(1, Number(target))));
  context.lineWidth = Math.max(10, radius * 0.18);
  context.strokeStyle = colors.grid;
  context.shadowColor = "transparent";
  context.beginPath();
  context.arc(centerX, centerY, radius, -Math.PI / 2, Math.PI * 1.5);
  context.stroke();
  const gradient = context.createLinearGradient(centerX - radius, 0, centerX + radius, 0);
  gradient.addColorStop(0, colors.accent);
  gradient.addColorStop(1, colors.green);
  context.strokeStyle = gradient;
  context.shadowColor = colors.accent;
  context.shadowBlur = 10;
  context.beginPath();
  context.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
  context.stroke();
  context.shadowBlur = 0;
  if (ratio > 0) {
    const angle = -Math.PI / 2 + ratio * Math.PI * 2;
    const markerX = centerX + Math.cos(angle) * radius;
    const markerY = centerY + Math.sin(angle) * radius;
    context.save();
    context.translate(markerX, markerY);
    context.rotate(angle + Math.PI / 4);
    context.fillStyle = colors.accent2;
    context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#050810";
    context.lineWidth = 2;
    context.beginPath();
    context.rect(-4, -4, 8, 8);
    context.fill();
    context.stroke();
    context.restore();
  }
  context.textAlign = "center";
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#fff";
  context.font = "800 30px system-ui";
  context.fillText(`${Math.round(value)}/${Math.round(target)}`, centerX, centerY + 3);
  context.fillStyle = colors.text;
  context.font = "12px system-ui";
  context.fillText(label, centerX, centerY + 25);
  context.textAlign = "left";
}

export function redrawOnResize(callback) {
  let timeout;
  window.addEventListener("resize", () => {
    clearTimeout(timeout);
    timeout = setTimeout(callback, 120);
  });
}
