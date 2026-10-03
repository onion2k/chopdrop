/**
 * A pilot that flies the level as a careful player would: up clear of the
 * highest ground between it and the pad that is wanted, turned toward it,
 * across at speed, braked to arrive slowly over it, down onto it, and still
 * while the parcel loads. With a level going it flies that level; with nothing
 * going, and a level told to it by name, it flies from wherever it is to that
 * level's start, doing its first step as if it were the level's own, and then
 * on through the level. It reads only what a player can see (where the
 * helicopter is, and the pad or the opening that is wanted) and asks only for
 * what a player can ask for, through the same `Controls`. It draws on no
 * chance and keeps no memory beyond the game's and the level it was told, so
 * the same game flown by it is flown the same way twice.
 *
 * With nothing going and no level told to it, it can be told a structure by name, and flies through its opening, from
 * whichever side is nearer, and then stands still: the play-through collects the structures by it.
 *
 * A level that begins with a person to winch up is flown to as a pad is, over the treetops, and the helicopter is
 * brought down over the person to the middle of the winch's window and held still there, never landed, until the
 * winch has run; then it is flown home as any level is.
 *
 * With nothing going, and no structure to collect, it can be told a package by name, and flies to it as it flies to a
 * pad, over the treetops, and comes straight down onto the clearing's middle: the play-through finds the packages by it.
 *
 * The gates play the game through it: the pace of a level, the same game
 * twice, nothing kept for ever over a long play, and the play-through in the
 * page. Without it none of them has anything to time or watch.
 */
import type { Collectible, PackagePlace } from './arena';
import type { Game } from './game';
import { HELICOPTER, HOVER_LIFT, type Controls } from './helicopter';
import { RING, WINCH_MIDDLE, onPad, type Gate, type Level, type Ring } from './mission';

/** How it flies. Distances are world units, speeds a second. */
export const PILOT = {
  /** How far over the highest ground on its way it cruises, and over the pad it comes to, before it comes down. */
  clear: 18,
  /** How many points along its way it looks at the ground over, to find the highest. */
  look: 24,
  /** The heading it must be within of the pad, in radians, before it pushes forward; and how hard it turns toward it. */
  aimed: 0.35,
  steer: 2.5,
  /** How it comes in: the speed it may have at a distance is what braking at `brake` would shed by the pad. */
  brake: 9,
  /** How near the pad's middle it must be, and how slow, to come down onto it. */
  over: 2.5,
  slow: 1.5,
  /** How hard it holds a height: lift for each unit it is off it, about the lift that holds still. */
  hold: 0.25,
  /**
   * How it flies a ring: onto its axis this far before it, at its height, where it is wide of it; on past it once within
   * `line` of its face; through at `through`; and beside a ring it has missed, this far out past its rim before it goes
   * round behind it again.
   */
  lead: 25,
  line: 2,
  through: 16,
  beside: 18,
  /** How wide a cone behind a ring, about its axis, it flies straight at the ring's middle from: a tan of 45 degrees. */
  cone: 1,
  /**
   * How wide a cone it flies a structure's opening from, in place of `cone`: a gap in a gorge cannot be come at across
   * its walls, which the wide cone flies it from, so it goes first to the opening's axis and comes along it.
   */
  structureCone: 0.2,
  /** How near in front of a ring's face it goes straight out sideways first. */
  near: 10,
  /** How near its rotor may come to a block on its way before it goes round or over. */
  margin: 3,
};

export class Autopilot {
  /** The controls it asks for, written in place each step. */
  private readonly controls: Controls = { forward: 0, turn: 0, lift: 0 };

  /** The level it is told to do while nothing is going, found once when it is told so that driving makes nothing. */
  private told: Level | null = null;

  /** The opening of the structure it is told to collect, from the side it flies it from, chosen when it first drives and then kept; null for none. */
  private flying: Gate | null = null;
  /** The structure it is told to collect while nothing else is asked of it, found once when it is told; null for none. */
  private collecting: Collectible | null = null;
  /** The package it is told to land by while nothing else is asked of it, found once when it is told; null for none. */
  private seeking: PackagePlace | null = null;
  /** Each collectible's opening and the same turned about, built once, so that choosing a side makes nothing. */
  private readonly sides: { id: string; ahead: Gate; behind: Gate }[];

  constructor(readonly game: Game) {
    const { collectibles } = game.collection;
    this.sides = collectibles.map(({ id, opening }) => ({
      id,
      ahead: opening,
      behind: { ...opening, yaw: opening.yaw + Math.PI },
    }));
  }

  /** The id of the structure it will fly through while nothing else is asked of it, or null for none; an id the game does not have is refused. */
  get collect(): string | null {
    return this.collecting?.id ?? null;
  }

  set collect(id: string | null) {
    this.flying = null;
    if (id === null) {
      this.collecting = null;
      return;
    }
    const found = this.game.collection.collectibles.find((c) => c.id === id);
    if (!found) throw new Error(`no such structure: ${id}`);
    this.collecting = found;
  }

  /** The id of the package it will go and land by while nothing else is asked of it, or null for none; an id the game does not have is refused. */
  get find(): string | null {
    return this.seeking?.id ?? null;
  }

  set find(id: string | null) {
    if (id === null) {
      this.seeking = null;
      return;
    }
    const place = this.game.finds.places.find((p) => p.id === id);
    if (!place) throw new Error(`no such package: ${id}`);
    this.seeking = place;
  }

  /** The name of the level it will fly to and do while nothing is going, or null for none; a name the game does not have is refused. */
  get wanted(): string | null {
    return this.told?.id ?? null;
  }

  set wanted(id: string | null) {
    if (id === null) {
      this.told = null;
      return;
    }
    const level = this.game.levels.find((l) => l.id === id);
    if (!level) throw new Error(`no such level: ${id}`);
    this.told = level;
  }

  /** One step of the game, flown by it. */
  step(dt: number): void {
    this.game.step(dt, this.drive());
  }

  /**
   * What it would ask for now, from where the helicopter is and the step that is wanted: the step of the level going, or
   * with nothing going the first step of the level it is told, which is flown as the level's own. Nothing is made.
   */
  drive(): Controls {
    const c = this.controls;
    const { mission, helicopter: h, island, starts } = this.game;
    c.forward = 0;
    c.turn = 0;
    c.lift = 0;
    const step = mission.current ?? this.told?.steps[0];
    if (!step) {
      // a structure first, which is quick, and then a package; each only while it is not yet done
      if (this.collecting && !this.game.collection.has(this.collecting.id)) return this.collectStructure();
      if (this.seeking && !this.game.finds.has(this.seeking.id)) return this.flyTo(this.seeking, true);
      return c;
    }
    if (step.kind === 'ring' || step.kind === 'gate') return this.through(step);
    // a person: flown to over the treetops, and held in the middle of the window over them while the winch runs; never
    // landed, which is too low for it
    if (step.kind === 'winch') return this.flyTo(step, true, WINCH_MIDDLE);
    const pad = island.pads[step.pad];
    // on the pad that is wanted: still, while the parcel loads; unless a level has just ended on it, which loads
    // nothing until the helicopter has lifted off, so up it goes, and comes down on it again
    if (onPad(h, pad)) {
      if (!mission.level && starts.blocked === step.pad) c.lift = 1;
      return c;
    }

    return this.flyTo(pad, false);
  }

  /**
   * To a place and down onto it: up to its cruise, turned toward it, across at speed, braked to arrive slowly over it, and
   * straight down once it is over it and all but stopped. A pad is flown to over the highest ground on the way; a package,
   * which lies in a wood, over the treetops too, since a crown is no ground it can fly through. With `holdAt`, a height
   * over the ground, it comes down to that and holds there, still, in place of landing: a person is winched up from it.
   */
  private flyTo(to: { x: number; y: number; z: number }, overTrees: boolean, holdAt?: number): Controls {
    const c = this.controls;
    const { helicopter: h } = this.game;
    let dx = to.x - h.x,
      dy = to.y - h.y;
    const far = Math.hypot(dx, dy);
    let cruise = this.cruise(to.x, to.y, to.z);
    if (overTrees) cruise = Math.min(HELICOPTER.ceiling, Math.max(cruise, this.treetops(to.x, to.y) + PILOT.clear / 2));
    // round a tower or over the deck, where one is in the way
    if (this.detour(null, to.x, to.y, cruise)) {
      dx = this.via.x - h.x;
      dy = this.via.y - h.y;
      cruise = this.via.z;
    }
    if (far < PILOT.over && h.speed < PILOT.slow) {
      if (holdAt === undefined) {
        // over it and all but stopped: straight down onto it
        c.lift = -1;
        return c;
      }
      // over it and all but stopped: down to the height asked and held there, over the ground under the helicopter
      const want = this.game.island.ground.heightAt(h.x, h.y) + holdAt;
      c.lift = clamp(HOVER_LIFT + (want - h.z) * PILOT.hold, -1, 1);
      return c;
    }

    const heading = Math.atan2(dy, dx);
    const off = wrap(heading - h.yaw);
    c.turn = clamp(off * PILOT.steer, -1, 1);
    // the speed it may have here, to shed by the place; ahead of that, brake
    const along = h.vx * Math.cos(h.yaw) + h.vy * Math.sin(h.yaw);
    const allowed = Math.min(HELICOPTER.maxSpeed, Math.sqrt(2 * PILOT.brake * Math.max(0, far - PILOT.over / 2)));
    const high = h.z > cruise - PILOT.clear / 2;
    if (Math.abs(off) < PILOT.aimed && high) c.forward = clamp((allowed - along) / 4, -1, 1);
    else if (along > 1) c.forward = -1;
    // up to its cruise and held there, and never lower while it has a way to go; and off the ground first, which it
    // cannot move across: a detour that holds the height it is at, as the way out from under a deck does, asks for
    // no climb, and a helicopter that had settled on the ground there would sit pressing forward for ever
    c.lift = h.landed ? 1 : clamp(HOVER_LIFT + (cruise - h.z) * PILOT.hold, -1, 1);
    return c;
  }

  /** The top of the highest crown on the straight way from here to (x, y), or −Infinity over no wood. Makes nothing. */
  private treetops(x: number, y: number): number {
    const { helicopter: h, canopy } = this.game;
    let top = -Infinity;
    for (let k = 0; k <= PILOT.look; k++) {
      const t = k / PILOT.look;
      top = Math.max(top, canopy.heightAt(h.x + (x - h.x) * t, h.y + (y - h.y) * t));
    }
    return top;
  }

  /**
   * The structure it is told to collect: through its opening from the side it is nearer, chosen once and kept, so it
   * never turns back at the plane; and nothing once it is collected.
   */
  private collectStructure(): Controls {
    const c = this.collecting!;
    if (this.game.collection.has(c.id)) return this.controls;
    if (!this.flying) {
      const { ahead, behind } = this.sides.find((s) => s.id === c.id)!;
      const h = this.game.helicopter;
      // behind the opening as it faces is where a helicopter on its negative side is
      this.flying = (h.x - ahead.x) * Math.cos(ahead.yaw) + (h.y - ahead.y) * Math.sin(ahead.yaw) < 0 ? ahead : behind;
    }
    return this.through(this.flying, PILOT.structureCone);
  }

  /**
   * A ring: from anywhere behind it within the cone of `cone` about its axis, straight at its middle, which a straight
   * line through crosses at the middle; wider than that, to the point on its axis `lead` before it first. From in front
   * of it, round its rim to just behind it, going straight out sideways first if it is near its face, so it never flies
   * into the tube; and from far off, high enough over the ground on its way, as to a pad. Another ring in the way is
   * gone round, as `detour` says.
   */
  private through(r: Ring | Gate, cone: number = PILOT.cone): Controls {
    const c = this.controls;
    const h = this.game.helicopter;
    const ax = Math.cos(r.yaw),
      ay = Math.sin(r.yaw);
    const dx = h.x - r.x,
      dy = h.y - r.y;
    const along = dx * ax + dy * ay;
    const across = -dx * ay + dy * ax;
    const side = across < 0 ? -1 : 1;
    const wide = (r.kind === 'ring' ? r.opening : r.width / 2) + PILOT.beside;
    let to: number, off: number;
    let speed: number = PILOT.through;
    if (along < 0 && Math.abs(across) < -along * cone) {
      // behind it, within the cone: at its middle, and once at its face, on past it
      to = along > -PILOT.line ? PILOT.lead : 0;
      off = 0;
    } else if (along < 0) {
      // behind it, but wide of it: to its axis, before it
      to = -PILOT.lead;
      off = 0;
      speed = HELICOPTER.maxSpeed;
    } else if (along < PILOT.near && Math.abs(across) < wide) {
      // just in front of it: straight out sideways past its rim, before anything else
      to = Math.max(along, 5);
      off = side * wide;
    } else {
      // further in front of it, or out past its rim: to just behind it beside its rim, which a straight line from
      // here passes clear of its opening
      to = -5;
      off = side * wide;
    }
    let tx = r.x + to * ax - off * ay,
      ty = r.y + to * ay + off * ax;
    // the ring's height when near it; from further off, high enough over the ground on the way there too
    const height = r.z - HELICOPTER.size.middle;
    // down to an opening's height from further off than a ring's, so it is level before it is under anything
    const far = Math.hypot(r.x - h.x, r.y - h.y) > PILOT.lead * (r.kind === 'gate' ? 3 : 2);
    let want = far ? Math.max(height, this.cruise(tx, ty, -Infinity)) : height;
    if (this.detour(r, tx, ty, want)) ({ x: tx, y: ty, z: want } = this.via);
    const heading = Math.atan2(ty - h.y, tx - h.x);
    const turn = wrap(heading - h.yaw);
    c.turn = clamp(turn * PILOT.steer, -1, 1);
    const ahead = h.vx * Math.cos(h.yaw) + h.vy * Math.sin(h.yaw);
    // at its height before it goes on, and only on along the way it is pointing
    if (Math.abs(turn) < PILOT.aimed && h.z > want - 6) c.forward = clamp((speed - ahead) / 4, -1, 1);
    else if (ahead > 1) c.forward = -1;
    // off the ground first, which it cannot turn on
    c.lift = h.landed ? 1 : clamp(HOVER_LIFT + (want - h.z) * PILOT.hold, -1, 1);
    return c;
  }

  /**
   * Whether something is in the way to (tx, ty) at the height `want`, and if so where to go instead and how high,
   * written into `via`. A ring that is solid now (those of the level going, and every start ring) other than `wanted`: caught in it, inside its opening or under, over or beside it within
   * its tube's reach, out along its axis the side the goal is, holding its height so as not to climb or sink into it;
   * and where the way would cross its face near enough its opening for the rotor to touch, past its rim instead, on the
   * side the way was nearer. A block: a low one, as the deck is, gone over, unless what is wanted is under it, and from
   * under it, out across it first; a tall one, as a tower is, gone round, on the side the way passes it.
   */
  private detour(wanted: Ring | Gate | null, tx: number, ty: number, want: number): boolean {
    const h = this.game.helicopter;
    const { middle, rotorRadius } = HELICOPTER.size;
    for (const o of this.game.solids.rings) {
      if (o === wanted) continue;
      const ax = Math.cos(o.yaw),
        ay = Math.sin(o.yaw);
      const from = (h.x - o.x) * ax + (h.y - o.y) * ay;
      const goal = (tx - o.x) * ax + (ty - o.y) * ay;
      const fromAcross = -(h.x - o.x) * ay + (h.y - o.y) * ax;
      const fromUp = h.z + middle - o.z;
      const reach = o.opening + RING.tube + rotorRadius;
      // anywhere under it counts, since what is under it would climb into it
      if (Math.abs(from) < rotorRadius + RING.tube && Math.abs(fromAcross) < reach && fromUp < reach) {
        const way = goal < 0 ? -1 : 1;
        this.via.x = o.x + ax * way * PILOT.lead;
        this.via.y = o.y + ay * way * PILOT.lead;
        this.via.z = h.z;
        return true;
      }
      if (from < 0 === goal < 0) continue;
      const t = from / (from - goal);
      const across = fromAcross + (-(tx - o.x) * ay + (ty - o.y) * ax - fromAcross) * t;
      const up = fromUp + (want - h.z) * t;
      if (Math.hypot(across, up) > o.opening + RING.tube + rotorRadius + 2) continue;
      const side = across < 0 ? -1 : 1;
      this.via.x = o.x - ay * side * (o.opening + PILOT.beside);
      this.via.y = o.y + ax * side * (o.opening + PILOT.beside);
      this.via.z = want;
      return true;
    }
    const { solids } = this.game;
    for (const block of solids.blocks) {
      // the way there, sampled from where it is, against the block: whether the rotor would come within the margin of it
      let near = false;
      for (let k = 0; k <= PILOT.look && !near; k++) {
        const t = k / PILOT.look;
        const z = h.z + (want - h.z) * t;
        near = solids.gapTo(block, h.x + (tx - h.x) * t, h.y + (ty - h.y) * t, z) < PILOT.margin;
      }
      if (!near) continue;
      if (block.height < block.length) {
        // low and wide: over it, unless what is wanted is under it; and from under it, out at the height it is first,
        // climbing only once the rotor is clear of it
        if (want + middle + rotorRadius < block.z) continue;
        if (h.z + middle + rotorRadius < block.z + PILOT.margin) {
          // straight out across it, on the side the goal is, so it passes nothing standing under it
          const c = Math.cos(block.yaw),
            s = Math.sin(block.yaw);
          const along = (h.x - block.x) * c + (h.y - block.y) * s;
          const side = -(tx - block.x) * s + (ty - block.y) * c < 0 ? -1 : 1;
          const out = side * (block.width / 2 + rotorRadius + PILOT.margin + 4);
          this.via.x = block.x + along * c - out * s;
          this.via.y = block.y + along * s + out * c;
          this.via.z = Math.min(want, h.z);
          return true;
        }
        this.via.x = tx;
        this.via.y = ty;
        this.via.z = Math.max(want, block.z + block.height + rotorRadius + PILOT.margin - middle);
        return true;
      }
      // tall: round it, beside its middle on the side the way passes, by its half diagonal and the rotor and a margin
      const dx = tx - h.x,
        dy = ty - h.y;
      const length = Math.hypot(dx, dy) || 1;
      const cross = (dx * (block.y - h.y) - dy * (block.x - h.x)) / length;
      const side = cross > 0 ? -1 : 1;
      const out = Math.hypot(block.length, block.width) / 2 + rotorRadius + PILOT.margin + 4;
      this.via.x = block.x + (-dy / length) * side * out;
      this.via.y = block.y + (dx / length) * side * out;
      this.via.z = want;
      return true;
    }
    return false;
  }

  /** Where `detour` sends it instead, and how high, written in place. */
  private readonly via = { x: 0, y: 0, z: 0 };

  /** How high to cruise to the pad at (x, y, z): over the highest ground between here and it, and over the pad. */
  private cruise(x: number, y: number, z: number): number {
    const { helicopter: h, island } = this.game;
    let top = z;
    for (let k = 0; k <= PILOT.look; k++) {
      const t = k / PILOT.look;
      top = Math.max(top, island.ground.heightAt(h.x + (x - h.x) * t, h.y + (y - h.y) * t));
    }
    return Math.min(HELICOPTER.ceiling, top + PILOT.clear);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** An angle wrapped into (−π, π]. */
function wrap(a: number): number {
  return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
}
