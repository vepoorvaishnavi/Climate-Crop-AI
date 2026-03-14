/* ── Climate Crop Planner — Main Script ─────────────────────── */

let rainfallChart, tempChart, radarChart, barChart;
let currentResults = null;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Theme ──────────────────────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
let isDark = localStorage.getItem('theme') === 'light' ? false : true;

function updateTheme() {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  if (currentResults) refreshCharts(currentResults);
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    isDark = !isDark;
    updateTheme();
  });
}
// Apply initial theme
document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

// ──// Force Service Worker Unregistration to clear old caches for Phase 2-5 Features
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    let unregistrationPromise = Promise.resolve();
    if(registrations.length > 0) {
      console.log('Unregistering old service workers...');
      for(let registration of registrations) {
        unregistrationPromise = registration.unregister();
      }
      unregistrationPromise.then(() => {
        // Clear caches
        caches.keys().then(names => {
          for (let name of names) caches.delete(name);
        }).then(() => {
          // Force reload once to grab new files
          if (!sessionStorage.getItem('sw_cleared')) {
            sessionStorage.setItem('sw_cleared', 'true');
            window.location.reload(true);
          }
        });
      });
    }
  });
  
  // Register the new v2 network-first service worker
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/static/sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.log('SW registration failed:', err));
  });
}

// ── Navbar scroll effect ───────────────────────────────────────────
window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 20);
});

// ── Sliders sync ──────────────────────────────────────────────────
function syncSlider(sliderId, inputId, displayId, suffix) {
  const slider = document.getElementById(sliderId);
  const input = document.getElementById(inputId);
  const display = document.getElementById(displayId);

  if (!slider || !input || !display) return;

  const update = (val) => {
    display.textContent = `${val} ${suffix}`;
    const pct = ((val - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
  };

  slider.addEventListener('input', () => { input.value = slider.value; update(slider.value); });
  input.addEventListener('input', () => {
    const v = Math.min(Math.max(parseFloat(input.value) || 0, +slider.min), +slider.max);
    slider.value = v; update(v);
  });

  // Init
  update(slider.value);
  input.value = slider.value;
}

// ── Loading overlay ────────────────────────────────────────────────
function showLoading() {
  let el = document.getElementById('loadingOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loadingOverlay';
    el.innerHTML = `
      <div class="loading-spinner"><span class="loading-emoji">🌱</span></div>
      <div class="loading-text">AI is analyzing your field...</div>
      <div class="loading-sub">Evaluating 10 crops against historical climate data</div>
    `;
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}

function hideLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = 'none';
}

// ── Main Prediction ────────────────────────────────────────────────
async function runPrediction() {
  // Validate
  const locationEl = document.getElementById('location');
  const rainfallEl = document.getElementById('rainfall');
  const tempEl = document.getElementById('temperature');
  
  if (!locationEl || !rainfallEl || !tempEl) return;

  const location = locationEl.value;
  const rainfall = rainfallEl.value;
  const temperature = tempEl.value;
  const season = document.querySelector('input[name="season"]:checked')?.value;
  const soil = document.querySelector('input[name="soil"]:checked')?.value;

  if (!location || !rainfall || !temperature || !season || !soil) {
    showToast('Please fill in all fields to get recommendations.', 'warning');
    return;
  }

  const btn = document.getElementById('predictBtn');
  if (btn) {
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.btn-loading').style.display = 'flex';
    btn.disabled = true;
  }

  showLoading();

  try {
    const res = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location, rainfall, temperature, season, soil_type: soil })
    });
    const data = await res.json();
    
    // Store in localStorage for other pages
    localStorage.setItem('lastPrediction', JSON.stringify(data));
    localStorage.setItem('lastInputs', JSON.stringify({ location, rainfall, temperature, season, soil }));
    
    hideLoading();
    currentResults = data;

    await new Promise(r => setTimeout(r, 800)); // subtle dramatic pause ✨

    // Navigate to results page
    window.location.href = '/results';

  } catch (err) {
    hideLoading();
    showToast('Failed to get predictions. Make sure Flask is running.', 'error');
    console.error(err);
    if (btn) {
        btn.querySelector('.btn-text').style.display = 'flex';
        btn.querySelector('.btn-loading').style.display = 'none';
        btn.disabled = false;
    }
  }
}

// ── Render Results ────────────────────────────────────────────────
function renderResults(data) {
  const noResults = document.getElementById('noResults');
  const riskBanner = document.getElementById('riskBanner');
  const comparisonSection = document.getElementById('comparisonSection');

  if (noResults) noResults.classList.add('hidden');
  if (riskBanner) riskBanner.classList.remove('hidden');
  if (comparisonSection) comparisonSection.classList.remove('hidden');

  const alertsContainer = document.getElementById('weatherAlerts');
  if (alertsContainer && data.weather_alerts && data.weather_alerts.length > 0) {
    alertsContainer.classList.remove('hidden');
    alertsContainer.innerHTML = data.weather_alerts.map(alert => `
      <div class="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl flex items-center justify-between shadow-lg">
        <span class="font-bold">${alert}</span>
        <button onclick="this.parentElement.style.display='none'" class="text-xl leading-none opacity-70 hover:opacity-100">&times;</button>
      </div>
    `).join('');
  }

  renderRiskBanner(data);
  renderCropCards(data.recommendations);
  renderComparisonTable(data.all_crops);
}

function renderRiskBanner(data) {
  const score = data.climate_risk_score;
  const circle = document.getElementById('riskCircle');
  const scoreNum = document.getElementById('riskScoreNum');
  const sub = document.getElementById('riskBannerSub');
  const meta = document.getElementById('riskMeta');

  if (!circle || !scoreNum || !sub || !meta) return;

  const circumference = 263;
  const offset = circumference - (score / 100) * circumference;

  let color, label;
  if (score < 35) { color = '#4ade80'; label = 'Low Climate Risk'; }
  else if (score < 65) { color = '#fbbf24'; label = 'Moderate Climate Risk'; }
  else { color = '#f87171'; label = 'High Climate Risk'; }

  circle.style.stroke = color;
  circle.style.strokeDashoffset = offset;
  scoreNum.textContent = score;
  sub.textContent = label;
  sub.style.color = color;

  const recs = data.recommendations;
  meta.innerHTML = recs.map(c => `
    <span class="risk-pill ${c.risk.toLowerCase()}">${c.icon} ${c.name} — ${c.risk} Risk</span>
  `).join('');
}

function renderCropCards(crops) {
  const grid = document.getElementById('cropCardsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  crops.forEach((crop, i) => {
    const card = document.createElement('div');
    card.className = `crop-card rank-${i + 1}`;
    card.style.setProperty('--crop-color', crop.color);
    card.style.animationDelay = `${i * 0.15}s`;

    const riskClass = crop.risk.toLowerCase();

    card.innerHTML = `
      <div class="crop-card-header">
        <span class="crop-emoji">${crop.icon}</span>
        <div>
          <div class="crop-card-title">${crop.name}</div>
          <div class="risk-badge ${riskClass}">
            <span class="risk-dot"></span>
            ${crop.risk} Risk
          </div>
        </div>
        <div class="crop-score-badge">
          <span class="crop-score-num">${Math.round(crop.score)}</span>
          <span class="crop-score-label">Score</span>
        </div>
      </div>

      <p class="crop-desc">${crop.description}</p>

      <div class="yield-bar-wrap">
        <div class="yield-bar-label">
          <span>Yield Stability</span>
          <span style="color:var(--accent)">${crop.yield_stability}%</span>
        </div>
        <div class="yield-bar-track">
          <div class="yield-bar-fill" style="width:${crop.yield_stability}%; animation-delay:${0.4 + i * 0.15}s"></div>
        </div>
      </div>

      <div class="match-grid">
        ${[
          ['🌧️ Rainfall', crop.rainfall_match],
          ['🌡️ Temp', crop.temp_match],
          ['🏔️ Soil', crop.soil_match],
          ['📅 Season', crop.season_match]
        ].map(([label, val]) => `
          <div class="match-item">
            <div class="match-item-label">${label} ${val}%</div>
            <div class="match-item-bar"><div class="match-item-fill" style="width:${val}%"></div></div>
          </div>
        `).join('')}
      </div>

      <div class="crop-metrics">
        <div class="metric-item">
          <span class="metric-label">💧 Water Need</span>
          <span class="metric-value">${crop.water_need}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">📅 Growth Days</span>
          <span class="metric-value">${crop.growth_days} days</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">💰 Market Value</span>
          <span class="metric-value">${crop.market_value}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">🥩 Protein</span>
          <span class="metric-value">${crop.protein}</span>
        </div>
      </div>

      <!-- New AI Enhanced Sections -->
      <div class="ai-expanded-info">
        <div class="info-section">
          <div class="info-header">🚿 Recommended Irrigation</div>
          <div class="info-content">${crop.irrigation || 'Based on local rainfall pattern.'}</div>
        </div>
        
        <div class="info-section">
          <div class="info-header">📈 Profit Prediction (per acre)</div>
          <div class="economics-grid">
            <div class="econ-item"><span>Yield</span><strong>${crop.economics?.yield_per_acre || '-'}</strong></div>
            <div class="econ-item"><span>Price</span><strong>${crop.economics?.price || '-'}</strong></div>
            <div class="econ-item highlighted"><span>Estimated Profit</span><strong>${crop.economics?.profit || '-'}</strong></div>
          </div>
        </div>

        <div class="info-section">
          <div class="info-header">📅 Crop Timeline</div>
          <div class="timeline-steps">
            ${(crop.calendar || []).map(step => `<div class="timeline-step"><span></span>${step}</div>`).join('')}
          </div>
        </div>

        <div class="info-section">
          <div class="info-header">🔄 Recommended Rotation</div>
          <div class="rotation-box">
            Next Season Suggestion: <strong>${crop.rotation || 'Soybean'}</strong>
            <p class="text-xs mt-1 opacity-70">Boosts soil fertility and reduces pest buildup.</p>
          </div>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

function renderComparisonTable(crops) {
  const tbody = document.getElementById('comparisonBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  crops.forEach((crop, i) => {
    const tr = document.createElement('tr');
    if (i < 3) tr.className = 'top-row';
    tr.innerHTML = `
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="rank-cell">${i + 1}</span>
          <span style="font-size:18px">${crop.icon}</span>
          <strong>${crop.name}</strong>
        </div>
      </td>
      <td><strong style="color:var(--accent)">${Math.round(crop.score)}</strong></td>
      <td><span class="risk-pill ${crop.risk.toLowerCase()}">${crop.risk}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:5px;background:var(--bg-3);border-radius:5px">
            <div style="width:${crop.yield_stability}%;height:100%;background:var(--accent);border-radius:5px"></div>
          </div>
          <span style="font-size:12px">${crop.yield_stability}%</span>
        </div>
      </td>
      <td>${crop.water_need}</td>
      <td>${crop.growth_days}d</td>
      <td style="font-size:12px">${crop.market_value}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Charts ─────────────────────────────────────────────────────────
function getChartColors() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    gridColor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    textColor: dark ? '#86a98e' : '#166534',
    tooltipBg: dark ? '#0d1a14' : '#fff',
  };
}

function renderCharts(data) {
  const { weather_history, recommendations, all_crops, location } = data;
  const c = getChartColors();

  const rainCanvas = document.getElementById('rainfallChart');
  const tempCanvas = document.getElementById('tempChart');
  const radarCanvas = document.getElementById('radarChart');
  const barCanvas = document.getElementById('barChart');

  if (!rainCanvas || !tempCanvas || !radarCanvas || !barCanvas) return;

  const noData = document.getElementById('noData');
  const chartsGrid = document.getElementById('chartsGrid');
  if (noData) noData.classList.add('hidden');
  if (chartsGrid) chartsGrid.classList.remove('hidden');

  // Destroy existing
  [rainfallChart, tempChart, radarChart, barChart].forEach(ch => ch?.destroy());

  document.getElementById('rainfallChartSub').textContent = location;
  document.getElementById('tempChartSub').textContent = location;

  // 1) Rainfall Chart
  rainfallChart = new Chart(rainCanvas, {
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [{
        label: 'Rainfall (mm)',
        data: weather_history.avg_rainfall,
        backgroundColor: 'rgba(34,197,94,0.3)',
        borderColor: '#22c55e',
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: chartOptions('Rainfall (mm)', c)
  });

  // 2) Temperature Chart
  tempChart = new Chart(tempCanvas, {
    type: 'line',
    data: {
      labels: MONTHS,
      datasets: [{
        label: 'Avg Temp (°C)',
        data: weather_history.avg_temp,
        borderColor: '#e8902b',
        backgroundColor: 'rgba(232,144,43,0.1)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#e8902b',
        pointRadius: 4,
        pointHoverRadius: 7,
      }]
    },
    options: chartOptions('Temperature (°C)', c)
  });

  // 3) Radar Chart
  const top3 = recommendations;
  radarChart = new Chart(radarCanvas, {
    type: 'radar',
    data: {
      labels: ['Rainfall', 'Temperature', 'Soil', 'Season', 'Yield'],
      datasets: top3.map((crop, i) => ({
        label: crop.name,
        data: [crop.rainfall_match, crop.temp_match, crop.soil_match, crop.season_match, crop.yield_stability],
        borderColor: ['#22c55e', '#e8902b', '#60a5fa'][i],
        backgroundColor: ['rgba(34,197,94,0.1)', 'rgba(232,144,43,0.1)', 'rgba(96,165,250,0.1)'][i],
        borderWidth: 2,
        pointBackgroundColor: ['#22c55e', '#e8902b', '#60a5fa'][i],
        pointRadius: 4,
      }))
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: c.textColor, font: { family: "'DM Sans'" } } } },
      scales: {
        r: {
          min: 0, max: 100,
          grid: { color: c.gridColor },
          ticks: { color: c.textColor, backdropColor: 'transparent', stepSize: 25 },
          pointLabels: { color: c.textColor, font: { family: "'DM Sans'", size: 12 } }
        }
      }
    }
  });

  // 4) Horizontal Bar Chart
  const sorted = [...all_crops].sort((a, b) => b.score - a.score).slice(0, 10);
  barChart = new Chart(barCanvas, {
    type: 'bar',
    data: {
      labels: sorted.map(c => `${c.icon} ${c.name}`),
      datasets: [{
        label: 'Resilience Score',
        data: sorted.map(c => Math.round(c.score)),
        backgroundColor: sorted.map((_, i) =>
          i === 0 ? 'rgba(34,197,94,0.7)' : i === 1 ? 'rgba(34,197,94,0.5)' : i === 2 ? 'rgba(34,197,94,0.35)' : 'rgba(34,197,94,0.15)'
        ),
        borderColor: '#22c55e',
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      ...chartOptions('Score', c),
      indexAxis: 'y',
    }
  });
}

function refreshCharts(data) { renderCharts(data); }

function chartOptions(yLabel, c) {
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.tooltipBg,
        titleColor: '#22c55e',
        bodyColor: c.textColor,
        borderColor: 'rgba(34,197,94,0.2)',
        borderWidth: 1,
        cornerRadius: 10,
        padding: 12,
      }
    },
    scales: {
      x: { grid: { color: c.gridColor }, ticks: { color: c.textColor } },
      y: {
        grid: { color: c.gridColor }, ticks: { color: c.textColor },
        title: { display: false }
      }
    }
  };
}

// ── PDF Export ─────────────────────────────────────────────────────
function downloadPDF() {
  if (!currentResults) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const green = [34, 197, 94];
  const dark = [10, 26, 18];

  // Background
  doc.setFillColor(...dark);
  doc.rect(0, 0, 210, 297, 'F');

  // Header
  doc.setFillColor(20, 40, 30);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...green);
  doc.text('🌱 Climate Crop Planner', 20, 18);
  doc.setFontSize(10);
  doc.setTextColor(134, 169, 142);
  doc.text('AI-Powered Agricultural Intelligence Report', 20, 28);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}`, 20, 36);

  // Location info from stored inputs
  const inputs = JSON.parse(localStorage.getItem('lastInputs') || '{}');
  const loc = inputs.location || 'Unknown';
  const rainfall = inputs.rainfall || '-';
  const temp = inputs.temperature || '-';
  const season = inputs.season || '-';
  const soil = inputs.soil || '-';

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...green);
  doc.text('Farm Profile', 20, 52);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 230, 210);
  doc.setFontSize(9);
  const details = [`Location: ${loc}`, `Season: ${season}`, `Soil: ${soil}`, `Rainfall: ${rainfall} mm/month`, `Temperature: ${temp}°C`, `Climate Risk Score: ${currentResults.climate_risk_score}/100`];
  details.forEach((d, i) => doc.text(d, 20 + (i % 3) * 62, 60 + Math.floor(i / 3) * 8));

  // Recommendations
  let y = 82;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...green);
  doc.text('Top 3 Recommended Crops', 20, y);
  y += 10;

  currentResults.recommendations.forEach((crop, i) => {
    doc.setFillColor(15, 35, 25);
    doc.roundedRect(20, y, 170, 52, 3, 3, 'F');
    doc.setFillColor(...green);
    doc.circle(30, y + 7, 3, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(240, 255, 245);
    doc.text(`${i + 1}. ${crop.name}`, 38, y + 9);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(134, 169, 142);
    doc.text(`Score: ${Math.round(crop.score)} | Risk: ${crop.risk} | Yield Stability: ${crop.yield_stability}%`, 38, y + 17);
    doc.text(`Water: ${crop.irrigation || crop.water_need} | Profit: ${crop.economics?.profit || '-'}`, 38, y + 24);
    doc.text(`Rotation: ${crop.rotation || 'Soybean'} | Timeline: ${crop.calendar ? crop.calendar[0] + '...' : 'N/A'}`, 38, y + 31);
    doc.text(crop.description, 38, y + 38, { maxWidth: 148 });
    y += 58;
  });

  // All crops
  y += 6;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...green);
  doc.text('All Crops Ranked', 20, y);
  y += 8;

  currentResults.all_crops.slice(0, 7).forEach((crop, i) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(180, 220, 195);
    doc.text(`${i + 1}. ${crop.name} — Score: ${Math.round(crop.score)}, Risk: ${crop.risk}`, 20, y);
    y += 7;
  });

  // Footer
  doc.setFillColor(15, 35, 25);
  doc.rect(0, 282, 210, 15, 'F');
  doc.setFontSize(8);
  doc.setTextColor(80, 120, 90);
  doc.text('Climate Crop Planner | AI-Powered Agricultural Intelligence', 105, 290, { align: 'center' });

  doc.save(`crop-recommendation-${loc.toLowerCase().replace(/\s/g, '-')}.pdf`);
  showToast('PDF downloaded successfully! 🎉', 'success');
}

// ── WhatsApp Sharing ──────────────────────────────────────────────
function shareWhatsApp() {
  if (!currentResults || !currentResults.recommendations.length) return;
  const topCrop = currentResults.recommendations[0];
  const inputs = JSON.parse(localStorage.getItem('lastInputs') || '{}');
  
  const text = `🌱 *Climate Crop Planner Results*\n\n📍 Location: ${inputs.location || 'Unknown'}\n📈 Climate Risk Score: ${currentResults.climate_risk_score}/100\n\n🏆 *Top Recommendation*: ${topCrop.icon} ${topCrop.name}\n⭐ Score: ${Math.round(topCrop.score)} | Risk: ${topCrop.risk}\n💰 Est. Profit: ${topCrop.economics?.profit || '-'}\n\nCheck out the full plan on the Climate Crop Planner app!`;
  
  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
  window.open(whatsappUrl, '_blank');
}

// ── Save Plan (Backend Database) ──────────────────────────────────
async function savePlan() {
  if (!currentResults || !currentResults.recommendations.length) return;
  const topCrop = currentResults.recommendations[0];
  const inputs = JSON.parse(localStorage.getItem('lastInputs') || '{}');
  
  try {
    const res = await fetch('/api/save_plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crop_name: topCrop.name,
        score: topCrop.score,
        risk: topCrop.risk,
        season: inputs.season || 'Unknown'
      })
    });
    
    if (res.redirected) {
      window.location.href = res.url; // Handle redirect to login
      return;
    }
    
    const data = await res.json();
    if (data.success) {
      showToast('Plan saved successfully to your Dashboard! 💾', 'success');
    } else {
      showToast('Error saving plan.', 'error');
    }
  } catch (err) {
    showToast('Failed to save plan. Are you logged in?', 'error');
    console.error(err);
  }
}

// ── Toast ──────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    Object.assign(container.style, {
      position: 'fixed', bottom: '24px', right: '24px', zIndex: '1000',
      display: 'flex', flexDirection: 'column', gap: '10px'
    });
    document.body.appendChild(container);
  }

  const colors = { success: '#22c55e', warning: '#fbbf24', error: '#f87171', info: '#60a5fa' };
  const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };

  const toast = document.createElement('div');
  Object.assign(toast.style, {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px 18px', borderRadius: '12px',
    background: 'var(--bg-card)', backdropFilter: 'blur(20px)',
    border: `1px solid ${colors[type]}33`,
    color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500',
    boxShadow: `0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px ${colors[type]}22`,
    animation: 'slideIn 0.3s ease', maxWidth: '320px',
  });
  toast.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Toast animations
const toastStyle = document.createElement('style');
toastStyle.textContent = `
  @keyframes slideIn { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(24px); opacity: 0; } }
`;
document.head.appendChild(toastStyle);

// ── Keyboard shortcut ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const btn = document.getElementById('predictBtn');
      if (btn) runPrediction();
  }
});

// ── Initial Setup ───────────────────────────────────────────────
async function fetchLocations() {
  try {
    const res = await fetch('/api/locations');
    const locations = await res.json();
    const select = document.getElementById('location');
    if (!select) return;
    locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = loc;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load locations:', err);
  }
}

// ── Page Initialization ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;

  // Initialize theme
  updateTheme();

  // Highlight active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === path) {
      link.classList.add('active');
    }
  });

  // Load stored data if available
  const stored = localStorage.getItem('lastPrediction');
  if (stored) {
    currentResults = JSON.parse(stored);
  }

  // Page-specific initialization
  if (path === '/planner') {
    fetchLocations();
    syncSlider('rainfallSlider', 'rainfall', 'rainfallVal', 'mm');
    syncSlider('temperatureSlider', 'temperature', 'temperatureVal', '°C');

    document.getElementById('location').addEventListener('change', async (e) => {
      const loc = e.target.value;
      if (!loc) return;
      try {
        const res = await fetch(`/api/weather/${loc}`);
        const data = await res.json();
        const avgRain = Math.round(data.avg_rainfall.reduce((a, b) => a + b, 0) / 12);
        const avgTemp = Math.round(data.avg_temp.reduce((a, b) => a + b, 0) / 12);
        
        document.getElementById('rainfall').value = avgRain;
        document.getElementById('temperature').value = avgTemp;
        document.getElementById('rainfallSlider').value = avgRain;
        document.getElementById('temperatureSlider').value = avgTemp;
        document.getElementById('rainfallSlider').dispatchEvent(new Event('input'));
        document.getElementById('temperatureSlider').dispatchEvent(new Event('input'));
      } catch (err) {
        console.error('Failed to fetch weather:', err);
      }
    });

    // Subtle entrance animations
    document.querySelectorAll('.hero-content > *').forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        setTimeout(() => {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, 100 + i * 120);
      });
  }

  if (path === '/results' && currentResults) {
    renderResults(currentResults);
  }

  if (path === '/insights' && currentResults) {
    renderCharts(currentResults);
  }

  if (path === '/') {
    // Hero animations
    document.querySelectorAll('.hero-content > *').forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      setTimeout(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, 100 + i * 120);
    });
  }
});

// ── GPS & Weather Functions ──────────────────────────────────────────
async function detectLocation() {
  const btn = document.getElementById('gpsBtn');
  if (!btn) return;

  if (!navigator.geolocation) {
    showToast("Geolocation is not supported by your browser.", "error");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '⌛ Detecting...';

  navigator.geolocation.getCurrentPosition(async (position) => {
    const lat = position.coords.latitude.toFixed(2);
    const lon = position.coords.longitude.toFixed(2);
    
    const weatherEl = document.getElementById('liveWeather');
    if (weatherEl) weatherEl.classList.remove('hidden');
    const locEl = document.getElementById('weatherLoc');
    if (locEl) locEl.textContent = `Lat: ${lat}, Lon: ${lon} (Nearby)`;
    
    await fetchWeather(lat, lon);
    
    btn.disabled = false;
    btn.innerHTML = '📍 Use My Location';
    showToast("Location detected successfully!", "success");
    
    const locationSel = document.getElementById('location');
    if (locationSel) {
        locationSel.value = "Maharashtra"; // Mocking state
        locationSel.dispatchEvent(new Event('change'));
    }
  }, (err) => {
    btn.disabled = false;
    btn.innerHTML = '📍 Use My Location';
    showToast("Could not access location.", "warning");
  });
}

function selectState(state) {
  const select = document.getElementById('location');
  if (select) {
    select.value = state;
    select.dispatchEvent(new Event('change'));
    showToast(`Loaded climate data for ${state}`, "success");
    select.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function fetchWeather(lat, lon) {
  const mockWeather = {
    temp: Math.floor(Math.random() * (35 - 20) + 20),
    humidity: Math.floor(Math.random() * (80 - 40) + 40),
    wind: Math.floor(Math.random() * 15 + 2),
    condition: ['Sunny', 'Partly Cloudy', 'Overcast'][Math.floor(Math.random()*3)]
  };
  setTimeout(() => updateWeatherUI(mockWeather), 800);
}

function updateWeatherUI(data) {
  const tempEl = document.getElementById('weatherTemp');
  const humEl = document.getElementById('weatherHum');
  const windEl = document.getElementById('weatherWind');
  const iconEl = document.getElementById('weatherIcon');

  if (tempEl) tempEl.textContent = `${data.temp}°C`;
  if (humEl) humEl.textContent = `${data.humidity}%`;
  if (windEl) windEl.textContent = `${data.wind} km/h`;
  
  const iconMap = { 'Sunny': '☀️', 'Partly Cloudy': '⛅', 'Overcast': '☁️' };
  if (iconEl) iconEl.textContent = iconMap[data.condition] || '🌡️';
  
  const formTemp = document.getElementById('temperature');
  const formTempSlider = document.getElementById('temperatureSlider');
  if (formTemp) formTemp.value = data.temp;
  if (formTempSlider) {
      formTempSlider.value = data.temp;
      formTempSlider.dispatchEvent(new Event('input'));
  }
}

// ── AI Plant Doctor Functions ──────────────────────────────────────────
function handleLeafUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('leafPreview').src = e.target.result;
    document.getElementById('previewContainer').classList.remove('hidden');
    document.getElementById('dropZone').classList.add('hidden');
    document.getElementById('doctorResult').classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

function resetScanner() {
  document.getElementById('dropZone').classList.remove('hidden');
  document.getElementById('previewContainer').classList.add('hidden');
  document.getElementById('doctorResult').classList.add('hidden');
  document.getElementById('leafUpload').value = '';
}

function analyzeLeaf() {
  const btn = document.getElementById('analyzeBtn');
  const scanLine = document.querySelector('.scan-line');
  
  btn.disabled = true;
  btn.innerHTML = '🧪 Sequencing DNA...';
  if (scanLine) scanLine.style.display = 'block';

  // Hit backend for mock AI logic
  fetch('/api/doctor/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'image' })
  })
  .then(res => res.json())
  .then(data => {
    // Multi-stage fake animations before showing result
    setTimeout(() => { btn.innerHTML = '🔍 Mapping Pathogens...'; }, 1000);
    setTimeout(() => { btn.innerHTML = '🤖 Running AI Inference...'; }, 2000);

    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '⚡ Analyze Plant Health';
      if (scanLine) scanLine.style.display = 'none';
      
      document.getElementById('issueName').textContent = data.name;
      document.getElementById('confFill').style.width = data.confidence + '%';
      document.getElementById('confVal').textContent = data.confidence + '%';
      
      const treatList = document.getElementById('treatmentList');
      if (treatList) {
        treatList.innerHTML = data.treatments.map(t => `<li>${t}</li>`).join('');
      }
      const preventionBox = document.querySelector('.prevention-text');
      if (preventionBox) preventionBox.textContent = data.prevention;
      
      const resultBox = document.getElementById('doctorResult');
      resultBox.classList.remove('hidden');
      resultBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      showToast("Analysis complete! Solution generated.", "success");
    }, 3000);
  })
  .catch(err => {
    console.error(err);
    btn.disabled = false;
    btn.innerHTML = '⚡ Analyze Plant Health';
    if (scanLine) scanLine.style.display = 'none';
    showToast("Error analyzing image.", "error");
  });
}

// ── AI Chatbot Functions (Global & Doctor Page) ───────────────────────
function toggleChat() {
  const window = document.getElementById('chatWindow');
  const trigger = document.querySelector('.chat-trigger');
  if (!window) return;
  
  if (window.classList.contains('hidden')) {
    window.classList.remove('hidden');
    trigger.innerHTML = '✕';
    document.getElementById('chatInput').focus();
  } else {
    window.classList.add('hidden');
    trigger.innerHTML = '💬';
  }
}

function sendMessage() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;

  const container = document.getElementById('chatMessages');
  addMessage(container, msg, 'user');
  input.value = '';

  // Mock AI response for floating chat
  setTimeout(() => {
    addMessage(container, getAIResponse(msg), 'ai');
  }, 800);
}

// Doctor Page Inline Chat
async function sendDoctorMessage() {
  const input = document.getElementById('doctorChatInput');
  const msg = input.value.trim();
  if (!msg) return;

  const container = document.getElementById('doctorChatMessages');
  const indicator = document.getElementById('typingIndicator');

  addMessage(container, msg, 'user', true);
  input.value = '';
  
  if (indicator) indicator.classList.remove('hidden');
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch('/api/doctor/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', text: msg })
    });
    const data = await res.json();
    
    if (indicator) indicator.classList.add('hidden');
    addMessage(container, data.response || "I couldn't process that.", 'ai', true);
  } catch (err) {
    if (indicator) indicator.classList.add('hidden');
    addMessage(container, "Sorry, my servers are currently down.", 'ai', true);
    console.error(err);
  }
}

function addMessage(container, text, type, isDoctor = false) {
  if (!container) return;
  const div = document.createElement('div');
  div.className = `msg msg-${type}`;
  
  const avatar = type === 'ai' ? '🤖' : '👤';
  
  if (isDoctor) {
    div.innerHTML = `
      <div class="avatar">${avatar}</div>
      <div class="bubble">${text}</div>
    `;
  } else {
    div.textContent = text;
  }
  
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function getAIResponse(query) {
  query = query.toLowerCase();
  if (query.includes('yellow spots')) return "This sounds like **Early Blight (Alternaria solani)**. Common symptoms are dark spots with concentric rings. Treat with copper-based fungicide and remove lower leaves.";
  if (query.includes('tomato')) return "Tomato plants thrive in warm, well-drained soil. They are prone to late blight in high-humidity seasons.";
  if (query.includes('soil')) return "Most crops prefer a pH of 6.0 to 7.0 (slightly acidic). Have you done a soil test recently?";
  if (query.includes('fertilizer')) return "Nitrogen (N) is key for leafy growth, Phosphorus (P) for roots, and Potassium (K) for fruit quality. Use a balanced 10-10-10 for general gardening.";
  return "That's a specific agricultural concern! I recommend scanning a leaf image here for a detailed DNA-level diagnosis.";
}

// ── Voice Integration Logic ──────────────────────────────────────────
let recognition;
let isRecording = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';

    recognition.onstart = () => {
        isRecording = true;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording');
        showToast("Listening...", "info");
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const input = document.getElementById('doctorChatInput');
        if (input) {
            input.value = transcript;
            input.focus();
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        stopRecording();
        showToast("Could not recognize speech.", "warning");
    };

    recognition.onend = () => {
        stopRecording();
    };
}

function toggleSpeech() {
    if (!recognition) {
        showToast("Speech recognition not supported.", "error");
        return;
    }

    if (isRecording) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

function stopRecording() {
    isRecording = false;
    const micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.classList.remove('recording');
}
