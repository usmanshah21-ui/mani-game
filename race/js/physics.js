/**
 * VELOCITY RUSH – Physics Engine
 * Continuous spline-based track confinement + car-car collision.
 * Replaces the old sparse-barrier approach that allowed cars to escape.
 */

const PhysicsEngine = (() => {

  /**
   * Check and resolve collisions between all cars.
   * Uses sphere-sphere collision detection.
   */
  function resolveCarCollisions(cars, particles) {
    const radius = 2.0;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const distSq = dx * dx + dz * dz;
        const minDist = radius * 2;

        if (distSq < minDist * minDist && distSq > 0.001) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          const nx = dx / dist;
          const nz = dz / dist;

          // Separate cars proportionally by their speeds
          const aFactor = Math.abs(b.speed) > 0.01 ? 0.6 : 0.4;
          const bFactor = 1.0 - aFactor;
          a.group.position.x -= nx * overlap * aFactor;
          a.group.position.z -= nz * overlap * aFactor;
          b.group.position.x += nx * overlap * bFactor;
          b.group.position.z += nz * overlap * bFactor;
          a.position.copy(a.group.position);
          b.position.copy(b.group.position);

          // Speed exchange (elastic-ish)
          const speedDiff = Math.abs(a.speed - b.speed);
          a.speed *= 0.75;
          b.speed *= 0.75;

          // Damage
          const severity = Math.min(1, speedDiff / 15);
          a.takeDamage(severity * 0.08);
          b.takeDamage(severity * 0.08);

          // Sparks
          if (particles && severity > 0.25) {
            const mid = new THREE.Vector3(
              (a.position.x + b.position.x) / 2,
              0.5,
              (a.position.z + b.position.z) / 2,
            );
            particles.createSparks(mid, 8);
            AudioEngine.playCollision(Math.min(1, severity));
          }
        }
      }
    }
  }

  /**
   * CONTINUOUS spline-based track confinement.
   * Computes the car's lateral deviation from the spline center
   * and instantly pushes it back if it exceeds trackWidth/2.
   * This is called every frame and ensures zero escape.
   */
  function resolveBarrierCollisions(car, track, particles) {
    // Find nearest spline point (uses coarse grid then fine-tuned)
    const t = track.getProgress(car.position);

    // Get the position and tangent at nearest t
    const nearPt  = track.getPositionAt(t);
    const tangent  = track.getTangentAt(t).normalize();

    // Track normal (perpendicular, horizontal)
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    // Compute the car's lateral offset from center-line
    const dx = car.position.x - nearPt.x;
    const dz = car.position.z - nearPt.z;
    const lateral = dx * normal.x + dz * normal.z; // signed

    // Half-width limit (leave 1.5m gap for the car's body)
    const halfWidth = track.trackWidth / 2 - 1.5;

    if (Math.abs(lateral) > halfWidth) {
      const excess = Math.abs(lateral) - halfWidth;
      const sign   = Math.sign(lateral);

      // ── Push the car firmly back inside ──────────────────────────
      car.group.position.x -= normal.x * sign * excess * 1.05;
      car.group.position.z -= normal.z * sign * excess * 1.05;
      car.position.copy(car.group.position);

      // Kill the lateral velocity component
      const velDotNormal = car.velocity.x * normal.x + car.velocity.z * normal.z;
      if (Math.sign(velDotNormal) === sign) {
        // Remove outward velocity component
        car.velocity.x -= normal.x * velDotNormal * 1.2;
        car.velocity.z -= normal.z * velDotNormal * 1.2;
        // Friction loss
        car.speed *= 0.60;
      }

      // Damage
      car.takeDamage(0.015);

      // Sparks on hard hits
      if (particles && Math.abs(car.speed) > 1.5 && Math.abs(excess) > 0.5) {
        const sparkPos = car.position.clone();
        sparkPos.x += normal.x * sign * halfWidth;
        sparkPos.z += normal.z * sign * halfWidth;
        sparkPos.y = 0.4;
        particles.createSparks(sparkPos, 5);
        AudioEngine.playCollision(0.35);
      }

      return true;
    }

    return false;
  }

  /**
   * Keep car on ground.
   */
  function keepOnGround(car) {
    if (car.group.position.y < 0) car.group.position.y = 0;
  }

  /**
   * Emergency reset: teleport car back if it somehow got very far off track.
   * This is a safety net; the barrier check should prevent this.
   */
  function checkOffTrack(car, track) {
    const t = track.getProgress(car.position);
    const nearPt = track.getPositionAt(t);
    const dx = car.position.x - nearPt.x;
    const dz = car.position.z - nearPt.z;
    const distFromCenter = Math.sqrt(dx * dx + dz * dz);

    // Only reset if VERY far off (emergency fallback)
    if (distFromCenter > track.trackWidth * 1.8) {
      const tangent = track.getTangentAt(t);
      const angle = Math.atan2(tangent.x, tangent.z);
      nearPt.y = 0;
      car.teleportTo(nearPt, angle);
      return true;
    }
    return false;
  }

  return {
    resolveCarCollisions,
    resolveBarrierCollisions,
    keepOnGround,
    checkOffTrack,
  };
})();
