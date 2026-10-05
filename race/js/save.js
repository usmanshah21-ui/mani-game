/**
 * VELOCITY RUSH – Save System (localStorage)
 * Handles all persistence: coins, cars, upgrades, settings, stats, best laps.
 */

const SaveSystem = (() => {
  const KEY = 'velocity_rush_save_v2';

  const defaults = () => ({
    coins: 5000,
    xp: 0,
    level: 1,
    ownedCars: ['hatch1'],
    selectedCar: 'hatch1',
    upgrades: {},          // { carId: { upgradeId: level } }
    customizations: {},    // { carId: { bodyColor, rimStyle, neonColor } }
    settings: {
      masterVolume: 0.7,
      musicVolume: 0.4,
      sfxVolume: 0.8,
      graphics: 'auto',
      shadows: true,
      bloom: true,
      motionBlur: false,
      cameraShake: true,
      showFPS: true,
    },
    bestLaps: {},          // { trackId: milliseconds }
    statistics: {
      racesPlayed: 0,
      racesWon: 0,
      totalCoins: 0,
      totalDistance: 0,
      totalDrifts: 0,
      bestSpeed: 0,
    },
    achievements: [],
    leaderboard: [],       // [{ name, trackId, time, date }]
  });

  let data = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        data = Object.assign(defaults(), JSON.parse(raw));
      } else {
        data = defaults();
        save();
      }
    } catch (e) {
      console.warn('[Save] Failed to load, resetting.', e);
      data = defaults();
    }
    return data;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Save] Failed to save:', e);
    }
  }

  function reset() {
    data = defaults();
    save();
    return data;
  }

  function get() { return data; }

  function addCoins(amount) {
    data.coins += amount;
    data.statistics.totalCoins += amount;
    save();
  }

  function spendCoins(amount) {
    if (data.coins < amount) return false;
    data.coins -= amount;
    save();
    return true;
  }

  function addXP(amount) {
    data.xp += amount;
    // Level up: 1000 * level XP needed
    const xpNeeded = data.level * 1000;
    if (data.xp >= xpNeeded) {
      data.xp -= xpNeeded;
      data.level++;
      save();
      return true; // leveled up
    }
    save();
    return false;
  }

  function unlockCar(carId) {
    if (!data.ownedCars.includes(carId)) {
      data.ownedCars.push(carId);
      save();
    }
  }

  function selectCar(carId) {
    if (data.ownedCars.includes(carId)) {
      data.selectedCar = carId;
      save();
    }
  }

  function getUpgradeLevel(carId, upgradeId) {
    if (!data.upgrades[carId]) return 0;
    return data.upgrades[carId][upgradeId] || 0;
  }

  function upgradeItem(carId, upgradeId) {
    if (!data.upgrades[carId]) data.upgrades[carId] = {};
    const current = data.upgrades[carId][upgradeId] || 0;
    const upgDef = CONFIG.upgrades.find(u => u.id === upgradeId);
    if (!upgDef || current >= upgDef.maxLevel) return false;
    const cost = upgDef.baseCost * (current + 1);
    if (!spendCoins(cost)) return false;
    data.upgrades[carId][upgradeId] = current + 1;
    save();
    return true;
  }

  function setCustomization(carId, key, value) {
    if (!data.customizations[carId]) data.customizations[carId] = {};
    data.customizations[carId][key] = value;
    save();
  }

  function getCustomization(carId) {
    return data.customizations[carId] || {};
  }

  function updateBestLap(trackId, timeMs) {
    const current = data.bestLaps[trackId];
    if (!current || timeMs < current) {
      data.bestLaps[trackId] = timeMs;
      save();
      return true; // new best
    }
    return false;
  }

  function addLeaderboardEntry(entry) {
    data.leaderboard.unshift(entry);
    // Keep top 50
    if (data.leaderboard.length > 50) data.leaderboard = data.leaderboard.slice(0, 50);
    save();
  }

  function updateStats(key, value) {
    if (key in data.statistics) {
      if (key === 'bestSpeed') {
        if (value > data.statistics.bestSpeed) data.statistics.bestSpeed = value;
      } else {
        data.statistics[key] += value;
      }
    }
    save();
  }

  function unlockAchievement(id) {
    if (!data.achievements.includes(id)) {
      data.achievements.push(id);
      save();
      return true;
    }
    return false;
  }

  function updateSetting(key, value) {
    data.settings[key] = value;
    save();
  }

  // Auto-save every 30s
  setInterval(() => { if (data) save(); }, 30000);

  return {
    load, save, reset, get,
    addCoins, spendCoins, addXP,
    unlockCar, selectCar,
    getUpgradeLevel, upgradeItem,
    setCustomization, getCustomization,
    updateBestLap, addLeaderboardEntry,
    updateStats, unlockAchievement, updateSetting,
  };
})();
