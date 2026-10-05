/**
 * VELOCITY RUSH – Game Configuration & Constants
 * All tunable values in one place for easy tweaking.
 */

const CONFIG = {
  // Physics
  physics: {
    gravity:           9.81,
    groundFriction:    0.02,
    airDrag:           0.001,
    driftFriction:     0.95,
    brakePower:        0.06,
    nitroMultiplier:   1.8,
    maxSteerAngle:     0.045,
    steerReturnSpeed:  0.08,
    suspensionStrength:0.3,
    collisionRebound:  0.4,
  },

  // Gameplay
  gameplay: {
    defaultLaps:        3,
    defaultOpponents:   4,
    coinPickupRadius:   6,
    powerupPickupRadius:7,
    nitroRechargeRate:  0.003,
    nitroDrainRate:     0.018,
    coinValue:          10,
    lapXP:              50,
    positionXP:        [200, 150, 100, 70, 50, 30, 20, 10],
  },

  // Rendering
  render: {
    shadowMapSize:  1024,
    bloomStrength:  0.6,
    bloomRadius:    0.4,
    bloomThreshold: 0.85,
    fov:            65,
    nearPlane:      0.1,
    farPlane:       1000,
    fogNear:        200,
    fogFar:         700,
  },

  // Audio
  audio: {
    masterVolume:   0.7,
    musicVolume:    0.4,
    sfxVolume:      0.8,
    engineBaseFreq: 80,
    engineMaxFreq:  260,
  },

  // Difficulty modifiers
  difficulty: {
    easy:   { aiSpeed: 0.65, aiError: 0.08 },
    medium: { aiSpeed: 0.80, aiError: 0.04 },
    hard:   { aiSpeed: 0.92, aiError: 0.02 },
    expert: { aiSpeed: 1.02, aiError: 0.01 },
  },

  // Track definitions
  tracks: [
    {
      id: 'city',
      name: 'Metro Circuit',
      env: 'city',
      emoji: '🏙',
      laps: 3,
      length: 'Medium',
      color: 0x334455,
      gradient: ['#1a2a3a', '#2a3a4a'],
      unlockLevel: 1,
      bestLap: null,
    },
    {
      id: 'desert',
      name: 'Desert Run',
      env: 'desert',
      emoji: '🏜',
      laps: 3,
      length: 'Long',
      color: 0x8B7355,
      gradient: ['#4a3020', '#7a6040'],
      unlockLevel: 2,
      bestLap: null,
    },
    {
      id: 'forest',
      name: 'Forest Rally',
      env: 'forest',
      emoji: '🌲',
      laps: 3,
      length: 'Short',
      color: 0x2D5A27,
      gradient: ['#0d2010', '#1a3a1a'],
      unlockLevel: 3,
      bestLap: null,
    },
    {
      id: 'snow',
      name: 'Alpine Pass',
      env: 'snow',
      emoji: '🏔',
      laps: 3,
      length: 'Medium',
      color: 0xCCDDEE,
      gradient: ['#c0d8f0', '#e0f0ff'],
      unlockLevel: 4,
      bestLap: null,
    },
    {
      id: 'coastal',
      name: 'Coastal Highway',
      env: 'coastal',
      emoji: '🌊',
      laps: 3,
      length: 'Long',
      color: 0x1A6B9A,
      gradient: ['#0a2a4a', '#1a4a7a'],
      unlockLevel: 5,
      bestLap: null,
    },
    {
      id: 'night',
      name: 'Neon Night City',
      env: 'night',
      emoji: '🌙',
      laps: 3,
      length: 'Medium',
      color: 0x110022,
      gradient: ['#110022', '#220044'],
      unlockLevel: 6,
      bestLap: null,
    },
    {
      id: 'volcano',
      name: 'Volcanic Drift',
      env: 'volcano',
      emoji: '🌋',
      laps: 3,
      length: 'Short',
      color: 0x3D1010,
      gradient: ['#2a0808', '#4a1010'],
      unlockLevel: 8,
      bestLap: null,
    },
    {
      id: 'industrial',
      name: 'Industrial Zone',
      env: 'industrial',
      emoji: '🏭',
      laps: 3,
      length: 'Long',
      color: 0x333344,
      gradient: ['#1a1a2a', '#2a2a3a'],
      unlockLevel: 10,
      bestLap: null,
    },
    {
      id: 'countryside',
      name: 'Countryside Classic',
      env: 'countryside',
      emoji: '🌾',
      laps: 3,
      length: 'Very Long',
      color: 0x4A7A2A,
      gradient: ['#2a4a10', '#3a6a20'],
      unlockLevel: 12,
      bestLap: null,
    },
  ],

  // Car definitions (20 vehicles)
  cars: [
    // HATCHBACK
    {
      id: 'hatch1', name: 'City Spark', class: 'Hatchback', emoji: '🚗',
      price: 0, unlockLevel: 1, owned: true,
      stats: { topSpeed: 45, acceleration: 38, handling: 60, weight: 40, grip: 58, nitro: 45 },
      color: 0x2196F3, bodyH: 0.55, bodyW: 1.7, bodyL: 3.2,
    },
    {
      id: 'hatch2', name: 'Hot Pocket', class: 'Hatchback', emoji: '🚗',
      price: 5000, unlockLevel: 2, owned: false,
      stats: { topSpeed: 52, acceleration: 48, handling: 68, weight: 38, grip: 62, nitro: 50 },
      color: 0xFF5722, bodyH: 0.52, bodyW: 1.72, bodyL: 3.3,
    },

    // SEDAN
    {
      id: 'sedan1', name: 'Cruise Master', class: 'Sedan', emoji: '🚙',
      price: 8000, unlockLevel: 3, owned: false,
      stats: { topSpeed: 55, acceleration: 42, handling: 52, weight: 55, grip: 55, nitro: 48 },
      color: 0x607D8B, bodyH: 0.58, bodyW: 1.8, bodyL: 3.8,
    },
    {
      id: 'sedan2', name: 'Executive GT', class: 'Sedan', emoji: '🚙',
      price: 15000, unlockLevel: 4, owned: false,
      stats: { topSpeed: 62, acceleration: 50, handling: 56, weight: 60, grip: 58, nitro: 55 },
      color: 0x37474F, bodyH: 0.57, bodyW: 1.85, bodyL: 4.0,
    },

    // SPORTS
    {
      id: 'sport1', name: 'Apex Racer', class: 'Sports', emoji: '🏎',
      price: 25000, unlockLevel: 5, owned: false,
      stats: { topSpeed: 72, acceleration: 68, handling: 75, weight: 45, grip: 72, nitro: 65 },
      color: 0xE53935, bodyH: 0.48, bodyW: 1.85, bodyL: 4.1,
    },
    {
      id: 'sport2', name: 'Track Hawk', class: 'Sports', emoji: '🏎',
      price: 35000, unlockLevel: 6, owned: false,
      stats: { topSpeed: 78, acceleration: 75, handling: 80, weight: 42, grip: 76, nitro: 70 },
      color: 0xFFD600, bodyH: 0.46, bodyW: 1.88, bodyL: 4.2,
    },
    {
      id: 'sport3', name: 'Cobra Strike', class: 'Sports', emoji: '🏎',
      price: 45000, unlockLevel: 7, owned: false,
      stats: { topSpeed: 82, acceleration: 80, handling: 78, weight: 44, grip: 78, nitro: 72 },
      color: 0x00E5FF, bodyH: 0.46, bodyW: 1.9, bodyL: 4.3,
    },

    // SUPERCAR
    {
      id: 'super1', name: 'Viper X', class: 'Supercar', emoji: '🏎',
      price: 75000, unlockLevel: 9, owned: false,
      stats: { topSpeed: 88, acceleration: 85, handling: 82, weight: 48, grip: 82, nitro: 78 },
      color: 0x6A1B9A, bodyH: 0.44, bodyW: 1.95, bodyL: 4.4,
    },
    {
      id: 'super2', name: 'Phantom GT', class: 'Supercar', emoji: '🏎',
      price: 100000, unlockLevel: 11, owned: false,
      stats: { topSpeed: 92, acceleration: 88, handling: 85, weight: 50, grip: 84, nitro: 82 },
      color: 0x1B5E20, bodyH: 0.42, bodyW: 1.98, bodyL: 4.5,
    },
    {
      id: 'super3', name: 'Nemesis R', class: 'Supercar', emoji: '🏎',
      price: 120000, unlockLevel: 13, owned: false,
      stats: { topSpeed: 95, acceleration: 90, handling: 87, weight: 52, grip: 86, nitro: 85 },
      color: 0xBF360C, bodyH: 0.42, bodyW: 2.0, bodyL: 4.6,
    },

    // HYPERCAR
    {
      id: 'hyper1', name: 'Apex Omega', class: 'Hypercar', emoji: '🚀',
      price: 200000, unlockLevel: 15, owned: false,
      stats: { topSpeed: 98, acceleration: 95, handling: 90, weight: 40, grip: 90, nitro: 90 },
      color: 0xFF6D00, bodyH: 0.40, bodyW: 2.0, bodyL: 4.7,
    },
    {
      id: 'hyper2', name: 'Zeus 1000', class: 'Hypercar', emoji: '🚀',
      price: 300000, unlockLevel: 18, owned: false,
      stats: { topSpeed: 100, acceleration: 98, handling: 92, weight: 38, grip: 92, nitro: 95 },
      color: 0x000000, bodyH: 0.38, bodyW: 2.05, bodyL: 4.8,
    },

    // MUSCLE CAR
    {
      id: 'muscle1', name: 'Iron Fury', class: 'Muscle Car', emoji: '💪',
      price: 40000, unlockLevel: 6, owned: false,
      stats: { topSpeed: 75, acceleration: 82, handling: 52, weight: 75, grip: 60, nitro: 80 },
      color: 0xB71C1C, bodyH: 0.55, bodyW: 1.95, bodyL: 4.5,
    },
    {
      id: 'muscle2', name: 'Thunder Bolt', class: 'Muscle Car', emoji: '💪',
      price: 60000, unlockLevel: 8, owned: false,
      stats: { topSpeed: 80, acceleration: 88, handling: 55, weight: 78, grip: 62, nitro: 85 },
      color: 0x4A148C, bodyH: 0.56, bodyW: 2.0, bodyL: 4.6,
    },
    {
      id: 'muscle3', name: 'American Storm', class: 'Muscle Car', emoji: '💪',
      price: 80000, unlockLevel: 10, owned: false,
      stats: { topSpeed: 84, acceleration: 92, handling: 58, weight: 80, grip: 65, nitro: 88 },
      color: 0x1A237E, bodyH: 0.57, bodyW: 2.05, bodyL: 4.7,
    },

    // ELECTRIC CAR
    {
      id: 'elec1', name: 'Volt Storm', class: 'Electric', emoji: '⚡',
      price: 55000, unlockLevel: 7, owned: false,
      stats: { topSpeed: 85, acceleration: 95, handling: 78, weight: 55, grip: 80, nitro: 100 },
      color: 0x00BCD4, bodyH: 0.50, bodyW: 1.90, bodyL: 4.2,
    },
    {
      id: 'elec2', name: 'Quantum EV', class: 'Electric', emoji: '⚡',
      price: 90000, unlockLevel: 12, owned: false,
      stats: { topSpeed: 92, acceleration: 98, handling: 82, weight: 52, grip: 84, nitro: 100 },
      color: 0x76FF03, bodyH: 0.48, bodyW: 1.92, bodyL: 4.3,
    },
    {
      id: 'elec3', name: 'Photon X', class: 'Electric', emoji: '⚡',
      price: 150000, unlockLevel: 16, owned: false,
      stats: { topSpeed: 96, acceleration: 100, handling: 85, weight: 50, grip: 88, nitro: 100 },
      color: 0xE040FB, bodyH: 0.46, bodyW: 1.95, bodyL: 4.4,
    },

    // BONUS / SECRET
    {
      id: 'special1', name: 'Shadow Ghost', class: 'Hypercar', emoji: '👻',
      price: 500000, unlockLevel: 20, owned: false,
      stats: { topSpeed: 100, acceleration: 100, handling: 100, weight: 30, grip: 95, nitro: 100 },
      color: 0x212121, bodyH: 0.36, bodyW: 2.1, bodyL: 5.0,
    },
    {
      id: 'special2', name: 'Gold Edition', class: 'Supercar', emoji: '👑',
      price: 999999, unlockLevel: 25, owned: false,
      stats: { topSpeed: 99, acceleration: 99, handling: 95, weight: 35, grip: 93, nitro: 98 },
      color: 0xFFD700, bodyH: 0.38, bodyW: 2.08, bodyL: 4.9,
    },
  ],

  // Upgrade definitions
  upgrades: [
    { id: 'engine',     name: 'Engine',     maxLevel: 5, baseCost: 2000, emoji: '⚙',  effect: 'topSpeed', perLevel: 5 },
    { id: 'brakes',     name: 'Brakes',     maxLevel: 5, baseCost: 1500, emoji: '🛑', effect: 'handling', perLevel: 4 },
    { id: 'nitro',      name: 'Nitro',      maxLevel: 5, baseCost: 1800, emoji: '⚡', effect: 'nitro',    perLevel: 8 },
    { id: 'tires',      name: 'Tires',      maxLevel: 5, baseCost: 2500, emoji: '⭕', effect: 'grip',     perLevel: 6 },
    { id: 'suspension', name: 'Suspension', maxLevel: 5, baseCost: 2000, emoji: '🔩', effect: 'handling', perLevel: 3 },
    { id: 'gearbox',    name: 'Gearbox',    maxLevel: 5, baseCost: 3000, emoji: '⚙',  effect: 'acceleration', perLevel: 5 },
  ],

  // Power-ups
  powerups: [
    { id: 'nitro_boost',  name: 'Nitro Boost',    emoji: '⚡', color: 0x7C4DFF, duration: 5000 },
    { id: 'coin_magnet',  name: 'Coin Magnet',     emoji: '🧲', color: 0xFFD600, duration: 8000 },
    { id: 'repair',       name: 'Repair Kit',      emoji: '🔧', color: 0x00E676, duration: 0 },
    { id: 'shield',       name: 'Shield',          emoji: '🛡', color: 0x00E5FF, duration: 6000 },
    { id: 'double_coins', name: 'Double Coins',    emoji: '💰', color: 0xFFD600, duration: 10000 },
    { id: 'slow_mo',      name: 'Slow Motion',     emoji: '⏱', color: 0xE040FB, duration: 4000 },
    { id: 'turbo',        name: 'Turbo Engine',    emoji: '🚀', color: 0xFF3D00, duration: 6000 },
    { id: 'instant_fix',  name: 'Instant Repair',  emoji: '🏥', color: 0x69F0AE, duration: 0 },
  ],

  // Body colors for customization
  bodyColors: [
    { name: 'Signal Red',    hex: 0xE53935 },
    { name: 'Ocean Blue',    hex: 0x1E88E5 },
    { name: 'Midnight Black',hex: 0x212121 },
    { name: 'Pearl White',   hex: 0xF5F5F5 },
    { name: 'Racing Yellow', hex: 0xFDD835 },
    { name: 'Toxic Green',   hex: 0x76FF03 },
    { name: 'Royal Purple',  hex: 0x7B1FA2 },
    { name: 'Burnt Orange',  hex: 0xFF6D00 },
    { name: 'Gunmetal',      hex: 0x546E7A },
    { name: 'Rose Gold',     hex: 0xFFB2B2 },
    { name: 'Neon Cyan',     hex: 0x00E5FF },
    { name: 'Matte Olive',   hex: 0x827717 },
  ],

  // AI names
  aiNames: [
    'Ghost Rider', 'Speed Demon', 'Turbo Rex', 'Blaze King',
    'Nitro Storm', 'Drift Queen', 'Iron Wolf', 'Shadow Ace',
    'Apex Hunter', 'Vortex', 'Phantom', 'Raptor',
  ],

  // Weather modes
  weather: {
    sunny:  { fog: false, fogDensity: 0, rain: false, snow: false, skyColor: 0x87CEEB, grip: 1.0, visibility: 1.0 },
    rain:   { fog: true, fogDensity: 0.003, rain: true, snow: false, skyColor: 0x607D8B, grip: 0.75, visibility: 0.8 },
    fog:    { fog: true, fogDensity: 0.006, rain: false, snow: false, skyColor: 0x90A4AE, grip: 0.9, visibility: 0.6 },
    night:  { fog: false, fogDensity: 0, rain: false, snow: false, skyColor: 0x000814, grip: 0.92, visibility: 0.9 },
    snow:   { fog: true, fogDensity: 0.004, rain: false, snow: true, skyColor: 0xCFD8DC, grip: 0.6, visibility: 0.75 },
  },
};
