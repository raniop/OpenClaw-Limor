import { WALK_TARGETS } from "../agent-config";
import type { AnimState } from "./VoxelCharacter";

export interface BehaviorState {
  anim: AnimState;
  position: [number, number, number];
  targetPosition: [number, number, number] | null;
  rotation: number; // Y-axis rotation (facing direction)
  timer: number; // seconds until next state change
  homePos: [number, number, number]; // desk position
}

const WALK_SPEED = 1.5; // units per second

export function initBehavior(homePos: [number, number, number], isOrchestrator: boolean): BehaviorState {
  return {
    anim: isOrchestrator ? "presenting" : "typing",
    position: [...homePos],
    targetPosition: null,
    rotation: Math.PI, // Face -z direction (toward desk/monitor/screens)
    timer: 8 + Math.random() * 15,
    homePos,
  };
}

export function updateBehavior(state: BehaviorState, delta: number, isOrchestrator: boolean): BehaviorState {
  const next = { ...state };
  next.timer -= delta;

  // If walking, move toward target
  if (next.anim === "walking" && next.targetPosition) {
    const dx = next.targetPosition[0] - next.position[0];
    const dz = next.targetPosition[2] - next.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.2) {
      // Arrived
      next.position = [...next.targetPosition];
      next.targetPosition = null;
      // Pick a stationary action at destination
      const isHome =
        Math.abs(next.position[0] - next.homePos[0]) < 1 &&
        Math.abs(next.position[2] - next.homePos[2]) < 1;
      if (isHome) {
        next.anim = isOrchestrator ? "presenting" : "typing";
        next.rotation = Math.PI; // Face desk/monitor (-z direction)
      } else {
        next.anim = Math.random() > 0.5 ? "talking" : "idle";
      }
      next.timer = 4 + Math.random() * 8;
    } else {
      // Move
      const step = WALK_SPEED * delta;
      const ratio = Math.min(step / dist, 1);
      next.position = [
        next.position[0] + dx * ratio,
        0,
        next.position[2] + dz * ratio,
      ];
      // Face walking direction
      next.rotation = Math.atan2(dx, dz);
    }
    return next;
  }

  // Timer expired - pick new behavior
  if (next.timer <= 0) {
    const roll = Math.random();

    if (isOrchestrator) {
      // Limor mostly presents, sometimes walks to agents
      if (roll < 0.7) {
        next.anim = "presenting";
        next.timer = 6 + Math.random() * 10;
      } else {
        // Walk somewhere
        next.anim = "walking";
        const target = WALK_TARGETS[Math.floor(Math.random() * WALK_TARGETS.length)];
        next.targetPosition = [...target.pos];
        next.timer = 30; // timeout
      }
    } else {
      // Check if currently at desk
      const atDesk =
        Math.abs(next.position[0] - next.homePos[0]) < 1 &&
        Math.abs(next.position[2] - next.homePos[2]) < 1;

      if (atDesk) {
        // At desk: mostly keep working, occasionally get up
        if (roll < 0.7) {
          // Keep typing at desk
          next.anim = "typing";
          next.rotation = Math.PI;
          next.timer = 8 + Math.random() * 15;
        } else if (roll < 0.85) {
          // Walk to a random destination (break, meeting, hallway)
          next.anim = "walking";
          const target = WALK_TARGETS[Math.floor(Math.random() * WALK_TARGETS.length)];
          next.targetPosition = [...target.pos];
          next.targetPosition[0] += (Math.random() - 0.5) * 2;
          next.targetPosition[2] += (Math.random() - 0.5) * 2;
          next.timer = 30;
        } else {
          // Brief idle/stretch at desk
          next.anim = "idle";
          next.rotation = Math.PI;
          next.timer = 2 + Math.random() * 3;
        }
      } else {
        // Away from desk: mostly head back, sometimes linger
        if (roll < 0.6) {
          // Go back to desk
          next.anim = "walking";
          next.targetPosition = [...next.homePos];
          next.timer = 30;
        } else if (roll < 0.8) {
          // Talk where they are
          next.anim = "talking";
          next.timer = 3 + Math.random() * 5;
        } else {
          // Walk somewhere else
          next.anim = "walking";
          const target = WALK_TARGETS[Math.floor(Math.random() * WALK_TARGETS.length)];
          next.targetPosition = [...target.pos];
          next.targetPosition[0] += (Math.random() - 0.5) * 2;
          next.targetPosition[2] += (Math.random() - 0.5) * 2;
          next.timer = 30;
        }
      }
    }
  }

  return next;
}
