// Random events and decisions (DESIGN §17.1–17.2). Random events strike our own sites only
// (never a real company). Some historical events ask the GM to choose; the answer is an
// inbox decision with a deadline, after which the default applies.

import { CHOICE_EFFECTS, EVENT_PARAMS, HISTORY_CHOICES, RANDOM_EVENTS, type RandomEventDef, type RandomEventId } from '../../data/events';
import { monthOf, yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { clamp } from '../core/math';
import { roundCents } from '../core/money';
import { stream, type Rng } from '../core/rng';
import { grainCapacity } from '../facilities/facilities';
import { liquidity } from '../finance/lender';
import { post } from '../ledger/ledger';
import { effect } from '../people/leaders';
import { applyProposal } from '../people/proposals';
import type { CommandMessage } from '../sim/commands';
import type { TickContext } from '../sim/context';
import type { Facility, GameState, InboxChoice, InboxItem } from '../types';
import { nominalCents, pathFor } from './macro';
import { ruleActive, isCompliant } from './regulation';
import { REGULATIONS } from '../../data/events';
import { techFactor } from './tech';
import { yearFlags } from './weather';

export const flagOn = (s: GameState, name: string): boolean => (s.flags?.[name] ?? -1) >= s.clock.monthIndex;

function setFlag(s: GameState, name: string, months: number): void {
  s.flags = { ...s.flags, [name]: s.clock.monthIndex + months };
}

// ---------------- Decisions ----------------

function addChoice(s: GameState, item: Omit<InboxItem, 'id' | 'monthIndex' | 'read' | 'choice'>, choice: Omit<InboxChoice, 'deadline'>): void {
  s.inbox.push({ ...item, id: s.nextInboxId++, monthIndex: s.clock.monthIndex, read: false, choice: { ...choice, deadline: s.clock.monthIndex + EVENT_PARAMS.decisionMonths } });
}

/** After a historical event fires, ask the questions it raises. */
export function stepHistoryChoices(ctx: TickContext, fired: string[]): void {
  for (const id of fired) {
    const q = HISTORY_CHOICES.find((c) => c.eventId === id);
    if (!q) continue;
    if (id === 'oil-embargo-1973' && !ctx.state.coop.facilities.some((f) => f.division === 'ENERGY' && f.status !== 'closed')) continue;
    addChoice(ctx.state, { kind: 'memo', title: q.title, body: q.question }, { options: q.options, defaultId: q.defaultId, handler: id });
  }
}

/** Decisions still open, oldest first. */
export const openDecisions = (s: GameState): InboxItem[] => s.inbox.filter((i) => i.choice && !i.choice.chosen);

/** Apply an answer. Returns messages; an error leaves the decision open. */
function applyChoice(s: GameState, item: InboxItem, optionId: string, rng: Rng): CommandMessage[] {
  const c = item.choice!;
  const mi = s.clock.monthIndex;
  const path = pathFor(s);
  const members = () => s.members.list.filter((m) => m.status === 'active' && m.kind === 'member');
  switch (c.handler) {
    case 'oil-embargo-1973':
      if (optionId === 'program') {
        const fee = nominalCents(path, mi, CHOICE_EFFECTS.fuelProgramFee.value);
        post(s, { source: 'decision', memo: 'Regional fuel allocation program fee', lines: [{ account: '7600', division: 'ENERGY', amount: fee }, { account: '1000', division: 'CORP', amount: -fee }] });
        setFlag(s, 'fuelProgram', CHOICE_EFFECTS.fuelProgramMonths);
        return [{ level: 'info', text: `Joined the allocation program for ${formatCents(fee)}.` }];
      }
      return [{ level: 'info', text: 'We will buy fuel where we can.' }];
    case 'farm-crisis-1984': {
      const restructure = optionId === 'restructure';
      setFlag(s, restructure ? 'creditRestructure' : 'creditTight', CHOICE_EFFECTS.creditPolicyMonths);
      const delta = restructure ? CHOICE_EFFECTS.restructureSatisfaction.value : CHOICE_EFFECTS.tightenSatisfaction.value;
      for (const m of members()) m.satisfaction = clamp(m.satisfaction + delta, 0, 100);
      return [{ level: 'info', text: restructure ? 'Past-due accounts will be restructured.' : 'Credit tightened; collections stepped up.' }];
    }
    case 'ethanol-boom-2006': {
      if (optionId !== 'invest') return [{ level: 'info', text: 'We stay out of ethanol.' }];
      const cost = nominalCents(path, mi, CHOICE_EFFECTS.ethanolStake.value);
      if (cost > liquidity(s)) return [{ level: 'error', text: `Not enough cash and line of credit for ${formatCents(cost)}.` }];
      const name = `${s.world.towns[s.coop.homeTownId].name} Renewable Fuels LLC`;
      post(s, { source: 'ethanol-stake', memo: `Investment in ${name}`, lines: [{ account: '1450', division: 'GRAIN', amount: cost }, { account: '1000', division: 'CORP', amount: -cost }] });
      s.jvs = [...s.jvs, { id: 100000 + item.id, ethanol: true, investmentType: 'ethanol', name, partnerName: 'local investors', division: 'GRAIN', sharePct: CHOICE_EFFECTS.ethanolSharePct.value, investment: cost, scale: cost, formedMonth: mi, earningsYtd: 0 }];
      return [{ level: 'info', text: `Invested ${formatCents(cost)} in ${name}.` }];
    }
    case 'lawsuit': {
      const cost = c.data?.cost ?? 0;
      const fid = c.data?.facilityId ?? -1;
      const division = s.coop.facilities.find((f) => f.id === fid)?.division ?? 'CORP';
      const insured = RANDOM_EVENTS.lawsuit.insured;
      let paid: number;
      let text: string;
      if (optionId === 'settle') {
        paid = roundCents(cost * (1 - insured));
        text = `Settled for ${formatCents(cost)}; our share after insurance is ${formatCents(paid)}.`;
      } else if (rng.chance(EVENT_PARAMS.lawsuitWinProb.value)) {
        paid = roundCents(cost * 0.25);
        text = `We won in court. Legal fees came to ${formatCents(paid)}.`;
      } else {
        paid = roundCents(cost * EVENT_PARAMS.lawsuitLoseMultiple.value * (1 - insured) + cost * 0.25);
        text = `We lost in court. Damages and fees not covered by insurance: ${formatCents(paid)}.`;
      }
      if (paid > 0) post(s, { source: 'lawsuit', memo: 'Lawsuit', lines: [{ account: '7695', division, amount: paid }, { account: '1000', division: 'CORP', amount: -paid }] });
      s.inbox.push({ id: s.nextInboxId++, monthIndex: mi, read: false, kind: 'memo', title: 'Lawsuit resolved', body: text });
      return [{ level: 'info', text }];
    }
  }
  if (c.handler.startsWith('mgr.')) return applyProposal(s, item, optionId);
  return [];
}

/** Command: answer an inbox decision. */
export function chooseOption(s: GameState, inboxId: number, optionId: string): CommandMessage[] {
  const item = s.inbox.find((i) => i.id === inboxId);
  if (!item?.choice) return [{ level: 'error', text: 'No such decision.' }];
  if (item.choice.chosen) return [{ level: 'error', text: 'Already decided.' }];
  if (!item.choice.options.some((o) => o.id === optionId)) return [{ level: 'error', text: 'Unknown option.' }];
  const msgs = applyChoice(s, item, optionId, stream(s.setup.gameSeed, s.clock.monthIndex, 'events.choice', item.id));
  if (msgs.some((m) => m.level === 'error')) return msgs;
  s.inbox = s.inbox.map((i) => (i.id === inboxId ? { ...i, read: true, choice: { ...i.choice!, chosen: optionId } } : i));
  return msgs;
}

/** Decisions past their deadline take the default. */
export function stepChoices(ctx: TickContext): void {
  const { state, mi } = ctx;
  for (const item of openDecisions(state)) {
    if (item.choice!.deadline > mi) continue;
    let msgs = chooseOption(state, item.id, item.choice!.defaultId);
    if (msgs.some((m) => m.level === 'error')) {
      // The default itself failed (it never should); close the decision with no effect.
      state.inbox = state.inbox.map((i) => (i.id === item.id ? { ...i, choice: { ...i.choice!, chosen: i.choice!.defaultId } } : i));
      msgs = [];
    }
    ctx.summary.push(`No answer on "${item.body}" — the default applied.`);
  }
}

// ---------------- Random events ----------------

const active = (def: RandomEventDef, year: number) => year >= def.from && (def.to === undefined || year <= def.to);

function lossCost(ctx: TickContext, def: RandomEventDef): { gross: number; net: number } {
  const gross = nominalCents(ctx.path, ctx.mi, def.cost);
  return { gross, net: roundCents(gross * (1 - def.insured)) };
}

function chargeLoss(ctx: TickContext, f: Facility | null, id: RandomEventId, net: number, memo: string): void {
  if (net <= 0) return;
  post(ctx.state, { source: 'random-event', memo, lines: [{ account: '7695', division: f?.division ?? 'CORP', amount: net }, { account: '1000', division: 'CORP', amount: -net }] });
  ctx.state.eventLog = [...(ctx.state.eventLog ?? []), { monthIndex: ctx.mi, id, facilityId: f?.id ?? -1, cost: net }].slice(-40);
}

function seriousIncident(ctx: TickContext, f: Facility, cost: number, text: string): void {
  const s = ctx.state;
  s.people.incidents = [...s.people.incidents, { monthIndex: ctx.mi, facilityId: f.id, serious: true, cost, text }].slice(-30);
}

/** Received bushels proxy for dust risk: storage scaled by the season's activity. */
function dustExposure(f: Facility, month: number): number {
  const cap = grainCapacity(f.components);
  const seasonal = month >= 9 && month <= 11 ? 1 : 0.3;
  return (cap.storageBu / 1e6) * seasonal;
}

export function stepRandomEvents(ctx: TickContext): void {
  const { state, mi } = ctx;
  const year = yearOf(mi);
  const month = monthOf(mi);
  const safety = (1 + effect(state, 'safety.incidents')) * techFactor(state, 'incidents');
  const operating = state.coop.facilities.filter((f) => f.status === 'operating');
  const osha = REGULATIONS.find((r) => r.id === 'osha-grain')!;
  const E = RANDOM_EVENTS;

  for (const f of operating) {
    const rng = ctx.rng('events.site', f.id);
    // Grain dust explosion.
    if (f.kind === 'elevator' && active(E.dustExplosion, year)) {
      const nonCompliant = year < EVENT_PARAMS.standardYear ? EVENT_PARAMS.preStandardFactor : ruleActive(state, 'osha-grain') && !isCompliant(state, osha, f) ? 2 : 1;
      const p = E.dustExplosion.baseMonthly * (1 + EVENT_PARAMS.dustPerMillionBu.value * dustExposure(f, month)) * nonCompliant * safety * techFactor(state, 'dustRisk');
      if (rng.chance(p)) {
        const { gross, net } = lossCost(ctx, E.dustExplosion);
        f.condition = Math.max(5, f.condition - EVENT_PARAMS.explosionCondition);
        f.grain = { ...f.grain, downWeeks: Math.max(f.grain.downWeeks, EVENT_PARAMS.explosionDownWeeks) };
        chargeLoss(ctx, f, 'dustExplosion', net, `Grain dust explosion at ${f.name}`);
        seriousIncident(ctx, f, net, `Dust explosion at ${f.name}; workers hurt.`);
        state.governance.boardConfidence = clamp(state.governance.boardConfidence + EVENT_PARAMS.explosionConfidence, 0, 100);
        for (const m of state.members.list) if (m.status === 'active' && m.townId === f.townId) m.satisfaction = clamp(m.satisfaction + EVENT_PARAMS.explosionSatisfaction, 0, 100);
        ctx.inbox({ kind: 'alert', title: `Explosion at ${f.name}`, body: `A grain dust explosion tore through ${f.name}. Workers were hurt. Damage is ${formatCents(gross)}; insurance covers ${Math.round(E.dustExplosion.insured * 100)}%. The house is down for about ${EVENT_PARAMS.explosionDownWeeks} weeks.${year >= EVENT_PARAMS.standardYear && nonCompliant > 1 ? ' OSHA will note that the site had not met the grain handling standard.' : ''}` });
      }
    }
    // Out-of-condition grain after a wet fall, December–April.
    if (f.kind === 'elevator' && (month === 12 || month <= 4) && f.grain.bu.corn > 0) {
      const harvestYear = month === 12 ? year : year - 1;
      if (yearFlags(state.setup.gameSeed, state.setup.regionId, harvestYear).wetFall && rng.chance(E.outOfCondition.baseMonthly * 4)) {
        const [lo, hi] = EVENT_PARAMS.outOfConditionLoss;
        const lossBu = f.grain.bu.corn * rng.range(lo, hi) * techFactor(state, 'conditionLoss');
        const p = state.coop.grain.pos.corn;
        const physTot = operating.reduce((a, x) => a + x.grain.bu.corn, 0);
        const ownedLoss = Math.min(p.ownedBu, physTot > 0 ? lossBu * (p.ownedBu / Math.max(1, p.ownedBu + p.openStorageBu + p.dpBu)) : 0);
        f.grain = { ...f.grain, bu: { ...f.grain.bu, corn: Math.max(0, f.grain.bu.corn - lossBu) } };
        const v = p.ownedBu > 0 ? roundCents((p.book * ownedLoss) / p.ownedBu) : 0;
        if (ownedLoss > 0 && v > 0) {
          state.coop.grain.pos = { ...state.coop.grain.pos, corn: { ...p, ownedBu: p.ownedBu - ownedLoss, book: p.book - v } };
          post(state, { source: 'random-event', memo: `Out-of-condition corn at ${f.name}`, lines: [{ account: '5000', division: 'GRAIN', amount: v }, { account: '1200', division: 'GRAIN', amount: -v }] });
          state.eventLog = [...(state.eventLog ?? []), { monthIndex: mi, id: 'outOfCondition' as const, facilityId: f.id, cost: v }].slice(-40);
          ctx.inbox({ kind: 'alert', title: `Corn going out of condition at ${f.name}`, body: `Wet corn from last fall heated in the bins at ${f.name}. About ${Math.round(lossBu).toLocaleString('en-US')} bushels were lost or sold at a heavy discount (${formatCents(v)}).` });
        }
      }
    }
    // Bulk plant fire.
    if (f.kind === 'energy' && rng.chance(E.fuelFire.baseMonthly * safety)) {
      const { gross, net } = lossCost(ctx, E.fuelFire);
      f.condition = Math.max(5, f.condition - EVENT_PARAMS.fireCondition);
      chargeLoss(ctx, f, 'fuelFire', net, `Fire at ${f.name}`);
      ctx.inbox({ kind: 'alert', title: `Fire at ${f.name}`, body: `A fire at the ${f.name} bulk plant caused ${formatCents(gross)} of damage; insurance covers most of it.` });
    }
    // Delivery truck rollover.
    if (f.kind === 'energy' && rng.chance(E.truckRollover.baseMonthly * safety)) {
      const { net } = lossCost(ctx, E.truckRollover);
      chargeLoss(ctx, f, 'truckRollover', net, `Truck rollover, ${f.name}`);
      seriousIncident(ctx, f, net, `A ${f.name} delivery truck rolled over.`);
      ctx.inbox({ kind: 'alert', title: 'Delivery truck rollover', body: `A ${f.name} delivery truck rolled on a county road. The driver was hurt; our cost after insurance is ${formatCents(net)}.` });
    }
    // Anhydrous ammonia theft (meth-lab era).
    if (f.kind === 'agronomy' && active(E.nh3Theft, year) && (f.components['nh3-storage'] ?? 0) > 0 && rng.chance(E.nh3Theft.baseMonthly)) {
      const { net } = lossCost(ctx, E.nh3Theft);
      chargeLoss(ctx, f, 'nh3Theft', net, `Anhydrous theft at ${f.name}`);
      ctx.inbox({ kind: 'news', title: `Anhydrous stolen at ${f.name}`, body: `Thieves bled anhydrous from nurse tanks at ${f.name} overnight. Valves and repairs cost ${formatCents(net)}. The sheriff suspects a meth lab.` });
    }
    // Chemical drift complaints in spraying season.
    if (f.kind === 'agronomy' && active(E.chemicalDrift, year) && month >= 4 && month <= 7 && rng.chance(E.chemicalDrift.baseMonthly * 3)) {
      const { net } = lossCost(ctx, E.chemicalDrift);
      chargeLoss(ctx, f, 'chemicalDrift', net, `Drift claim, ${f.name}`);
      for (const m of state.members.list) if (m.status === 'active' && m.townId === f.townId) m.satisfaction = clamp(m.satisfaction - 2, 0, 100);
      ctx.inbox({ kind: 'news', title: 'Drift complaint', body: `A neighbor's garden and soybeans were damaged by spray drift from one of our ${f.name} applicators. The claim cost us ${formatCents(net)} after insurance.` });
    }
    // Storms hit any site.
    if (rng.chance(E.stormDamage.baseMonthly * (month >= 4 && month <= 8 ? 2 : 0.4))) {
      const { gross, net } = lossCost(ctx, E.stormDamage);
      f.condition = Math.max(5, f.condition - EVENT_PARAMS.stormCondition);
      chargeLoss(ctx, f, 'stormDamage', net, `Storm damage at ${f.name}`);
      ctx.inbox({ kind: 'news', title: `Storm damage at ${f.name}`, body: `High winds damaged ${f.name}: ${formatCents(gross)} in repairs, ${formatCents(net)} after insurance.` });
    }
  }

  // Co-op-wide events.
  const rng = ctx.rng('events.coop');
  if (operating.length && rng.chance(E.lawsuit.baseMonthly) && !openDecisions(state).some((i) => i.choice?.handler === 'lawsuit')) {
    const f = rng.pick(operating);
    const claim = nominalCents(ctx.path, mi, E.lawsuit.cost * rng.range(0.5, 1.5));
    addChoice(state, { kind: 'alert', title: 'We have been sued', body: `A customer is suing over an injury at ${f.name}, asking ${formatCents(claim)}. Counsel thinks we have a fair chance in court, but a loss could cost far more than settling.` }, {
      options: [
        { id: 'settle', label: 'Settle', detail: `Pay ${formatCents(claim)}; insurance covers ${Math.round(E.lawsuit.insured * 100)}%.` },
        { id: 'fight', label: 'Fight it in court', detail: `About a ${Math.round(EVENT_PARAMS.lawsuitWinProb.value * 100)}% chance to win (we pay legal fees); a loss costs up to ${EVENT_PARAMS.lawsuitLoseMultiple.value}× the claim.` },
      ],
      defaultId: 'settle', handler: 'lawsuit', data: { cost: claim, facilityId: f.id },
    });
  }
  if (operating.length && active(E.cyberattack, year) && rng.chance(E.cyberattack.baseMonthly * techFactor(state, 'cyberRisk'))) {
    const { gross, net } = lossCost(ctx, E.cyberattack);
    chargeLoss(ctx, null, 'cyberattack', net, 'Ransomware attack');
    state.governance.boardConfidence = clamp(state.governance.boardConfidence - 4, 0, 100);
    ctx.inbox({ kind: 'alert', title: 'Ransomware attack', body: `Ransomware locked our accounting and scale-house systems for a week. Recovery cost ${formatCents(gross)}; insurance paid ${formatCents(gross - net)}.${state.tech.adopted.cybersecurity ? '' : ' A cybersecurity program (Operations screen) cuts the risk sharply.'}` });
  }
}
