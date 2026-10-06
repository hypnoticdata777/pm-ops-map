// @ts-nocheck — TODO(types): not converted to checked JSDoc yet. Delete this line and fix what `npm run typecheck` reports.
// Map view: SVG flow diagram, dept panel, tooltips, and map controls.
import {
  orgData, mapState, getEmployeeHex,
} from '../state.js';
import { getCompanyName } from '../storage.js';
import { escapeHtml } from '../utils.js';

// ── Map controls (owner filter pills) ────────────────────────────────────────
export function renderMapControls() {
  const container = document.getElementById('map-controls');
  if (!container) return;
  container.innerHTML = '';

  const uniqueOwners = [...new Set(
    orgData.departments.flatMap(d => d.tasks.map(t => t.owner))
  )];

  const label = document.createElement('span');
  label.className = 'map-control-label';
  label.textContent = 'Toggle:';
  container.appendChild(label);

  uniqueOwners.forEach(owner => {
    const isHidden  = mapState.hiddenOwners.has(owner);
    const isFocused = mapState.focusedOwner === owner;
    const btn = document.createElement('button');
    btn.className = 'map-filter-pill' +
      (isHidden  ? ' map-filter-pill--hidden'  : '') +
      (isFocused ? ' map-filter-pill--focused' : '');
    btn.style.setProperty('--pill-color', getEmployeeHex(owner));
    btn.textContent = owner === 'UNOWNED' ? '⚠ UNOWNED' : owner;
    btn.title = isHidden
      ? `Show ${owner}'s connections`
      : isFocused
        ? `Un-focus ${owner}`
        : `Click to focus ${owner} · Shift+click to hide`;

    btn.addEventListener('click', (e) => {
      if (e.shiftKey) {
        if (mapState.hiddenOwners.has(owner)) {
          mapState.hiddenOwners.delete(owner);
        } else {
          mapState.hiddenOwners.add(owner);
          if (mapState.focusedOwner === owner) mapState.focusedOwner = null;
        }
      } else {
        mapState.focusedOwner = (mapState.focusedOwner === owner) ? null : owner;
        if (mapState.focusedOwner === owner) mapState.hiddenOwners.delete(owner);
      }
      renderMapControls();
      renderFlowMap();
    });

    container.appendChild(btn);
  });

  if (mapState.hiddenOwners.size > 0 || mapState.focusedOwner !== null) {
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-secondary map-reset-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      mapState.hiddenOwners.clear();
      mapState.focusedOwner = null;
      renderMapControls();
      renderFlowMap();
    });
    container.appendChild(resetBtn);
  }

  const hint = document.createElement('span');
  hint.style.cssText = 'font-size:11px;color:#90a4ae;margin-left:auto;white-space:nowrap;';
  hint.textContent = 'Click to focus · Shift+click to hide/show · Click dept box for task list';
  container.appendChild(hint);
}

// ── Dept side panel ───────────────────────────────────────────────────────────
export function showDeptPanel(dept) {
  mapState.focusedDept = dept.id;

  const panel = document.getElementById('map-dept-panel');
  if (!panel) return;

  const byOwner = {};
  dept.tasks.forEach(t => {
    if (!byOwner[t.owner]) byOwner[t.owner] = [];
    byOwner[t.owner].push(t.name);
  });

  const unownedCount = dept.tasks.filter(t => t.owner === 'UNOWNED').length;

  panel.innerHTML = `
    <div class="map-panel-header" style="border-left: 5px solid ${dept.color}">
      <strong>${dept.name}</strong>
      <span class="task-count-badge">${dept.tasks.length} tasks${unownedCount > 0 ? ` · ${unownedCount} ⚠` : ''}</span>
      <button class="map-panel-close" onclick="closeDeptPanel()" title="Close">&#x2715;</button>
    </div>
    <div class="map-panel-body">
      ${Object.entries(byOwner).map(([owner, tasks]) => `
        <div class="map-panel-owner-group">
          <div class="map-panel-owner-badge${owner === 'UNOWNED' ? ' owner-unowned' : ''}"
               style="${owner !== 'UNOWNED' ? `background:${escapeHtml(getEmployeeHex(owner))}` : ''}">${escapeHtml(owner)}</div>
          <ul>
            ${tasks.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
  `;

  panel.classList.add('active');
}

export function closeDeptPanel() {
  mapState.focusedDept = null;
  const panel = document.getElementById('map-dept-panel');
  if (panel) {
    panel.classList.remove('active');
    panel.innerHTML = `
      <div class="map-panel-placeholder">
        <span>&#x1F4CB;</span>
        <p>Click a department box on the map to see its task list here.</p>
      </div>`;
  }
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
export function showMapTooltip(html, mouseX, mouseY) {
  let tip = document.getElementById('map-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'map-tooltip';
    tip.className = 'map-tooltip';
    document.body.appendChild(tip);
  }
  tip.innerHTML = html;
  tip.style.display = 'block';

  const tw = tip.offsetWidth || 200;
  const th = tip.offsetHeight || 60;
  const x  = mouseX + 14;
  const y  = mouseY - 10;
  tip.style.left = Math.max(4, x + tw > window.innerWidth  ? mouseX - tw - 10 : x) + 'px';
  tip.style.top  = Math.max(4, y + th > window.innerHeight ? mouseY - th - 10 : y) + 'px';
}

export function hideMapTooltip() {
  const tip = document.getElementById('map-tooltip');
  if (tip) tip.style.display = 'none';
}

// ── Flow map ──────────────────────────────────────────────────────────────────
export function renderFlowMap() {
  const svg = document.getElementById('flowMap');
  svg.innerHTML = '';

  const PADDING_TOP    = 60;
  const PADDING_BOTTOM = 50;
  const DEPT_SPACING   = 72;
  const DEPT_W         = 260;
  const DEPT_H         = 58;
  const DEPT_X         = 230;
  const OWNER_R        = 44;
  const OWNER_X        = 1250;
  const COMPANY_W      = 155;
  const COMPANY_H      = 110;
  const COMPANY_X      = 28;

  const depts        = orgData.departments;
  const deptCount    = depts.length;
  const uniqueOwners = [...new Set(depts.flatMap(d => d.tasks.map(t => t.owner)))];
  const ownerCount   = uniqueOwners.length;

  const deptsTotalH = (deptCount - 1) * DEPT_SPACING + DEPT_H;
  const canvasH = PADDING_TOP + deptsTotalH + PADDING_BOTTOM;
  const canvasW = OWNER_X + OWNER_R + 40;

  svg.setAttribute('width', canvasW);
  svg.setAttribute('height', canvasH);
  svg.setAttribute('viewBox', `0 0 ${canvasW} ${canvasH}`);

  const deptCY = (i) => PADDING_TOP + i * DEPT_SPACING + DEPT_H / 2;
  const topCY    = deptCY(0);
  const bottomCY = deptCY(deptCount - 1);
  const ownerCY  = (i) => {
    if (ownerCount === 1) return (topCY + bottomCY) / 2;
    return topCY + (i / (ownerCount - 1)) * (bottomCY - topCY);
  };

  const ownerPos = {};
  uniqueOwners.forEach((owner, i) => {
    ownerPos[owner] = { x: OWNER_X, y: ownerCY(i) };
  });

  const companyCY = (topCY + bottomCY) / 2;

  const hasFocused = mapState.focusedOwner !== null;

  function connectionOpacity(owner) {
    if (mapState.hiddenOwners.has(owner)) return 0;
    if (hasFocused) return mapState.focusedOwner === owner ? 0.9 : 0.08;
    return 0.65;
  }

  function ownerGroupOpacity(owner) {
    if (mapState.hiddenOwners.has(owner)) return 0.25;
    if (hasFocused) return mapState.focusedOwner === owner ? 1 : 0.3;
    return 1;
  }

  function deptGroupOpacity(dept) {
    if (!hasFocused) return 1;
    const ownerPresent = dept.tasks.some(t => t.owner === mapState.focusedOwner);
    return ownerPresent ? 1 : 0.3;
  }

  // Layer 1: Company → Dept connector lines
  const compLineLayer = svgGroup(svg);
  depts.forEach((dept, i) => {
    svgLine(compLineLayer,
      COMPANY_X + COMPANY_W, companyCY,
      DEPT_X, deptCY(i),
      '#cfd8dc', 1.5);
  });

  // Layer 2: Dept → Owner bezier curves
  const curveLayer = svgGroup(svg);

  depts.forEach((dept, i) => {
    const cy = deptCY(i);
    const x1 = DEPT_X + DEPT_W;

    const ownerCounts = {};
    dept.tasks.forEach(t => {
      ownerCounts[t.owner] = (ownerCounts[t.owner] || 0) + 1;
    });

    Object.entries(ownerCounts).forEach(([owner, count]) => {
      const op = ownerPos[owner];
      if (!op) return;

      const opacity = connectionOpacity(owner);
      if (opacity === 0) return;

      const x2   = op.x - OWNER_R;
      const y2   = op.y;
      const midX = x1 + (x2 - x1) * 0.55;
      const color   = getEmployeeHex(owner);
      const strokeW = Math.max(2, Math.min(count * 1.0, 8));
      const dash    = owner === 'UNOWNED' ? '6,4' : null;

      svgPath(
        curveLayer,
        `M${x1},${cy} C${midX},${cy} ${midX},${y2} ${x2},${y2}`,
        color, strokeW, dash, opacity
      );

      // Thicker invisible hit area for easier hovering
      const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitPath.setAttribute('d', `M${x1},${cy} C${midX},${cy} ${midX},${y2} ${x2},${y2}`);
      hitPath.setAttribute('fill', 'none');
      hitPath.setAttribute('stroke', 'transparent');
      hitPath.setAttribute('stroke-width', '14');
      hitPath.style.cursor = 'pointer';
      curveLayer.appendChild(hitPath);

      const tooltipHtml = `<strong>${dept.name} → ${owner}</strong><br>${count} task${count !== 1 ? 's' : ''}`;
      hitPath.addEventListener('mouseenter', (e) => showMapTooltip(tooltipHtml, e.clientX, e.clientY));
      hitPath.addEventListener('mousemove',  (e) => showMapTooltip(tooltipHtml, e.clientX, e.clientY));
      hitPath.addEventListener('mouseleave', hideMapTooltip);
    });
  });

  // Layer 3: Company box
  const boxLayer = svgGroup(svg);
  const compY = companyCY - COMPANY_H / 2;
  svgRect(boxLayer, COMPANY_X, compY, COMPANY_W, COMPANY_H, '#37474f', 10);
  drawCompanyLabel(boxLayer, COMPANY_X + COMPANY_W / 2, companyCY);

  // Layer 4: Department boxes (interactive)
  depts.forEach((dept, i) => {
    const cy = deptCY(i);
    const bx = DEPT_X;
    const by = cy - DEPT_H / 2;

    const unownedCount = dept.tasks.filter(t => t.owner === 'UNOWNED').length;
    const isFocused    = mapState.focusedDept === dept.id;
    const boxBg        = isFocused ? '#e3f2fd' : (unownedCount > 0 ? '#fff5f5' : '#ffffff');
    const opacity      = deptGroupOpacity(dept);

    const g = svgGroup(boxLayer);
    g.setAttribute('opacity', opacity);
    g.style.cursor = 'pointer';

    if (isFocused) {
      svgRect(g, bx - 2, by - 2, DEPT_W + 4, DEPT_H + 4, 'none', 9, '#1976d2', 2.5);
    }

    svgRect(g, bx, by, DEPT_W, DEPT_H, boxBg, 7, dept.color, 3);

    const MAX = 32;
    const labelText = dept.name.length > MAX ? dept.name.slice(0, MAX - 1) + '…' : dept.name;
    svgText(g, bx + 14, cy - 9,  labelText, '#263238', 12, 700, 'start');

    const statsLabel = `${dept.tasks.length} tasks` +
      (unownedCount > 0 ? `  ·  ${unownedCount} ⚠ unowned` : '');
    const statsColor = unownedCount > 0 ? '#d32f2f' : '#78909c';
    svgText(g, bx + 14, cy + 10, statsLabel, statsColor, 11, 400, 'start');

    const ownerList = [...new Set(dept.tasks.map(t => t.owner))].map(escapeHtml).join(', ');
    const tipHtml = `<strong>${escapeHtml(dept.name)}</strong><br>${dept.tasks.length} tasks · Owners: ${ownerList}`;

    g.addEventListener('mouseenter', (e) => {
      showMapTooltip(tipHtml, e.clientX, e.clientY);
      if (!isFocused) g.style.filter = 'drop-shadow(0 0 6px rgba(25,118,210,0.5))';
    });
    g.addEventListener('mousemove',  (e) => showMapTooltip(tipHtml, e.clientX, e.clientY));
    g.addEventListener('mouseleave', () => {
      hideMapTooltip();
      g.style.filter = '';
    });
    g.addEventListener('click', () => {
      if (mapState.focusedDept === dept.id) {
        closeDeptPanel();
        renderFlowMap();
      } else {
        showDeptPanel(dept);
        renderFlowMap();
      }
    });
  });

  // Layer 5: Owner circles (interactive)
  uniqueOwners.forEach((owner) => {
    const { x, y } = ownerPos[owner];
    const color   = getEmployeeHex(owner);
    const opacity = ownerGroupOpacity(owner);

    const g = svgGroup(boxLayer);
    g.setAttribute('opacity', opacity);
    g.style.cursor = 'pointer';

    svgCircle(g, x, y, OWNER_R, color, '#263238', 2);

    if (owner === 'UNOWNED') {
      svgText(g, x, y - 7,  '⚠',  '#fff', 14, 700);
      svgText(g, x, y + 10, 'UNOWNED', '#fff', 10, 700);
    } else {
      svgText(g, x, y + 5, owner, '#fff', 13, 700);
    }

    const taskCount = orgData.departments.reduce(
      (sum, d) => sum + d.tasks.filter(t => t.owner === owner).length, 0
    );
    const deptNames = orgData.departments
      .filter(d => d.tasks.some(t => t.owner === owner))
      .map(d => d.name)
      .join(', ');
    const ownerTipHtml = `<strong>${escapeHtml(owner)}</strong><br>${taskCount} tasks · Depts: ${escapeHtml(deptNames || 'none')}`;

    g.addEventListener('mouseenter', (e) => {
      showMapTooltip(ownerTipHtml, e.clientX, e.clientY);
      g.style.filter = 'drop-shadow(0 0 8px rgba(255,255,255,0.6))';
    });
    g.addEventListener('mousemove',  (e) => showMapTooltip(ownerTipHtml, e.clientX, e.clientY));
    g.addEventListener('mouseleave', () => {
      hideMapTooltip();
      g.style.filter = '';
    });
    g.addEventListener('click', () => {
      mapState.focusedOwner = (mapState.focusedOwner === owner) ? null : owner;
      if (mapState.focusedOwner === owner) mapState.hiddenOwners.delete(owner);
      renderMapControls();
      renderFlowMap();
    });
  });

  // Legend
  svgText(svg, canvasW / 2, 22,
    'Line thickness = task count  ·  Dashed red = unowned  ·  Click circles or dept boxes to interact',
    '#90a4ae', 11, 400);
}

// ── Company label renderer ─────────────────────────────────────────────────────
function drawCompanyLabel(layer, cx, cy) {
  const name  = getCompanyName().toUpperCase();
  const words = name.trim().split(/\s+/);

  let lines;
  if (words.length <= 3) {
    lines = words;
  } else {
    const size = Math.ceil(words.length / 3);
    lines = [
      words.slice(0, size).join(' '),
      words.slice(size, size * 2).join(' '),
      words.slice(size * 2).join(' '),
    ].filter(Boolean);
  }

  const lineH  = 16;
  const startY = cy - ((lines.length - 1) / 2) * lineH;
  lines.forEach((line, i) => {
    const isLast = i === lines.length - 1 && lines.length > 1;
    svgText(layer, cx, startY + i * lineH, line, '#fff', isLast ? 10 : 12, isLast ? 400 : 700);
  });
}

// ── SVG helpers ───────────────────────────────────────────────────────────────
export function svgGroup(parent) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  parent.appendChild(g);
  return g;
}

export function svgRect(parent, x, y, w, h, fill, rx = 0, stroke = 'none', strokeW = 0) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  el.setAttribute('x', x);  el.setAttribute('y', y);
  el.setAttribute('width', w); el.setAttribute('height', h);
  el.setAttribute('fill', fill);
  el.setAttribute('rx', rx);
  if (stroke !== 'none') {
    el.setAttribute('stroke', stroke);
    el.setAttribute('stroke-width', strokeW);
  }
  parent.appendChild(el);
  return el;
}

export function svgText(parent, x, y, text, fill, fontSize, fontWeight, textAnchor = 'middle') {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  el.setAttribute('x', x); el.setAttribute('y', y);
  el.setAttribute('text-anchor', textAnchor);
  el.setAttribute('dominant-baseline', 'middle');
  el.setAttribute('fill', fill);
  el.setAttribute('font-size', fontSize);
  el.setAttribute('font-weight', fontWeight);
  el.setAttribute('font-family', 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif');
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

export function svgCircle(parent, cx, cy, r, fill, stroke, strokeW) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  el.setAttribute('cx', cx); el.setAttribute('cy', cy);
  el.setAttribute('r', r);
  el.setAttribute('fill', fill);
  el.setAttribute('stroke', stroke);
  el.setAttribute('stroke-width', strokeW);
  parent.appendChild(el);
  return el;
}

export function svgLine(parent, x1, y1, x2, y2, stroke, strokeW) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  el.setAttribute('x1', x1); el.setAttribute('y1', y1);
  el.setAttribute('x2', x2); el.setAttribute('y2', y2);
  el.setAttribute('stroke', stroke);
  el.setAttribute('stroke-width', strokeW);
  parent.appendChild(el);
  return el;
}

export function svgPath(parent, d, stroke, strokeW, dashArray = null, opacity = 1) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('d', d);
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', stroke);
  el.setAttribute('stroke-width', strokeW);
  if (dashArray) el.setAttribute('stroke-dasharray', dashArray);
  if (opacity < 1) el.setAttribute('opacity', opacity);
  parent.appendChild(el);
  return el;
}
