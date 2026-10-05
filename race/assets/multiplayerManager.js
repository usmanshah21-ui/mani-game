/**
 * Zephyr Reef Kart - Private P2P Multiplayer Manager (WebRTC via PeerJS)
 * Fully serverless, zero-config, low-latency private sessions with invite links & room codes.
 */

export class MultiplayerManager {
  static TOURNAMENT_POINTS = [15, 12, 10, 8, 6, 4];

  constructor() {
    this.peer = null;
    this.isHost = false;
    this.roomCode = '';
    this.state = 'IDLE'; // 'IDLE' | 'CONNECTING' | 'HOST_LOBBY' | 'GUEST_LOBBY' | 'COUNTDOWN' | 'RACING' | 'RESULTS'
    
    // Player details
    this.playerName = localStorage.getItem('zephyr_player_name') || ('Racer_' + Math.floor(100 + Math.random() * 900));
    this.selectedKart = localStorage.getItem('zephyr_kart') || 'nix';
    this.mySlot = 0;
    
    // Connections & party
    this.connections = new Map(); // peerId -> DataConnection
    this.hostConnection = null;   // For guests: DataConnection to Host
    this.players = [];            // [{ peerId, slot, name, kartId, isHost, ping, isAI, finishTime, rank }]
    this.peerSlots = new Map();       // Host: peerId -> slot assegnato al JOIN_REQUEST (binding anti-spoofing)
    this.spoofStrikes = new Map();    // Host: peerId -> violazioni del binding slot
    this.eventRateLimits = new Map(); // Host: peerId -> { eventType: [timestamp] } (anti-griefing)
    
    // Room settings & Grand Prix Playlist
    this.trackIndex = parseInt(localStorage.getItem('zephyr_track') || '0', 10);
    this.laps = 3;
    this.fillAI = true;

    // Tournament Playlist & Cumulative Standings
    this.playlistTracks = [this.trackIndex, (this.trackIndex + 1) % 24, (this.trackIndex + 2) % 24];
    this.playlistIndex = 0;
    this.tournamentScores = new Map(); // slot -> totalPoints
    this.lastRaceResults = [];         // [{ slot, name, kartId, rank, finishTime, pointsEarned, totalPoints }]
    this.isTournamentComplete = false;
    
    // Countdown state (5-second synchronized pre-race transition)
    this.countdownSec = 5;
    this.countdownTimer = null;

    // High-frequency sync buffer
    this.remoteStates = new Map(); // slot -> { x, y, z, yaw, pitch, roll, speed, steer, driftTier, isDrifting, boost, lap, dist, lastUpdate }
    this.lastBroadcastTime = 0;
    this.broadcastIntervalMs = 33; // ~30 Hz transmission rate
    
    // DOM Nametags & Emotes Layer
    this.nametagsLayer = null;
    this.nametagEls = new Map();   // slot -> HTMLElement
    this.emoteEls = new Map();     // slot -> { el, expireTime }
    
    // Callbacks for UI & Game Engine
    this.onLobbyUpdate = null;
    this.onRaceStart = null;
    this.onCountdownTick = null;
    this.onCountdownCancel = null;
    this.onItemUse = null;
    this.onRacerHit = null;
    this.onEmote = null;
    this.onPlayerFinish = null;
    this.onRematch = null;
    this.onTournamentStandings = null;
    this.onTournamentComplete = null;
    this.onError = null;
    this.onToast = null;
    
    // Heartbeat ping timer
    this.pingInterval = null;

    // Misurazioni RTT per la compensazione della sincronizzazione di partenza
    this.rttSamples = new Map(); // Host: peerId -> ultimo rtt misurato
    this.lastRtt = 0;            // Guest: ultimo rtt misurato verso l'host

    // Sync clock NTP-style (guest): stima di (orologio host - orologio guest) in ms,
    // presa dal campione con RTT minimo su una finestra scorrevole. Serve perche'
    // RACE_START_SYNC contiene un timestamp nel dominio Date.now() dell'host: senza
    // questa stima un dispositivo con l'orologio sfasato partirebbe in ritardo/anticipo.
    this.clockOffsetSamples = []; // [{ rtt, offset }]
    this.clockOffset = null;

    // Risultati di gara autorevoli (solo guest, da TOURNAMENT_STANDINGS_SYNC):
    // ordine di arrivo e tempi calcolati dall'host, usati dalla shell per il
    // ridisegno della schermata risultati.
    this.authRaceResults = null;

    this.initDOM();
  }

  initDOM() {
    let layer = document.getElementById('z-mp-nametags-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'z-mp-nametags-layer';
      layer.style.cssText = 'position: fixed; inset: 0; pointer-events: none; z-index: 8000; overflow: hidden;';
      document.body.appendChild(layer);
    }
    this.nametagsLayer = layer;
  }

  // Generate clean 4-digit room code: ZEPH-XXXX
  static generateRoomCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `ZEPH-${code}`;
  }

  static getPeerId(roomCode) {
    return `zephyr-reef-room-${roomCode.toUpperCase().trim()}`;
  }

  getInviteLink() {
    const loc = window.location;
    // Origin assente/opaco (iframe sandbox, file://): il chiamante mostrera' solo il codice
    if (!loc || !loc.origin || loc.origin === 'null' || loc.protocol === 'file:') {
      return '';
    }
    const base = loc.origin + loc.pathname;
    return `${base}#room=${encodeURIComponent(this.roomCode)}`;
  }

  allPlayersReady() {
    const humanPlayers = this.players.filter(p => !p.isAI);
    if (humanPlayers.length === 0) return false;
    return humanPlayers.every(p => p.isReady !== false);
  }

  setReady(isReady = true) {
    const me = this.players.find(p => p.slot === this.mySlot);
    if (me) me.isReady = !!isReady;
    if (this.isHost) {
      this.broadcastLobbyUpdate();
    } else {
      this.broadcastToAll({
        type: 'PLAYER_READY',
        slot: this.mySlot,
        isReady: !!isReady
      });
      this.notifyLobbyUpdate();
    }
  }

  toggleReady() {
    const me = this.players.find(p => p.slot === this.mySlot);
    const nextState = me ? !me.isReady : true;
    this.setReady(nextState);
    return nextState;
  }

  setPlayerName(name) {
    if (!name || !name.trim()) return;
    this.playerName = name.trim().slice(0, 16);
    localStorage.setItem('zephyr_player_name', this.playerName);
    if (this.state === 'HOST_LOBBY' || this.state === 'GUEST_LOBBY') {
      const me = this.players.find(p => p.slot === this.mySlot);
      if (me) me.name = this.playerName;
      if (this.isHost) {
        this.broadcastLobbyUpdate();
      } else {
        this.broadcastToAll({
          type: 'PLAYER_UPDATE',
          slot: this.mySlot,
          name: this.playerName,
          kartId: this.selectedKart,
          isReady: me ? me.isReady : false
        });
        this.notifyLobbyUpdate();
      }
    }
  }

  setSelectedKart(kartId) {
    this.selectedKart = kartId;
    localStorage.setItem('zephyr_kart', kartId);
    if (this.state === 'HOST_LOBBY' || this.state === 'GUEST_LOBBY') {
      const me = this.players.find(p => p.slot === this.mySlot);
      if (me) {
        me.kartId = kartId;
        // If guest changes kart, reset ready status so they confirm choice
        if (!this.isHost) {
          me.isReady = false;
        }
      }
      if (this.isHost) {
        this.broadcastLobbyUpdate();
      } else {
        this.broadcastToAll({
          type: 'PLAYER_UPDATE',
          slot: this.mySlot,
          name: this.playerName,
          kartId: this.selectedKart,
          isReady: me ? me.isReady : false
        });
        this.notifyLobbyUpdate();
      }
    }
  }

  setTrack(index) {
    this.trackIndex = parseInt(index, 10);
    if (!this.playlistTracks || this.playlistTracks.length === 0) {
      this.playlistTracks = [this.trackIndex];
    } else {
      this.playlistTracks[this.playlistIndex || 0] = this.trackIndex;
    }
    try { localStorage.setItem('zephyr_track', String(this.trackIndex)); } catch {}
    if (this.isHost) {
      this.broadcastToAll({
        type: 'TRACK_SYNC',
        trackIndex: this.trackIndex,
        laps: this.laps,
        playlistTracks: this.playlistTracks,
        playlistIndex: this.playlistIndex || 0
      });
      this.notifyLobbyUpdate();
    }
  }

  setPlaylist(tracks, laps = null) {
    if (Array.isArray(tracks) && tracks.length > 0) {
      this.playlistTracks = tracks.map(t => parseInt(t, 10));
    }
    if (laps !== null) {
      this.laps = Math.max(1, Math.min(5, parseInt(laps, 10)));
    }
    this.playlistIndex = 0;
    this.trackIndex = this.playlistTracks[0] ?? 0;
    try { localStorage.setItem('zephyr_track', String(this.trackIndex)); } catch {}
    if (this.isHost) {
      this.broadcastToAll({
        type: 'PLAYLIST_SYNC',
        trackIndex: this.trackIndex,
        laps: this.laps,
        playlistTracks: this.playlistTracks,
        playlistIndex: this.playlistIndex
      });
      this.notifyLobbyUpdate();
    }
  }

  setPlaylistCount(count) {
    const n = Math.max(1, Math.min(5, parseInt(count, 10)));
    const current = [...(this.playlistTracks || [0])];
    while (current.length < n) {
      const last = current[current.length - 1] ?? 0;
      current.push((last + 1) % 24);
    }
    const newTracks = current.slice(0, n);
    this.setPlaylist(newTracks, this.laps);
  }

  setPlaylistTrackAt(idx, trackId) {
    if (!this.playlistTracks) this.playlistTracks = [0];
    if (idx >= 0 && idx < this.playlistTracks.length) {
      this.playlistTracks[idx] = parseInt(trackId, 10);
      if (idx === 0) {
        this.trackIndex = this.playlistTracks[0];
        try { localStorage.setItem('zephyr_track', String(this.trackIndex)); } catch {}
      }
      if (this.isHost) {
        this.broadcastToAll({
          type: 'PLAYLIST_SYNC',
          trackIndex: this.trackIndex,
          laps: this.laps,
          playlistTracks: this.playlistTracks,
          playlistIndex: this.playlistIndex
        });
        this.notifyLobbyUpdate();
      }
    }
  }

  setLaps(laps) {
    this.laps = Math.max(1, Math.min(5, parseInt(laps, 10)));
    if (this.isHost) {
      this.broadcastToAll({
        type: 'TRACK_SYNC',
        trackIndex: this.trackIndex,
        laps: this.laps,
        playlistTracks: this.playlistTracks,
        playlistIndex: this.playlistIndex
      });
      this.notifyLobbyUpdate();
    }
  }

  handleRaceResults(results) {
    if (!Array.isArray(results) || results.length === 0) return;
    this.state = 'RESULTS';

    // Calculate points earned for each racer according to official rules [15, 12, 10, 8, 6, 4]
    const raceTable = results.map((r, idx) => {
      const slot = r.slot !== undefined ? r.slot : (r.id !== undefined ? r.id : idx);
      const rank = r.rank || (idx + 1);
      const pts = (MultiplayerManager.TOURNAMENT_POINTS || [15, 12, 10, 8, 6, 4])[rank - 1] || 4;
      const prevTotal = this.tournamentScores.get(slot) || 0;
      const newTotal = prevTotal + pts;
      this.tournamentScores.set(slot, newTotal);
      const playerObj = this.players.find(p => p.slot === slot);
      return {
        slot: slot,
        id: slot,
        name: playerObj?.name || r.name || `Pilota ${slot + 1}`,
        kartId: playerObj?.kartId || r.kartId || 'nix',
        rank: rank,
        finishTime: r.finishTime || r.time || 0,
        lastRacePoints: pts,
        pointsEarned: pts,
        totalPoints: newTotal,
        isPlayer: slot === this.mySlot,
        isHost: playerObj?.isHost || false
      };
    });

    // Sort cumulative standings by total points descending, then best rank
    const cumulativeStandings = [...raceTable].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return a.rank - b.rank;
    });

    const isFinalRace = this.playlistIndex >= this.playlistTracks.length - 1;
    this.isTournamentComplete = isFinalRace;
    this.lastRaceResults = raceTable;

    const payload = {
      type: 'TOURNAMENT_STANDINGS_SYNC',
      playlistIndex: this.playlistIndex,
      totalTracks: this.playlistTracks.length,
      currentTrackIndex: this.trackIndex,
      nextTrackIndex: !isFinalRace ? this.playlistTracks[this.playlistIndex + 1] : null,
      isFinalRace: isFinalRace,
      standings: cumulativeStandings,
      raceResults: raceTable
    };

    if (this.isHost) {
      this.broadcastToAll(payload);
      if (this.onTournamentStandings) {
        this.onTournamentStandings(payload);
      }
      if (isFinalRace && this.onTournamentComplete) {
        this.onTournamentComplete(payload);
      }
    }
    // Guest: lastRaceResults resta disponibile localmente (schermata risultati),
    // ma la classifica torneo pubblicata e' solo quella sincronizzata dall'host
    // via TOURNAMENT_STANDINGS_SYNC: pubblicare standings locali divergenti
    // era la fonte del doppio flash e delle classifiche incoerenti.
  }

  // True su un guest mentre countdown/gara sono attivi: il motore lo usa per
  // NON simulare localmente le AI (host-authoritative, vedi apply_sync_fixes.js)
  isGuestSim() {
    return !this.isHost && (this.state === 'RACING' || this.state === 'COUNTDOWN');
  }

  advanceToNextRace(countdownSec = 5) {
    if (!this.isHost) return false;
    if (this.playlistIndex + 1 >= this.playlistTracks.length) return false;

    this.playlistIndex++;
    this.trackIndex = this.playlistTracks[this.playlistIndex];
    try { localStorage.setItem('zephyr_track', String(this.trackIndex)); } catch {}

    const payload = {
      type: 'NEXT_TOURNAMENT_RACE',
      playlistIndex: this.playlistIndex,
      trackIndex: this.trackIndex,
      laps: this.laps,
      countdownSec: countdownSec,
      players: this.players,
      startTime: Date.now() + (countdownSec * 1000)
    };

    this.broadcastToAll(payload);
    this.handleCountdownStart(payload);
    return true;
  }

  resetTournament() {
    this.playlistIndex = 0;
    this.trackIndex = this.playlistTracks[0] ?? 0;
    try { localStorage.setItem('zephyr_track', String(this.trackIndex)); } catch {}
    this.tournamentScores.clear();
    this.lastRaceResults = [];
    this.isTournamentComplete = false;
    this.state = this.isHost ? 'HOST_LOBBY' : 'GUEST_LOBBY';

    for (const p of this.players) {
      if (!p.isHost && !p.isAI) p.isReady = false;
    }

    if (this.isHost) {
      this.broadcastToAll({
        type: 'TOURNAMENT_RESET',
        trackIndex: this.trackIndex,
        laps: this.laps,
        playlistTracks: this.playlistTracks,
        playlistIndex: this.playlistIndex,
        players: this.players
      });
      this.notifyLobbyUpdate();
    }
  }

  // --- HOST: CREATE PRIVATE ROOM ---
  createRoom(customCode = null) {
    this.leaveRoom();
    this.isHost = true;
    this.roomCode = customCode ? customCode.toUpperCase().trim() : MultiplayerManager.generateRoomCode();
    const hostPeerId = MultiplayerManager.getPeerId(this.roomCode);

    this.state = 'HOST_LOBBY';
    this.mySlot = 0;
    this.playlistIndex = 0;
    this.tournamentScores.clear();
    this.lastRaceResults = [];
    this.isTournamentComplete = false;
    this.players = [{
      peerId: hostPeerId,
      slot: 0,
      name: this.playerName,
      kartId: this.selectedKart,
      isHost: true,
      ping: 0,
      isAI: false,
      isReady: true
    }];

    this.notifyLobbyUpdate();

    this.initPeer(hostPeerId, () => {
      this.toast(`Stanza creata! Codice: ${this.roomCode}`);
      this.notifyLobbyUpdate();
      this.startHeartbeat();
    });
  }

  // --- GUEST: JOIN PRIVATE ROOM ---
  joinRoom(roomCode, customName = null) {
    this.leaveRoom();
    if (customName) this.setPlayerName(customName);
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase().trim();
    const hostPeerId = MultiplayerManager.getPeerId(this.roomCode);

    this.state = 'CONNECTING';
    this.notifyLobbyUpdate();
    const guestPeerId = `zephyr-guest-${Math.floor(10000 + Math.random() * 90000)}`;

    this.initPeer(guestPeerId, () => {
      this.toast(`Connessione alla stanza ${this.roomCode}...`);
      this._joinAttempts = 0;

      // Connessione alla stanza con watchdog: se la DataConnection non si apre
      // entro 5s (drop del signaling, candidato ICE lento, primo tentativo
      // morto), chiudi e riprova (max 3 tentativi, dentro il timeout UI del join).
      const attemptJoin = () => {
        if (this.state !== 'CONNECTING' || !this.peer || this.peer.destroyed) return;
        if (this._joinWatchdog) clearTimeout(this._joinWatchdog);

        const conn = this.peer.connect(hostPeerId, { reliable: true });
        this.hostConnection = conn;

        conn.on('open', () => {
          if (this._joinWatchdog) { clearTimeout(this._joinWatchdog); this._joinWatchdog = null; }
          this.toast('Connesso all\'Host! Invio dati pilota...');
          this.state = 'GUEST_LOBBY';
          this.notifyLobbyUpdate();
          this.safeSend(conn, {
            type: 'JOIN_REQUEST',
            name: this.playerName,
            kartId: this.selectedKart
          }, false);
        });

        conn.on('data', (data) => this.handleMessage(conn, data));
        conn.on('close', () => {
          this.toast('Disconnesso dalla stanza privata');
          this.leaveRoom();
        });
        conn.on('error', (err) => {
          console.error('Peer connection error:', err);
          this.toast('Errore di connessione alla stanza');
          this.leaveRoom();
        });

        this._joinWatchdog = setTimeout(() => {
          if (this.state === 'CONNECTING' && !conn.open) {
            this._joinAttempts = (this._joinAttempts || 0) + 1;
            console.warn(`[Multiplayer] Join retry #${this._joinAttempts} (DataConnection non aperta in 5s)`);
            if (this._joinAttempts < 3) {
              try { conn.close(); } catch (e) {}
              attemptJoin();
            }
          }
        }, 5000);
      };

      attemptJoin();
    });
  }

  initPeer(peerId, onOpen) {
    if (!window.Peer) {
      console.error('PeerJS is not loaded');
      this.toast('Modulo PeerJS non disponibile');
      return;
    }

    try {
      this.peer = new window.Peer(peerId, {
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        }
      });

      this._peerReconnectAttempted = false;

      this.peer.on('open', (id) => {
        console.log(`[Multiplayer] Peer initialized: ${id}`);
        this._peerReconnectAttempted = false;
        if (onOpen) onOpen(id);
      });

      // Signaling disconnesso: durante il join (CONNECTING) il signaling viene
      // riconnesso a ogni drop (i tentativi restano limitati dal timeout UI del
      // join): un drop del broker non deve uccidere il tentativo. Negli altri
      // stati resta il singolo reconnect (guard anti-loop).
      this.peer.on('disconnected', () => {
        console.warn('[Multiplayer] Peer disconnesso dal signaling server.');
        if (this.state !== 'CONNECTING' && this._peerReconnectAttempted) return;
        if (this.state !== 'CONNECTING') this._peerReconnectAttempted = true;
        try {
          this.peer.reconnect();
        } catch (e) {
          console.warn('[Multiplayer] Reconnect fallito:', e?.message || e);
        }
      });

      this.peer.on('connection', (conn) => {
        if (!this.isHost) return;
        this.handleHostIncomingConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.warn('[Multiplayer Peer Error]:', err.type, err.message);
        if (err.type === 'unavailable-id') {
          this.toast(`Codice stanza già occupato. Riprova con un altro codice.`);
        } else if (err.type === 'peer-unavailable') {
          this.toast(`Stanza non trovata! Controlla il codice.`);
        } else {
          this.toast(`Errore di rete: ${err.type}`);
        }
        if (this.state === 'CONNECTING') {
          this.leaveRoom();
        }
        if (this.onError) this.onError(err);
      });
    } catch (e) {
      console.error('Failed to create Peer:', e);
      this.toast('Inizializzazione multiplayer fallita');
    }
  }

  // --- HOST CONNECTION HANDLING ---
  handleHostIncomingConnection(conn) {
    conn.on('open', () => {
      console.log(`[Host] Client connected: ${conn.peer}`);
      this.connections.set(conn.peer, conn);
    });

    conn.on('data', (data) => this.handleMessage(conn, data));

    conn.on('close', () => {
      this.handlePeerDisconnect(conn.peer);
    });

    conn.on('error', (err) => {
      console.warn(`[Host] Errore connessione ${conn.peer}:`, err?.type || err?.message || err);
      this.handlePeerDisconnect(conn.peer);
    });
  }

  handlePeerDisconnect(peerId) {
    console.log(`[Host] Client disconnected: ${peerId}`);
    this.connections.delete(peerId);
    this.peerSlots.delete(peerId);
    this.spoofStrikes.delete(peerId);
    this.eventRateLimits.delete(peerId);
    this.rttSamples.delete(peerId);
    const idx = this.players.findIndex(p => p.peerId === peerId);
    if (idx !== -1) {
      const leaving = this.players[idx];
      if (this.state === 'COUNTDOWN') {
        this.players.splice(idx, 1);
        this.cancelCountdown(`${leaving.name} si è disconnesso durante il conto alla rovescia.`);
      } else if (this.state === 'RACING') {
        // Prevent array shifting during race: mark as AI and inform everyone
        leaving.isAI = true;
        this.toast(`${leaving.name} si è disconnesso (subentra l'IA).`);
        this.broadcastToAll({
          type: 'PLAYER_DISCONNECTED',
          slot: leaving.slot,
          name: leaving.name
        });
        this.nametagEls.get(leaving.slot)?.remove();
        this.nametagEls.delete(leaving.slot);
        this.emoteEls.get(leaving.slot)?.el?.remove();
        this.emoteEls.delete(leaving.slot);
        this.remoteStates.delete(leaving.slot);
        if (window.__zephyr?.director?.racers?.[leaving.slot]) {
          const r = window.__zephyr.director.racers[leaving.slot];
          r.kind = "ai";
          r.isPlayer = false;
          r.isRemotePlayer = false;
          r.name = `${leaving.name} (IA)`;
        }
      } else {
        this.players.splice(idx, 1);
        this.toast(`${leaving.name} è uscito dalla stanza.`);
        this.broadcastLobbyUpdate();
      }
    }
  }

  // --- SECURITY & ROBUSTNESS HELPERS ---
  // Pulisce un nome ricevuto dalla rete prima che raggiunga roster e renderer
  sanitizeName(raw) {
    if (raw === undefined || raw === null) return '';
    return String(raw).slice(0, 16).replace(/[<>&"']/g, '').trim();
  }

  // Host: verifica che lo slot dichiarato nel messaggio corrisponda a quello
  // assegnato al mittente al JOIN_REQUEST (anti-spoofing). Se il mittente non ha
  // un binding noto non e' autenticabile: il messaggio viene accettato.
  isSlotAuthentic(conn, data) {
    if (!this.isHost) return true;
    const peerId = conn?.peer;
    if (!peerId) return true;
    const boundSlot = this.peerSlots.get(peerId);
    if (boundSlot !== undefined) return data.slot === boundSlot;
    return true;
  }

  // Host: slot verificato del mittente (binding JOIN_REQUEST), da usare per
  // riscrivere data.slot prima del relay invece di fidarsi del payload
  getSenderSlot(conn, data) {
    const peerId = conn?.peer;
    if (peerId) {
      const boundSlot = this.peerSlots.get(peerId);
      if (boundSlot !== undefined) return boundSlot;
    }
    return data.slot;
  }

  // Host: gestisce una violazione del binding slot (drop + strike, chiusura dopo abusi ripetuti)
  handleSlotViolation(conn) {
    const peerId = conn?.peer;
    if (!peerId) return;
    const strikes = (this.spoofStrikes.get(peerId) || 0) + 1;
    this.spoofStrikes.set(peerId, strikes);
    console.warn(`[Multiplayer] Slot non valido da ${peerId} (violazione ${strikes})`);
    if (strikes >= 3) {
      this.toast('Attività sospetta rilevata: connessione chiusa.');
      try { conn.close(); } catch {}
      this.handlePeerDisconnect(peerId);
    }
  }

  // Host: rate-limit per evento (default: max 3 ogni 2s per tipo e per peer)
  checkEventRateLimit(peerId, eventType, maxEvents = 3, windowMs = 2000) {
    if (!peerId) return true;
    let perPeer = this.eventRateLimits.get(peerId);
    if (!perPeer) {
      perPeer = {};
      this.eventRateLimits.set(peerId, perPeer);
    }
    const now = performance.now();
    const recent = (perPeer[eventType] || []).filter(t => now - t < windowMs);
    perPeer[eventType] = recent;
    if (recent.length >= maxEvents) {
      console.warn(`[Multiplayer] Rate limit (${eventType}) superato da ${peerId}: evento scartato`);
      return false;
    }
    recent.push(now);
    return true;
  }

  // RTT medio misurato verso i guest (0 se nessuna misurazione disponibile)
  getAverageRtt() {
    if (!this.rttSamples || this.rttSamples.size === 0) return 0;
    let sum = 0;
    for (const rtt of this.rttSamples.values()) sum += rtt;
    return Math.round(sum / this.rttSamples.size);
  }

  // --- MESSAGE ROUTING ---
  handleIncomingData(conn, data) {
    return this.handleMessage(conn, data);
  }

  handleMessage(conn, data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'JOIN_REQUEST': {
        if (!this.isHost) return;

        // Gara in corso o countdown: non allocare slot
        if (this.state === 'RACING' || this.state === 'COUNTDOWN') {
          this.safeSend(conn, { type: 'ROOM_BUSY' });
          try { conn.close(); } catch {}
          return;
        }

        // JOIN_REQUEST duplicato dallo stesso peer: re-sync con lo stato attuale
        if (this.peerSlots.has(conn.peer) || this.players.some(p => p.peerId === conn.peer)) {
          const known = this.players.find(p => p.peerId === conn.peer);
          this.safeSend(conn, {
            type: 'ROOM_WELCOME',
            roomCode: this.roomCode,
            mySlot: known ? known.slot : this.peerSlots.get(conn.peer),
            trackIndex: this.trackIndex,
            laps: this.laps,
            playlistTracks: this.playlistTracks,
            playlistIndex: this.playlistIndex,
            players: this.players
          });
          break;
        }

        const usedSlots = new Set(this.players.map(p => p.slot));
        let slot = 1;
        while (usedSlots.has(slot) && slot < 6) slot++;

        if (slot >= 6) {
          this.safeSend(conn, { type: 'ROOM_FULL' });
          try { conn.close(); } catch {}
          return;
        }

        const newPlayer = {
          peerId: conn.peer,
          slot: slot,
          name: this.sanitizeName(data.name) || `Ospite ${slot}`,
          kartId: data.kartId || 'bruno',
          isHost: false,
          ping: 0,
          isAI: false,
          isReady: false
        };

        this.connections.set(conn.peer, conn);
        this.peerSlots.set(conn.peer, slot);
        this.players.push(newPlayer);
        this.toast(`${newPlayer.name} è entrato nella stanza!`);

        this.safeSend(conn, {
          type: 'ROOM_WELCOME',
          roomCode: this.roomCode,
          mySlot: slot,
          trackIndex: this.trackIndex,
          laps: this.laps,
          playlistTracks: this.playlistTracks,
          playlistIndex: this.playlistIndex,
          players: this.players
        });

        this.broadcastLobbyUpdate();
        break;
      }

      case 'PLAYER_READY': {
        if (this.isHost && !this.isSlotAuthentic(conn, data)) {
          this.handleSlotViolation(conn);
          break;
        }
        const p = this.players.find(pl => pl.slot === data.slot);
        if (p) {
          p.isReady = !!data.isReady;
        }
        if (this.isHost) {
          this.broadcastLobbyUpdate();
        } else {
          this.notifyLobbyUpdate();
        }
        break;
      }

      case 'PLAYER_UPDATE': {
        if (!this.isHost) return;
        if (!this.isSlotAuthentic(conn, data)) {
          this.handleSlotViolation(conn);
          break;
        }
        const p = this.players.find(pl => pl.slot === data.slot);
        if (p) {
          if (data.name) {
            const cleanName = this.sanitizeName(data.name);
            if (cleanName) p.name = cleanName;
          }
          if (data.kartId) p.kartId = data.kartId;
          if (typeof data.isReady === 'boolean') p.isReady = data.isReady;
          this.broadcastLobbyUpdate();
        }
        break;
      }

      case 'PLAYER_DISCONNECTED': {
        this.toast(`${data.name} si è disconnesso (subentra l'IA)`);
        this.nametagEls.get(data.slot)?.remove();
        this.nametagEls.delete(data.slot);
        this.emoteEls.get(data.slot)?.el?.remove();
        this.emoteEls.delete(data.slot);
        this.remoteStates.delete(data.slot);
        if (window.__zephyr?.director?.racers?.[data.slot]) {
          const r = window.__zephyr.director.racers[data.slot];
          r.kind = "ai";
          r.isPlayer = false;
          r.isRemotePlayer = false;
          r.name = `${data.name} (IA)`;
        }
        break;
      }

      case 'ROOM_WELCOME': {
        this.state = 'GUEST_LOBBY';
        this.mySlot = data.mySlot;
        this.roomCode = data.roomCode;
        this.trackIndex = data.trackIndex;
        this.laps = data.laps;
        this.players = data.players;
        if (Array.isArray(data.playlistTracks) && data.playlistTracks.length > 0) {
          this.playlistTracks = data.playlistTracks;
          this.playlistIndex = data.playlistIndex || 0;
        }
        try { localStorage.setItem('zephyr_track', String(data.trackIndex)); } catch {}
        this.toast(`Sei nella stanza privata! (Slot ${this.mySlot + 1})`);
        this.notifyLobbyUpdate();
        this.startHeartbeat();
        break;
      }

      case 'ROOM_FULL': {
        this.toast('La stanza è piena');
        this.leaveRoom();
        break;
      }

      case 'ROOM_BUSY': {
        this.toast('Gara in corso, riprova dopo');
        this.leaveRoom();
        break;
      }

      case 'LOBBY_UPDATE': {
        this.players = data.players;
        this.trackIndex = data.trackIndex;
        this.laps = data.laps;
        if (Array.isArray(data.playlistTracks) && data.playlistTracks.length > 0) {
          this.playlistTracks = data.playlistTracks;
          this.playlistIndex = data.playlistIndex || 0;
        }
        try { localStorage.setItem('zephyr_track', String(data.trackIndex)); } catch {}
        this.notifyLobbyUpdate();
        break;
      }

      case 'TRACK_SYNC':
      case 'PLAYLIST_SYNC': {
        this.trackIndex = data.trackIndex;
        this.laps = data.laps;
        if (Array.isArray(data.playlistTracks) && data.playlistTracks.length > 0) {
          this.playlistTracks = data.playlistTracks;
          this.playlistIndex = data.playlistIndex || 0;
        }
        try { localStorage.setItem('zephyr_track', String(data.trackIndex)); } catch {}
        this.notifyLobbyUpdate();
        break;
      }

      case 'TOURNAMENT_STANDINGS_SYNC': {
        this.state = 'RESULTS';
        this.playlistIndex = data.playlistIndex;
        this.isTournamentComplete = !!data.isFinalRace;
        if (Array.isArray(data.standings)) {
          for (const st of data.standings) {
            this.tournamentScores.set(st.slot, st.totalPoints);
          }
        }
        // Risultati autorevoli dell'host (ordine di arrivo + tempi): la shell li
        // usa per ridisegnare la schermata risultati del guest, che altrimenti
        // mostrerebbe l'ordine calcolato dal proprio finishCounter locale.
        if (Array.isArray(data.raceResults)) {
          this.authRaceResults = data.raceResults;
        }
        if (this.onTournamentStandings) {
          this.onTournamentStandings(data);
        }
        if (data.isFinalRace && this.onTournamentComplete) {
          this.onTournamentComplete(data);
        }
        break;
      }

      case 'NEXT_TOURNAMENT_RACE': {
        this.playlistIndex = data.playlistIndex;
        this.trackIndex = data.trackIndex;
        this.laps = data.laps;
        this.players = data.players || this.players;
        try { localStorage.setItem('zephyr_track', String(data.trackIndex)); } catch {}
        this.handleCountdownStart(data);
        break;
      }

      case 'TOURNAMENT_RESET': {
        this.playlistIndex = 0;
        this.trackIndex = data.trackIndex;
        this.laps = data.laps;
        this.playlistTracks = data.playlistTracks || this.playlistTracks;
        this.players = data.players || this.players;
        this.tournamentScores.clear();
        this.lastRaceResults = [];
        this.isTournamentComplete = false;
        this.state = 'GUEST_LOBBY';
        this.notifyLobbyUpdate();
        break;
      }

      case 'START_COUNTDOWN': {
        this.handleCountdownStart(data);
        break;
      }

      case 'COUNTDOWN_CANCEL': {
        if (this.countdownTimer) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }
        this.state = 'GUEST_LOBBY';
        this.players = data.players || this.players;
        this.toast(data.reason || 'Partenza annullata');
        if (this.onCountdownCancel) {
          this.onCountdownCancel(data.reason);
        }
        this.notifyLobbyUpdate();
        break;
      }

      case 'RACE_START_SYNC': {
        if (this.countdownTimer) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }
        this.state = 'RACING';
        // Converti il timestamp host nel dominio di clock locale: senza la stima
        // offset (NTP-style via PING/PONG) un dispositivo con l'orologio sfasato
        // partirebbe anticipato/ritardato rispetto agli altri. Fallback: la vecchia
        // euristica rtt/2 finche' non arriva il primo PONG con hostTime.
        const off = (this.clockOffset != null)
          ? Math.max(-10000, Math.min(10000, this.clockOffset))
          : -Math.min((this.lastRtt || 0) / 2, 150);
        this.syncStartTime = (data.startTime || (Date.now() + 3000)) - off;
        this.trackIndex = data.trackIndex;
        this.laps = data.laps;
        this.players = data.players;
        this.authRaceResults = null;
        try { localStorage.setItem('zephyr_track', String(data.trackIndex)); } catch {}
        if (this.onRaceStart) {
          this.onRaceStart(data);
        }
        break;
      }

      case 'KART_STATE': {
        if (this.isHost && !this.isSlotAuthentic(conn, data)) {
          this.handleSlotViolation(conn);
          break;
        }
        const s = data.slot;
        // Host: sanity check anti-teleport/anti-lap-cheat prima di applicare e
        // relay-are lo stato. Un salto spaziale impossibile o un lap non plausibile
        // scartano l'intero update (resta l'ultimo stato valido).
        if (this.isHost) {
          const prev = this.remoteStates.get(s);
          if (prev && prev.lastUpdate) {
            const jump = Math.hypot((data.x || 0) - prev.x, (data.z || 0) - prev.z);
            const dtMs = performance.now() - prev.lastUpdate;
            const maxJump = 120 + 0.12 * dtMs; // ~58 m/s di punta + margine per jitter di rete
            const lapRaw = data.lap || 1;
            const lapOk = Number.isFinite(lapRaw) && lapRaw >= 0 && lapRaw <= 99 &&
              Math.abs(lapRaw - (prev.lap ?? 1)) <= 1;
            if (jump > maxJump || !lapOk) {
              console.warn('[MP] KART_STATE scartato per slot', s, '(jump=' + jump.toFixed(1) + 'm, lap=' + lapRaw + ')');
              break;
            }
          }
        }
        let rState = this.remoteStates.get(s);
        if (!rState) {
          rState = {
            x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0, steer: 0,
            driftTier: 0, isDrifting: false, boost: false, grounded: true, airborne: false, lap: 1, dist: 0, lastUpdate: 0
          };
          this.remoteStates.set(s, rState);
        }
        rState.x = data.x;
        rState.y = data.y;
        rState.z = data.z;
        rState.yaw = data.yaw;
        rState.pitch = data.pitch || 0;
        rState.roll = data.roll || 0;
        rState.speed = data.speed || 0;
        rState.steer = data.steer || 0;
        rState.driftTier = data.driftTier || 0;
        rState.isDrifting = !!data.isDrifting;
        rState.boost = !!data.boost;
        rState.grounded = data.grounded !== undefined ? data.grounded : true;
        rState.airborne = data.airborne !== undefined ? data.airborne : !rState.grounded;
        rState.lap = data.lap || 1;
        rState.dist = data.dist || 0;
        rState.lastUpdate = performance.now();

        // Guest replicates AI states from Host authoritative broadcast
        if (Array.isArray(data.ais) && !this.isHost) {
          for (const ai of data.ais) {
            let aiState = this.remoteStates.get(ai.slot);
            if (!aiState) {
              aiState = { ...ai, lastUpdate: performance.now() };
              this.remoteStates.set(ai.slot, aiState);
            } else {
              Object.assign(aiState, ai, { lastUpdate: performance.now() });
            }
          }
        }

        if (this.isHost) {
          // Relay: riscrive lo slot con quello verificato del mittente e rimuove
          // 'ais' (le posizioni AI sono solo dell'host)
          const relayData = { ...data, slot: this.getSenderSlot(conn, data) };
          delete relayData.ais;
          for (const [peerId, otherConn] of this.connections.entries()) {
            if (peerId !== conn?.peer && otherConn.open) {
              this.safeSend(otherConn, relayData);
            }
          }
        }
        break;
      }


      case 'ITEM_USE': {
        if (this.isHost) {
          if (!this.isSlotAuthentic(conn, data)) { this.handleSlotViolation(conn); break; }
          if (!this.checkEventRateLimit(conn?.peer, 'ITEM_USE')) break;
          data.slot = this.getSenderSlot(conn, data);
        }
        if (this.onItemUse) this.onItemUse(data);
        if (this.isHost) {
          this.relayToOthers(conn?.peer, data);
        }
        break;
      }

      case 'RACER_HIT': {
        if (this.isHost) {
          if (!this.checkEventRateLimit(conn?.peer, 'RACER_HIT')) break;
          // data.slot specifies the victim racer, while getSenderSlot is the attacker.
          const victimSlot = Math.max(0, Math.min(5, parseInt(data.slot, 10) || 0));
          data.slot = victimSlot;
          data.attackerSlot = this.getSenderSlot(conn, data);
          data.duration = Math.max(0.3, Math.min(3.0, parseFloat(data.duration) || 1.0));
        }
        if (this.onRacerHit) this.onRacerHit(data);
        if (this.isHost) {
          this.relayToOthers(conn?.peer, data);
        }
        break;
      }

      case 'EMOTE': {
        if (this.isHost && !this.isSlotAuthentic(conn, data)) {
          this.handleSlotViolation(conn);
          break;
        }
        // Clamp del testo remoto: nessun payload ostile verso bubble e renderer
        data.text = String(data.text ?? '').slice(0, 32);
        data.slot = this.getSenderSlot(conn, data);
        this.displayEmoteBubble(data.slot, data.text);
        if (this.onEmote) this.onEmote(data);
        if (this.isHost) {
          this.relayToOthers(conn?.peer, data);
        }
        break;
      }

      case 'PLAYER_FINISH': {
        if (this.isHost && !this.isSlotAuthentic(conn, data)) {
          this.handleSlotViolation(conn);
          break;
        }
        const p = this.players.find(pl => pl.slot === data.slot);
        if (p) {
          p.finishTime = data.finishTime;
          p.rank = data.rank;
        }
        if (this.onPlayerFinish) this.onPlayerFinish(data);
        if (this.isHost) {
          this.relayToOthers(conn?.peer, data);
        }
        break;
      }

      case 'REMATCH': {
        this.trackIndex = data.trackIndex;
        if (this.onRematch) this.onRematch(data);
        break;
      }

      case 'PING': {
        this.safeSend(conn, { type: 'PONG', t: data.t, hostTime: Date.now() }, false);
        break;
      }

      case 'PONG': {
        const rtt = Math.round(performance.now() - data.t);
        const p = this.players.find(pl => pl.peerId === conn?.peer);
        if (p) p.ping = Math.max(1, rtt);
        this.lastRtt = rtt;
        if (this.isHost && conn?.peer) this.rttSamples.set(conn.peer, rtt);
        // Stima offset orologio (guest): hostTime e' il Date.now() dell'host alla
        // creazione del PONG, avvenuta ~rtt/2 fa per ipotesi di simmetria del percorso.
        if (!this.isHost && typeof data.hostTime === 'number' && Number.isFinite(data.hostTime)) {
          const sample = { rtt, offset: data.hostTime + rtt / 2 - Date.now() };
          this.clockOffsetSamples.push(sample);
          if (this.clockOffsetSamples.length > 10) this.clockOffsetSamples.shift();
          const best = this.clockOffsetSamples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
          this.clockOffset = best.offset;
        }
        // Durante gara/countdown il ping non deve ridisegnare la lobby
        if (this.state !== 'RACING' && this.state !== 'COUNTDOWN') {
          this.notifyLobbyUpdate();
        }
        break;
      }
    }
  }

  // --- HEARTBEAT & PING ---
  startHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      const now = performance.now();
      if (this.isHost) {
        for (const conn of this.connections.values()) {
          if (conn.open) this.safeSend(conn, { type: 'PING', t: now });
        }
      } else if (this.hostConnection && this.hostConnection.open) {
        this.safeSend(this.hostConnection, { type: 'PING', t: now }, false);
      }
    }, 2500);
  }

  // --- BROADCAST HELPERS ---
  // Alias pubblico storico: consentito l'override per-istanza (hook usato da test/UI)
  broadcast(data) {
    this.broadcastToAll(data);
  }

  // Invio protetto: un'eccezione non deve mai interrompere i loop di broadcast/heartbeat
  safeSend(conn, data, cleanupOnFail = true) {
    try {
      conn?.send(data);
      return true;
    } catch (e) {
      console.warn('[Multiplayer] Invio fallito:', e?.message || e);
      if (cleanupOnFail && conn?.peer) {
        this.handlePeerDisconnect(conn.peer);
      }
      return false;
    }
  }

  broadcastToAll(data) {
    if (typeof this.broadcast === 'function' && this.broadcast !== MultiplayerManager.prototype.broadcast && this.broadcast !== this.broadcastToAll) {
      this.broadcast(data);
      return;
    }
    if (this.isHost) {
      for (const conn of this.connections.values()) {
        if (conn.open) this.safeSend(conn, data);
      }
    } else if (this.hostConnection && this.hostConnection.open) {
      this.safeSend(this.hostConnection, data, false);
    }
  }

  relayToOthers(senderPeerId, data) {
    for (const [peerId, conn] of this.connections.entries()) {
      if (peerId !== senderPeerId && conn.open) {
        this.safeSend(conn, data);
      }
    }
  }

  broadcastLobbyUpdate() {
    if (!this.isHost) return;
    this.broadcastToAll({
      type: 'LOBBY_UPDATE',
      trackIndex: this.trackIndex,
      laps: this.laps,
      playlistTracks: this.playlistTracks,
      playlistIndex: this.playlistIndex,
      players: this.players
    });
    this.notifyLobbyUpdate();
  }

  notifyLobbyUpdate() {
    if (this.onLobbyUpdate) {
      this.onLobbyUpdate({
        roomCode: this.roomCode,
        isHost: this.isHost,
        mySlot: this.mySlot,
        trackIndex: this.trackIndex,
        laps: this.laps,
        playlistTracks: this.playlistTracks,
        playlistIndex: this.playlistIndex,
        tournamentScores: Object.fromEntries(this.tournamentScores),
        players: this.players,
        allReady: this.allPlayersReady(),
        inviteLink: this.getInviteLink()
      });
    }
  }

  startCountdown(countdownSec = 5) {
    return this.startRace(countdownSec);
  }

  // --- START RACE (HOST TRIGGER WITH OPTIONAL COUNTDOWN & READY CHECK) ---
  startRace(countdownSec = 0) {
    if (!this.isHost) return false;

    if (!this.allPlayersReady()) {
      this.toast('Tutti i giocatori della stanza devono confermare prima di avviare la gara!');
      return false;
    }

    if (this.state === 'COUNTDOWN' || this.state === 'RACING') return false;

    if (this.playlistIndex === 0) {
      this.tournamentScores.clear();
      this.lastRaceResults = [];
      this.isTournamentComplete = false;
    }

    const availableAIs = ['nix', 'bruno', 'sable', 'zuzu', 'rustam', 'marlow'];
    const usedKarts = new Set(this.players.map(p => p.kartId));
    
    const fullGrid = [...this.players];
    for (let slot = 0; slot < 6; slot++) {
      if (!fullGrid.some(p => p.slot === slot)) {
        const unusedKart = availableAIs.find(k => !usedKarts.has(k)) || availableAIs[slot % availableAIs.length];
        usedKarts.add(unusedKart);
        fullGrid.push({
          peerId: `ai_${slot}`,
          slot: slot,
          name: `${unusedKart.charAt(0).toUpperCase() + unusedKart.slice(1)} (IA)`,
          kartId: unusedKart,
          isHost: false,
          ping: 0,
          isAI: true,
          isReady: true
        });
      }
    }

    fullGrid.sort((a, b) => a.slot - b.slot);
    this.players = fullGrid;

    if (countdownSec > 0) {
      this.state = 'COUNTDOWN';
      const payload = {
        type: 'START_COUNTDOWN',
        countdownSec: countdownSec,
        trackIndex: this.trackIndex,
        laps: this.laps,
        playlistTracks: this.playlistTracks,
        playlistIndex: this.playlistIndex,
        players: this.players,
        startTime: Date.now() + (countdownSec * 1000)
      };

      this.broadcastToAll(payload);
      this.handleCountdownStart(payload);
      return true;
    }

    this.state = 'RACING';
    const startStamp = Date.now() + 1000;
    this.syncStartTime = startStamp;
    const payload = {
      type: 'RACE_START_SYNC',
      trackIndex: this.trackIndex,
      laps: this.laps,
      players: this.players,
      startTime: startStamp
    };

    this.broadcastToAll(payload);
    if (this.onRaceStart) this.onRaceStart(payload);
    return true;
  }

  handleCountdownStart(data) {
    this.state = 'COUNTDOWN';
    this.trackIndex = data.trackIndex;
    this.laps = data.laps;
    this.players = data.players;
    this.authRaceResults = null;
    if (Array.isArray(data.playlistTracks) && data.playlistTracks.length > 0) {
      this.playlistTracks = data.playlistTracks;
      this.playlistIndex = data.playlistIndex || 0;
    }
    try { localStorage.setItem('zephyr_track', String(data.trackIndex)); } catch {}

    if (this.countdownTimer) clearInterval(this.countdownTimer);
    let remaining = data.countdownSec || 5;

    if (this.onCountdownTick) {
      this.onCountdownTick(remaining, data);
    }

    this.countdownTimer = setInterval(() => {
      remaining--;
      if (this.onCountdownTick) {
        this.onCountdownTick(remaining, data);
      }

      if (remaining <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;

        if (this.isHost) {
          this.state = 'RACING';
          // Compensazione conservativa del RTT medio verso i guest (max 250ms)
          const startStamp = Date.now() + 3000 + Math.min(this.getAverageRtt(), 250);
          this.syncStartTime = startStamp;
          const raceStartPayload = {
            type: 'RACE_START_SYNC',
            trackIndex: this.trackIndex,
            laps: this.laps,
            playlistTracks: this.playlistTracks,
            playlistIndex: this.playlistIndex,
            players: this.players,
            startTime: startStamp
          };
          this.broadcastToAll(raceStartPayload);
          if (this.onRaceStart) this.onRaceStart(raceStartPayload);
        }
      }
    }, 1000);
  }

  cancelCountdown(reason = 'Conto alla rovescia annullato') {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.state = this.isHost ? 'HOST_LOBBY' : 'GUEST_LOBBY';
    for (const p of this.players) {
      if (!p.isHost && !p.isAI) p.isReady = false;
    }
    this.toast(reason);
    if (this.isHost) {
      this.broadcastToAll({
        type: 'COUNTDOWN_CANCEL',
        reason: reason,
        players: this.players
      });
      this.broadcastLobbyUpdate();
    }
    if (this.onCountdownCancel) {
      this.onCountdownCancel(reason);
    }
  }

  // --- REAL-TIME TRANSMISSION (30 Hz) ---
  sendMyState(kart, director) {
    if (this.state !== 'RACING' && this.state !== 'COUNTDOWN') return;
    const now = performance.now();
    if (now - this.lastBroadcastTime < this.broadcastIntervalMs) return;
    this.lastBroadcastTime = now;

    const p = kart.physics.state;
    const prog = director.player?.progress || director.racers?.[this.mySlot]?.progress || { lap: 1, distance: 0 };

    const payload = {
      type: 'KART_STATE',
      slot: this.mySlot,
      x: Math.round(p.pos.x * 100) / 100,
      y: Math.round(p.pos.y * 100) / 100,
      z: Math.round(p.pos.z * 100) / 100,
      yaw: Math.round(p.yaw * 1000) / 1000,
      pitch: Math.round((p.pitch || 0) * 1000) / 1000,
      roll: Math.round((p.roll || 0) * 1000) / 1000,
      speed: Math.round(p.speed * 10) / 10,
      steer: Math.round(p.steer * 100) / 100,
      driftTier: p.driftTier || 0,
      isDrifting: !!p.drifting,
      boost: (p.boostTime > 0 || p.padBoostTime > 0),
      grounded: !!p.grounded,
      airborne: !p.grounded,
      lap: prog.lap || 1,
      dist: Math.round((prog.distance || 0) * 10) / 10
    };

    // If Host, pack AI racer positions so Guest sees identical field
    if (this.isHost && director && director.racers) {
      const aiList = [];
      for (let s = 0; s < director.racers.length; s++) {
        if (s === this.mySlot) continue;
        const r = director.racers[s];
        if (r && r.kind === 'ai') {
          const rp = r.state || {};
          const rPos = rp.pos || r.pos || { x: 0, y: 0, z: 0 };
          aiList.push({
            slot: s,
            x: Math.round(rPos.x * 100) / 100,
            y: Math.round(rPos.y * 100) / 100,
            z: Math.round(rPos.z * 100) / 100,
            yaw: Math.round((rp.yaw || 0) * 1000) / 1000,
            speed: Math.round((rp.speed || 0) * 10) / 10,
            steer: Math.round((r.controls?.steer || 0) * 100) / 100,
            driftTier: rp.driftTier || 0,
            isDrifting: !!rp.drifting,
            grounded: rp.grounded !== undefined ? !!rp.grounded : true,
            airborne: rp.grounded !== undefined ? !rp.grounded : false,
            lap: r.progress?.lap || 1,
            dist: Math.round((r.progress?.distance || 0) * 10) / 10
          });
        }
      }
      if (aiList.length > 0) payload.ais = aiList;
    }

    this.broadcastToAll(payload);
  }

  // --- 60 FPS INTERPOLATION & RENDERING FOR REMOTE RACERS ---
  updateRemoteRacers(dt, director, scene, camera) {
    if ((this.state !== 'RACING' && this.state !== 'COUNTDOWN') || !director || !director.racers) {
      this.clearAllNametags();
      this.updateHudPing();
      return;
    }

    const now = performance.now();

    for (const player of this.players) {
      if (player.slot === this.mySlot) continue;
      // On Host, AI is simulated locally; on Guest, AI is replicated from Host
      if (this.isHost && player.isAI) continue;

      const slot = player.slot;
      const racer = director.racers[slot];
      const remote = this.remoteStates.get(slot);
      if (!racer || !remote) continue;

      // Dead Reckoning: extrapolate remote position along velocity vector based on packet age
      const packetAgeSec = Math.max(0, Math.min(0.12, (now - (remote.lastUpdate || now)) * 0.001));
      const vx = -Math.sin(remote.yaw) * (remote.speed || 0);
      const vz = -Math.cos(remote.yaw) * (remote.speed || 0);
      const targetX = remote.x + vx * packetAgeSec;
      const targetZ = remote.z + vz * packetAgeSec;

      // Distance snap check: if distance > 20m, snap directly without flying across map
      const dxRaw = remote.x - racer.pos.x;
      const dzRaw = remote.z - racer.pos.z;
      const distSq = dxRaw * dxRaw + dzRaw * dzRaw;
      if (distSq > 400) {
        racer.pos.x = remote.x;
        racer.pos.y = remote.y;
        racer.pos.z = remote.z;
        racer.state.yaw = remote.yaw;
      } else {
        // Frame-rate independent exponential smoothing (critically damped)
        const dx = targetX - racer.pos.x;
        const dz = targetZ - racer.pos.z;
        const posBlend = 1.0 - Math.exp(-24.0 * dt);
        racer.pos.x += dx * posBlend;
        racer.pos.z += dz * posBlend;
      }

      // Height Clamping: Opponents MUST NEVER float in the sky!
      if (director.spline) {
        const roadHeight = director.spline.surfaceHeight(racer.pos.x, racer.pos.z, -1);
        const isAirborne = !!remote.airborne && (remote.y > roadHeight + 0.3);
        if (!isAirborne) {
          racer.pos.y = roadHeight;
          racer.state.grounded = true;
          racer.state.airHeight = 0;
        } else {
          // Genuinely airborne over jump ramp
          const yLerpRate = Math.min(1.0, dt * 18.0);
          racer.pos.y += (remote.y - racer.pos.y) * yLerpRate;
          if (racer.pos.y < roadHeight) racer.pos.y = roadHeight;
          racer.state.grounded = (racer.pos.y <= roadHeight + 0.05);
          racer.state.airHeight = Math.max(0, racer.pos.y - roadHeight);
        }
      } else {
        racer.pos.y += (remote.y - racer.pos.y) * Math.min(1.0, dt * 18.0);
      }

      // Angular Yaw Lerp (critically damped exponential smoothing)
      let deltaYaw = (remote.yaw - racer.state.yaw) % (Math.PI * 2);
      if (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
      if (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
      const yawBlend = 1.0 - Math.exp(-20.0 * dt);
      racer.state.yaw += deltaYaw * yawBlend;

      // State flags
      racer.state.speed = remote.speed;
      racer.state.steer = remote.steer;
      racer.state.drifting = remote.isDrifting;
      racer.state.driftTier = remote.driftTier;
      racer.progress.lap = remote.lap;
      racer.progress.distance = remote.dist;

      // Sync internal kart physics state so shadows and visual transforms stay aligned
      if (racer.kart && racer.kart.physics && racer.kart.physics.state) {
        racer.kart.physics.state.pos.copy(racer.pos);
        racer.kart.physics.state.yaw = racer.state.yaw;
        racer.kart.physics.state.speed = remote.speed;
        racer.kart.physics.state.grounded = racer.state.grounded;
        racer.kart.physics.state.airHeight = racer.state.airHeight || 0;
      }

      // Align ground normal with track banking so chassis leans and wheels don't hover
      if (director.adapter && director.adapter.querySurface) {
        const q = director.adapter.querySurface(racer.pos.x, racer.pos.z, racer.state.trackIndex || 0, director.adapter.scratch);
        if (q) {
          racer.kart.setGroundNormal(q.upX, q.upY, q.upZ);
          racer.state.trackS = q.s;
          racer.state.onRoad = q.onRoad;
        }
      }

      // Sync kart visual geometry, wheels, and model transforms
      racer.kart?.syncVisual?.(dt);
      if (racer.kart && racer.kart.visual) {
        racer.kart.visual.syncWheelSteer?.(remote.steer);
        racer.kart.visual.syncDriftSpark?.(remote.isDrifting, remote.driftTier);
      }

      // Update 3D projected DOM Nametag (only for human players)
      if (player && !player.isAI) {
        this.updateProjectedNametag(player.slot, player.name, player.ping, racer.pos, camera);
      }
    }

    this.updateEmoteBubbles(now, director, camera);
    this.updateHudPing();
  }

  // --- LIVE MULTIPLAYER LATENCY & HUD PING ---
  getLatencyInfo() {
    const rtt = Math.max(1, Math.round(this.lastRtt || 18));
    let status = 'good';
    if (rtt > 125) status = 'bad';
    else if (rtt > 65) status = 'medium';
    return { rtt, status };
  }

  updateHudPing() {
    if (typeof document === 'undefined') return;
    const badge = document.getElementById('z-hud-ping');
    if (!badge) return;
    const isMp = (this.state === 'RACING' || this.state === 'COUNTDOWN' || this.state === 'ROOM_SYNC') &&
                 this.players && this.players.length > 1;
    if (!isMp) {
      badge.classList.add('hidden');
      return;
    }
    badge.classList.remove('hidden');
    const { rtt, status } = this.getLatencyInfo();
    const valEl = badge.querySelector('.z-ping-val');
    if (valEl) valEl.textContent = `${rtt} ms`;
    badge.classList.remove('ping-med', 'ping-bad');
    if (status === 'bad') badge.classList.add('ping-bad');
    else if (status === 'medium') badge.classList.add('ping-med');
  }

  // --- DOM NAMETAG PROJECTION ---
  updateProjectedNametag(slot, name, ping, worldPos, camera) {
    if (!this.nametagsLayer || !camera) return;

    let el = this.nametagEls.get(slot);
    if (!el) {
      el = document.createElement('div');
      el.className = 'z-mp-nametag';
      el.style.cssText = `
        position: absolute;
        transform: translate(-50%, -100%);
        background: rgba(6, 22, 38, 0.88);
        border: 2px solid #76fff0;
        border-radius: 14px;
        padding: 4px 10px;
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: sans-serif;
        font-weight: 800;
        font-size: 13px;
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(0,0,0,0.6), 0 0 12px rgba(118,255,240,0.4);
        pointer-events: none;
        user-select: none;
        white-space: nowrap;
        transition: opacity 0.15s ease;
      `;
      const nameSpan = document.createElement('span');
      nameSpan.style.color = '#76fff0';
      const dotSpan = document.createElement('span');
      dotSpan.style.cssText = 'display:inline-block; width: 7px; height: 7px; border-radius: 50%;';
      const pingSpan = document.createElement('span');
      pingSpan.style.cssText = 'font-size: 10px; color: #94a3b8; font-family: monospace;';
      el.append(nameSpan, dotSpan, pingSpan);
      el._nameSpan = nameSpan;
      el._dotSpan = dotSpan;
      el._pingSpan = pingSpan;
      el._lastName = '';
      el._lastPing = -1;

      this.nametagsLayer.appendChild(el);
      this.nametagEls.set(slot, el);
    }

    // Project world coordinates to 2D screen without heap allocation
    if (!this._scratchVec && worldPos.clone) {
      this._scratchVec = worldPos.clone();
    }
    const p = this._scratchVec || worldPos.clone();
    p.copy(worldPos);
    p.y += 2.1; // Float above kart
    p.project(camera);

    // Check if behind camera
    let isBehind = p.z > 1.0;
    if (camera?.getWorldDirection && camera?.position) {
      if (!this._scratchCamDir) this._scratchCamDir = camera.position.clone();
      camera.getWorldDirection(this._scratchCamDir);
      const dx = worldPos.x - camera.position.x;
      const dy = worldPos.y - camera.position.y;
      const dz = worldPos.z - camera.position.z;
      if (dx * this._scratchCamDir.x + dy * this._scratchCamDir.y + dz * this._scratchCamDir.z <= 0.5) {
        isBehind = true;
      }
    }
    if (isBehind) {
      el.style.display = 'none';
      return;
    }

    const screenX = (p.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-p.y * 0.5 + 0.5) * window.innerHeight;

    // Check if within screen bounds
    if (screenX < -50 || screenX > window.innerWidth + 50 || screenY < -50 || screenY > window.innerHeight + 50) {
      el.style.display = 'none';
      return;
    }

    el.style.display = 'flex';
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;

    if (el._lastName !== name) {
      el._lastName = name;
      el._nameSpan.textContent = name.slice(0, 12);
    }
    if (el._lastPing !== ping) {
      el._lastPing = ping;
      const pingColor = ping < 60 ? '#10b981' : ping < 120 ? '#f59e0b' : '#ef4444';
      el._dotSpan.style.background = pingColor;
      el._dotSpan.style.boxShadow = `0 0 6px ${pingColor}`;
      el._pingSpan.textContent = `${ping}ms`;
    }
  }

  // --- IN-GAME EMOTES & QUICK CHAT ---
  sendEmote(text) {
    if (this.state !== 'RACING') return false;
    const now = performance.now();
    if (this.lastEmoteTime && now - this.lastEmoteTime < 750) return false;
    this.lastEmoteTime = now;
    this.displayEmoteBubble(this.mySlot, text);
    this.broadcastToAll({
      type: 'EMOTE',
      slot: this.mySlot,
      text: text
    });
    if (this.onEmote) {
      this.onEmote({ slot: this.mySlot, text: text });
    }
    return true;
  }

  displayEmoteBubble(slot, text) {
    if (!this.nametagsLayer) return;

    let emote = this.emoteEls.get(slot);
    if (!emote) {
      const el = document.createElement('div');
      el.className = 'z-mp-speech-bubble';
      el.style.cssText = `
        position: absolute;
        transform: translate(-50%, -100%) scale(1);
        background: #ffc857;
        border: 2px solid #ffffff;
        border-radius: 16px;
        padding: 6px 14px;
        font-family: sans-serif;
        font-weight: 900;
        font-size: 18px;
        color: #061626;
        box-shadow: 0 6px 20px rgba(0,0,0,0.45);
        pointer-events: none;
        user-select: none;
        white-space: nowrap;
        animation: z-pop-bounce 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      `;
      this.nametagsLayer.appendChild(el);
      emote = { el, expireTime: 0 };
      this.emoteEls.set(slot, emote);
    }

    emote.el.textContent = text;
    emote.expireTime = performance.now() + 2600;
    emote.el.style.display = 'block';
    emote.el.style.opacity = '1';

    // Rimozione dal DOM dopo 6s (protegge il caso nodo gia' rimosso)
    if (emote._removeTimer) clearTimeout(emote._removeTimer);
    emote._removeTimer = setTimeout(() => {
      try { emote.el?.remove?.(); } catch {}
      if (this.emoteEls.get(slot) === emote) this.emoteEls.delete(slot);
    }, 6000);
  }

  updateEmoteBubbles(now, director, camera) {
    if (!this._scratchEmoteVec && camera?.position?.clone) {
      this._scratchEmoteVec = camera.position.clone();
    }
    for (const [slot, emote] of this.emoteEls.entries()) {
      if (now > emote.expireTime) {
        emote.el.style.display = 'none';
      } else {
        const racer = director?.racers?.[slot];
        if (racer && camera) {
          const p = this._scratchEmoteVec || racer.pos.clone();
          p.copy(racer.pos);
          p.y += 3.2; // Float above nametag
          p.project(camera);

          let isBehind = p.z > 1.0;
          if (camera?.getWorldDirection && camera?.position) {
            if (!this._scratchEmoteCamDir) this._scratchEmoteCamDir = camera.position.clone();
            camera.getWorldDirection(this._scratchEmoteCamDir);
            const dx = racer.pos.x - camera.position.x;
            const dy = racer.pos.y - camera.position.y;
            const dz = racer.pos.z - camera.position.z;
            if (dx * this._scratchEmoteCamDir.x + dy * this._scratchEmoteCamDir.y + dz * this._scratchEmoteCamDir.z <= 0.5) {
              isBehind = true;
            }
          }
          if (isBehind) {
            emote.el.style.display = 'none';
            continue;
          }

          const screenX = (p.x * 0.5 + 0.5) * window.innerWidth;
          const screenY = (-p.y * 0.5 + 0.5) * window.innerHeight;

          emote.el.style.display = 'block';
          emote.el.style.left = `${screenX}px`;
          emote.el.style.top = `${screenY}px`;
        }
      }
    }
  }

  clearAllNametags() {
    for (const el of this.nametagEls.values()) el.remove();
    this.nametagEls.clear();
    for (const emote of this.emoteEls.values()) emote.el.remove();
    this.emoteEls.clear();
  }

  sendItemUse(itemType, pos, dir) {
    this.broadcastToAll({
      type: 'ITEM_USE',
      slot: this.mySlot,
      itemType: itemType,
      pos: pos,
      dir: dir
    });
  }

  sendRacerHit(slot, duration = 1.0) {
    this.broadcastToAll({
      type: 'RACER_HIT',
      slot: slot,
      duration: duration
    });
  }

  sendPlayerFinish(finishTime, rank) {
    this.broadcastToAll({
      type: 'PLAYER_FINISH',
      slot: this.mySlot,
      finishTime: finishTime,
      rank: rank
    });
  }

  requestRematch(nextTrack = false) {
    if (!this.isHost) return;
    if (nextTrack) {
      const totalTracks = (typeof window !== 'undefined' && window.__ZEPHYR_TRACKS?.length) || 24;
      this.trackIndex = (this.trackIndex + 1) % totalTracks;
    }
    this.broadcastToAll({
      type: 'REMATCH',
      trackIndex: this.trackIndex
    });
    if (this.onRematch) {
      this.onRematch({ trackIndex: this.trackIndex });
    }
  }

  leaveRoom() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = null;
    if (this._joinWatchdog) {
      clearTimeout(this._joinWatchdog);
      this._joinWatchdog = null;
    }

    for (const conn of this.connections.values()) {
      try { conn.close(); } catch {}
    }
    this.connections.clear();

    if (this.hostConnection) {
      try { this.hostConnection.close(); } catch {}
      this.hostConnection = null;
    }

    if (this.peer) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }

    this.clearAllNametags();
    this.updateHudPing();

    this.state = 'IDLE';
    this.roomCode = '';
    this.isHost = false;
    this.players = [];
    this.playlistIndex = 0;
    this.tournamentScores.clear();
    this.lastRaceResults = [];
    this.isTournamentComplete = false;
    this.remoteStates.clear();
    this.peerSlots.clear();
    this.spoofStrikes.clear();
    this.eventRateLimits.clear();
    this.rttSamples.clear();
    this.lastRtt = 0;
    this.clockOffsetSamples.length = 0;
    this.clockOffset = null;
    this.notifyLobbyUpdate();
  }

  toast(msg) {
    console.log(`[Multiplayer Toast] ${msg}`);
    if (this.onToast) this.onToast(msg);
    else if (window.__zephyr?.ui?.toast) window.__zephyr.ui.toast(msg, 2.8);
  }
}

if (typeof window !== 'undefined') {
  window.MultiplayerManager = MultiplayerManager;
}
