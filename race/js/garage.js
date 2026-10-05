/**
 * VELOCITY RUSH – Garage UI
 * Renders car list, upgrade system, and customization panel.
 */

const GarageUI = (() => {
  let activeTab = 'cars';
  let selectedCar = null;

  function init() {
    // Tab switching
    document.querySelectorAll('.garage-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.garage-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        render();
      });
    });
  }

  function show() {
    updateCoinsDisplay();
    selectedCar = SaveSystem.get().selectedCar;
    activeTab = 'cars';
    document.querySelectorAll('.garage-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'cars'));
    render();
    document.getElementById('garage-screen').classList.remove('hidden');
  }

  function hide() {
    document.getElementById('garage-screen').classList.add('hidden');
  }

  function updateCoinsDisplay() {
    document.getElementById('garage-coin-val').textContent = SaveSystem.get().coins.toLocaleString();
  }

  function render() {
    const container = document.getElementById('garage-tab-content');
    if (!container) return;
    container.innerHTML = '';

    if (activeTab === 'cars') renderCars(container);
    else if (activeTab === 'upgrades') renderUpgrades(container);
    else if (activeTab === 'customize') renderCustomize(container);
  }

  // ── Cars ──────────────────────────────────────────────────────

  function renderCars(container) {
    const save = SaveSystem.get();
    const grid = document.createElement('div');
    grid.className = 'car-grid';

    // Group by class
    const classes = [...new Set(CONFIG.cars.map(c => c.class))];
    classes.forEach(cls => {
      const carsInClass = CONFIG.cars.filter(c => c.class === cls);
      const section = document.createElement('div');
      section.style.cssText = 'grid-column: 1/-1; display:contents;';

      const title = document.createElement('div');
      title.style.cssText = 'grid-column:1/-1; font-family:var(--font-race); font-size:0.75rem; letter-spacing:0.2em; color:rgba(255,255,255,0.3); margin-top:1rem; text-transform:uppercase;';
      title.textContent = cls;
      grid.appendChild(title);

      carsInClass.forEach(car => {
        const owned = save.ownedCars.includes(car.id);
        const locked = !owned && car.unlockLevel > save.level;
        const selected = save.selectedCar === car.id;
        const canAfford = save.coins >= car.price;

        const card = document.createElement('div');
        card.className = `car-card ${selected ? 'selected' : ''} ${locked ? 'locked-car' : ''}`;

        const stats = car.stats;
        const maxStat = 100;
        card.innerHTML = `
          ${owned ? '<div class="car-own-badge">OWNED</div>' : ''}
          ${selected ? '<div class="car-own-badge" style="background:var(--gold);color:#000;">ACTIVE</div>' : ''}
          <div class="car-icon">${car.emoji}</div>
          <div class="car-name">${car.name}</div>
          <div class="car-class">${car.class}</div>
          <div class="car-stats-mini">
            ${[['SPD', stats.topSpeed],['ACC', stats.acceleration],['HDL', stats.handling],['GRP', stats.grip]].map(([label, val]) => `
              <div class="stat-bar-row">
                <span style="width:32px">${label}</span>
                <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${val}%"></div></div>
              </div>`).join('')}
          </div>
          ${!owned
            ? (locked
                ? `<div class="car-price">🔒 Level ${car.unlockLevel}</div>`
                : `<div class="car-price" style="color:${canAfford ? 'var(--gold)' : 'var(--red)'}">🪙 ${car.price.toLocaleString()}</div>`)
            : selected ? '' : '<div class="car-price" style="color:var(--green)">✓ Select</div>'
          }
        `;

        if (!locked) {
          card.addEventListener('click', () => {
            if (owned) {
              SaveSystem.selectCar(car.id);
              selectedCar = car.id;
              AudioEngine.playMenuClick();
              render();
            } else if (canAfford) {
              // Buy confirmation
              if (confirm(`Buy ${car.name} for ${car.price.toLocaleString()} coins?`)) {
                if (SaveSystem.spendCoins(car.price)) {
                  SaveSystem.unlockCar(car.id);
                  SaveSystem.selectCar(car.id);
                  selectedCar = car.id;
                  AudioEngine.playVictory();
                  updateCoinsDisplay();
                  render();
                }
              }
            } else {
              alert('Not enough coins!');
            }
          });
        }

        grid.appendChild(card);
      });
    });

    container.appendChild(grid);
  }

  // ── Upgrades ──────────────────────────────────────────────────

  function renderUpgrades(container) {
    const save = SaveSystem.get();
    const carId = save.selectedCar;
    const carCfg = CONFIG.cars.find(c => c.id === carId);
    if (!carCfg) {
      container.innerHTML = '<p style="color:rgba(255,255,255,0.4);padding:2rem;">Select a car first.</p>';
      return;
    }

    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom:1.5rem; font-family:var(--font-race); color:var(--primary);';
    header.textContent = `Upgrading: ${carCfg.name}`;
    container.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'upgrade-grid';

    CONFIG.upgrades.forEach(upg => {
      const level = SaveSystem.getUpgradeLevel(carId, upg.id);
      const maxLevel = upg.maxLevel;
      const cost = upg.baseCost * (level + 1);
      const canAfford = save.coins >= cost;
      const maxed = level >= maxLevel;

      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `
        <div class="upgrade-header">
          <div class="upgrade-name">${upg.emoji} ${upg.name}</div>
          <div class="upgrade-level">Lv ${level}/${maxLevel}</div>
        </div>
        <div class="upgrade-bar-row">
          ${Array(maxLevel).fill(0).map((_, i) => `
            <div class="upgrade-pip ${i < level ? (maxed && i === maxLevel-1 ? 'filled max' : 'filled') : ''}"></div>
          `).join('')}
        </div>
        <button class="upgrade-btn" ${maxed || !canAfford ? 'disabled' : ''}>
          ${maxed ? 'MAX LEVEL' : `Upgrade 🪙 ${cost.toLocaleString()}`}
        </button>
      `;

      const btn = card.querySelector('.upgrade-btn');
      if (!maxed && canAfford) {
        btn.addEventListener('click', () => {
          const success = SaveSystem.upgradeItem(carId, upg.id);
          if (success) {
            AudioEngine.playCoinPickup();
            updateCoinsDisplay();
            renderUpgrades(container);
          }
        });
      }

      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  // ── Customize ─────────────────────────────────────────────────

  function renderCustomize(container) {
    const save = SaveSystem.get();
    const carId = save.selectedCar;
    const custom = SaveSystem.getCustomization(carId);

    // Body Color
    const colorSection = document.createElement('div');
    colorSection.className = 'custom-section';
    colorSection.innerHTML = `<h3>Body Color</h3>`;
    const swatches = document.createElement('div');
    swatches.className = 'color-swatches';

    CONFIG.bodyColors.forEach(col => {
      const swatch = document.createElement('div');
      swatch.className = `color-swatch${custom.bodyColor === col.hex ? ' selected' : ''}`;
      swatch.style.background = '#' + col.hex.toString(16).padStart(6, '0');
      swatch.title = col.name;
      swatch.addEventListener('click', () => {
        SaveSystem.setCustomization(carId, 'bodyColor', col.hex);
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        AudioEngine.playMenuClick();
      });
      swatches.appendChild(swatch);
    });
    colorSection.appendChild(swatches);
    container.appendChild(colorSection);

    // Neon Color
    const neonSection = document.createElement('div');
    neonSection.className = 'custom-section';
    neonSection.innerHTML = `<h3>Neon Underglow</h3>`;
    const neonSwatches = document.createElement('div');
    neonSwatches.className = 'color-swatches';
    const neons = [0x00e5ff, 0xff3d00, 0x7c4dff, 0x00e676, 0xffd600, 0xff1744, 0xf06292];
    neons.forEach(col => {
      const swatch = document.createElement('div');
      swatch.className = `color-swatch${custom.neonColor === col ? ' selected' : ''}`;
      swatch.style.background = '#' + col.toString(16).padStart(6, '0');
      swatch.style.boxShadow = '0 0 10px #' + col.toString(16).padStart(6, '0');
      swatch.addEventListener('click', () => {
        SaveSystem.setCustomization(carId, 'neonColor', col);
        document.querySelectorAll('.custom-section:nth-child(2) .color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        AudioEngine.playMenuClick();
      });
      neonSwatches.appendChild(swatch);
    });
    neonSection.appendChild(neonSwatches);
    container.appendChild(neonSection);

    // Preview text
    const preview = document.createElement('div');
    preview.style.cssText = 'margin-top:2rem; padding:1rem; background:rgba(0,229,255,0.05); border:1px solid var(--border); border-radius:8px; text-align:center; color:rgba(255,255,255,0.4); font-size:0.85rem;';
    preview.textContent = 'Changes apply when you start your next race.';
    container.appendChild(preview);
  }

  return { init, show, hide };
})();
