/**
 * VELOCITY RUSH – AI Opponent Controller
 * Spline-following with PID steering, overtaking, blocking,
 * nitro usage, and human-like error injection.
 */

class AIController {
  constructor(car, track, difficulty = 'medium') {
    this.car = car;
    this.track = track;
    this.difficulty = difficulty;
    this.settings = CONFIG.difficulty[difficulty] || CONFIG.difficulty.medium;

    // AI state
    this.targetT = 0;        // target position on spline
    this.lookahead = 0.02;   // how far ahead to look on spline
    this.errorTimer = 0;     // time until next mistake
    this.errorAmount = 0;    // current steering error
    this.overtakeTimer = 0;  // cooldown for overtake maneuver
    this.isOvertaking = false;
    this.overtakeSide = 1;
    this.blockingTimer = 0;
    this.isBlocking = false;

    // Synthesized input state (mimics human input)
    this._input = {
      accel: true, brake: false, left: false, right: false,
      nitro: false, drift: false,
      getAnalogSteer: () => this._steerValue,
      getThrottle: () => this._throttleValue,
    };
    this._steerValue = 0;
    this._throttleValue = 0;

    // Schedule first error
    this._scheduleError();
  }

  _scheduleError() {
    this.errorTimer = 2000 + Math.random() * 5000 / this.settings.aiSpeed;
  }

  update(dt, otherCars = []) {
    const car = this.car;
    const track = this.track;

    // Get current track progress
    const currentT = track.getProgress(car.position);
    car.progress = currentT;

    // Look ahead on the spline
    const lookT = (currentT + this.lookahead) % 1;
    const targetPos = track.getPositionAt(lookT);
    const tangent = track.getTangentAt(lookT);

    // Compute desired heading
    const dx = targetPos.x - car.position.x;
    const dz = targetPos.z - car.position.z;
    const desiredHeading = Math.atan2(dx, dz);

    // Heading error
    let headingError = desiredHeading - car.heading;
    // Normalize to [-PI, PI]
    while (headingError > Math.PI) headingError -= 2 * Math.PI;
    while (headingError < -Math.PI) headingError += 2 * Math.PI;

    // Add error / mistakes
    this.errorTimer -= dt * 16;
    if (this.errorTimer <= 0) {
      this.errorAmount = (Math.random() - 0.5) * this.settings.aiError * 2;
      this._scheduleError();
    }
    headingError += this.errorAmount;

    // Steer value (-1 to 1)
    let steer = Math.max(-1, Math.min(1, headingError * 3));

    // Overtake maneuver
    if (this.overtakeTimer > 0) {
      this.overtakeTimer -= dt * 16;
      if (this.isOvertaking) steer += this.overtakeSide * 0.4;
    } else {
      this.isOvertaking = false;
      // Check for nearby cars ahead → try to overtake
      otherCars.forEach(other => {
        if (other === car) return;
        const od = car.position.distanceTo(other.position);
        if (od < 12 && od > 2) {
          // Is the other car ahead?
          const toOther = new THREE.Vector3().subVectors(other.position, car.position);
          const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
          if (toOther.dot(forward) > 0) {
            // Attempt overtake
            this.isOvertaking = true;
            this.overtakeSide = Math.sign(toOther.cross(forward).y) || 1;
            this.overtakeTimer = 60 + Math.random() * 40;
          }
        }
      });
    }

    // Adapt lookahead to speed (faster = look further)
    this.lookahead = 0.015 + (Math.abs(car.speed) / car.maxSpeed) * 0.025;

    // Brake on sharp turns
    const curvature = Math.abs(headingError);
    const needsBrake = curvature > 0.5 && car.speed > car.maxSpeed * 0.5;

    // Throttle
    let throttle = needsBrake ? 0.3 : this.settings.aiSpeed;
    // Ramp up slowly from start
    if (car.speed < 0.5) throttle = 1.0;

    // Nitro usage: use on straights when above 60% speed
    const straight = curvature < 0.1;
    const fastEnough = car.speed > car.maxSpeed * 0.6;
    this._input.nitro = straight && fastEnough && car.nitro > 0.3;

    // Drift: slide into sharp corners
    this._input.drift = curvature > 0.7;

    this._steerValue = steer;
    this._throttleValue = needsBrake ? (Math.random() < 0.3 ? -0.5 : 0.3) : throttle;

    // Apply to car
    car.update(this._input, dt, 1.0);

    // Keep on ground
    car.group.position.y = 0;
  }
}
