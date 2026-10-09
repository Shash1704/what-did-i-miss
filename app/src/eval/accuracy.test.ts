/**
 * Accuracy harness: labelled chats → precision / recall per detector.
 * Run with `npm run eval`. The demo chat is what the rules were developed on; the held-out chat
 * was written separately with different phrasing and deliberate traps, so its numbers are the honest ones.
 */
import { describe, expect, it } from 'vitest'
import { analyze } from '../core/analyze'
import { displayName } from '../core/identity'
import { parseChat, participants } from '../core/parser'
import { buildDemoChat, DEMO_LAST_READ, DEMO_ME } from '../data/demo'

type Kind = 'mentions' | 'myTasks' | 'decisions' | 'deadlines'
interface Case { name: string; chat: string; me: string; since: number; labels: Record<Kind, string[]> }

const pad = (n: number) => String(n).padStart(2, '0')
function whatsapp(start: Date, lines: [number, string, string][]) {
  return lines.map(([min, who, text]) => {
    const d = new Date(start.getTime() + min * 60000)
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} - ${who}: ${text}`
  }).join('\n')
}

const demo: Case = {
  name: 'Demo chat (development set)',
  chat: buildDemoChat(new Date(2026, 9, 9, 13, 30)),
  me: DEMO_ME,
  since: DEMO_LAST_READ,
  labels: {
    mentions: ["Nandini's marketing team", 'GitHub org invite', 'final list of external participants', 'opening keynote slides'],
    myTasks: ["Nandini's marketing team", 'GitHub org invite', 'final list of external participants', 'opening keynote slides'],
    decisions: ['hackathon venue is moved', 'registration fee is ₹200', "let's go with the blue poster", 'replace it with a quiz'],
    deadlines: ['sponsor deck by 5pm today', 'budget sheet is due Friday', 'GitHub org invite', 'send it to print by Thursday',
      'Need a name by tonight', 'mandatory core meeting tomorrow', 'DJ advance from the fest account', 'external participants by tomorrow 3pm'],
  },
}

const heldOut: Case = {
  name: 'Held-out chat (never tuned on)',
  me: 'Shashwat',
  since: 1,
  chat: whatsapp(new Date(2026, 9, 10, 10, 0), [
    [0, 'Kavya', 'morning!'],
    [3, 'Dev', 'did anyone see the match last night'],
    [6, 'Kavya', '@Shashwat pls bring the HDMI cable to the lab tomorrow morning'],
    [8, 'Ishaan', 'lol Dev the match was painful'],
    [15, 'Meher', 'Quick update - we agreed to meet at 6pm in room 204 from now on'],
    [18, 'Dev', "Shashwat's laptop is still with me btw"],
    [25, 'Ishaan', 'who can book the 3D printer slot before Monday?'],
    [26, 'Kavya', 'Shashwat can you do it? you have the login'],
    [31, 'Meher', 'final exam was so tough today'],
    [40, 'Dev', "ok so it's settled, budget cap is 5k for the arm parts"],
    [44, 'Ishaan', 'deadline for the competition registration is 15th Oct, someone fill the form'],
    [45, 'Kavya', '😂😂'],
    [52, 'Meher', 'can you believe the canteen closed early'],
    [60, 'Dev', '@Shashwat reminder: submit the expense receipts by Wednesday EOD'],
    [63, 'Ishaan', 'the old deadline passed last week anyway'],
    [70, 'Kavya', 'Shashwat kal tak slides bhej dena please'],
    [80, 'Meher', "Decision: we're going with the Arduino Mega, not the Uno"],
    [81, 'Dev', 'nice'],
    [90, 'Ishaan', 'does anyone have a spare soldering iron?'],
    [95, 'Kavya', 'also Meher please confirm the venue by tonight'],
    [96, 'Meher', 'confirmed!'],
    [110, 'Dev', 'guys the drone video is up on insta'],
    [120, 'Ishaan', '@everyone general body meeting on Sunday 11am, attendance compulsory'],
    [125, 'Kavya', 'Shashwat are you coming for the meeting?'],
    [130, 'Meher', 'ok byeee'],
  ]),
  labels: {
    mentions: ['HDMI cable', "Shashwat's laptop", 'you have the login', 'expense receipts', 'kal tak slides', 'coming for the meeting'],
    myTasks: ['HDMI cable', 'you have the login', 'expense receipts', 'kal tak slides'],
    decisions: ['agreed to meet at 6pm', 'budget cap is 5k', 'going with the Arduino Mega'],
    deadlines: ['HDMI cable', '3D printer slot before Monday', 'competition registration is 15th Oct', 'expense receipts',
      'kal tak slides', 'confirm the venue by tonight', 'general body meeting on Sunday'],
  },
}

// Written BEFORE the Hinglish / implicit-deadline rules were added, so it was never tuned on either.
const heldOut2: Case = {
  name: 'Held-out chat 2 (Hinglish, written before tuning)',
  me: 'Shashwat, Shash',
  since: 0,
  chat: whatsapp(new Date(2026, 9, 11, 18, 0), [
    [0, 'Riya', 'guys kal ka plan kya hai'],
    [2, 'Aman', 'Shash bhai poster aaj raat tak bhej dena pls'],
    [5, 'Riya', 'haan haan'],
    [9, 'Neha', 'pakka hai, fest Saturday ko hi hoga'],
    [12, 'Aman', '@Shashwat jaldi reply kar, sponsor wale call kar rahe hain'],
    [15, 'Riya', 'Neha tu banner order kar de by Friday'],
    [18, 'Neha', 'ok done'],
    [22, 'Aman', 'final decision: entry fee 100 rupees'],
    [25, 'Riya', 'Shashwat ka bday kab hai btw'],
    [31, 'Neha', 'lol'],
    [35, 'Aman', 'Shash please kal subah 9 baje tak budget sheet share kar'],
    [40, 'Riya', 'kal ka match dekha?'],
  ]),
  labels: {
    mentions: ['poster aaj raat', 'jaldi reply', 'ka bday', 'budget sheet share'],
    myTasks: ['poster aaj raat', 'jaldi reply', 'budget sheet share'],
    decisions: ['fest Saturday ko', 'entry fee 100'],
    deadlines: ['poster aaj raat', 'banner order', 'budget sheet share'],
  },
}

interface Score { kind: Kind; labelled: number; found: number; correct: number; precision: number; recall: number; f1: number; missed: string[]; extra: string[] }

function evaluate(c: Case): Score[] {
  const msgs = parseChat(c.chat)
  const a = analyze(msgs, c.me, c.since, participants(msgs))
  const detected: Record<Kind, string[]> = {
    mentions: a.mentions.map(s => s.msg.text),
    myTasks: a.actions.filter(s => s.owner === displayName(c.me)).map(s => s.msg.text),
    decisions: a.decisions.map(s => s.msg.text),
    deadlines: a.deadlines.map(s => s.msg.text),
  }
  return (Object.keys(c.labels) as Kind[]).map(kind => {
    const gold = c.labels[kind], found = detected[kind]
    const hit = (t: string) => gold.some(g => t.includes(g))
    const correct = found.filter(hit).length
    const precision = found.length ? correct / found.length : 1
    const recall = gold.length ? gold.filter(g => found.some(t => t.includes(g))).length / gold.length : 1
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0
    return {
      kind, labelled: gold.length, found: found.length, correct, precision, recall, f1,
      missed: gold.filter(g => !found.some(t => t.includes(g))),
      extra: found.filter(t => !hit(t)).map(t => t.slice(0, 50)),
    }
  })
}

const pct = (x: number) => `${Math.round(x * 100)}%`
function report(c: Case, scores: Score[]) {
  console.log(`\n### ${c.name}\n| Detector | Labelled | Found | Precision | Recall | F1 |\n|---|---|---|---|---|---|`)
  for (const s of scores) console.log(`| ${s.kind} | ${s.labelled} | ${s.found} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.f1)} |`)
  for (const s of scores) {
    if (s.missed.length) console.log(`  missed ${s.kind}: ${s.missed.join(' · ')}`)
    if (s.extra.length) console.log(`  false ${s.kind}: ${s.extra.join(' · ')}`)
  }
}

describe('accuracy', () => {
  it('scores near-perfectly on the development chat', () => {
    const scores = evaluate(demo)
    report(demo, scores)
    for (const s of scores) expect(s.f1, s.kind).toBeGreaterThanOrEqual(0.85)
  })

  it('handles Hinglish on a second unseen chat', () => {
    const scores = evaluate(heldOut2)
    report(heldOut2, scores)
    const macroF1 = scores.reduce((n, s) => n + s.f1, 0) / scores.length
    console.log(`\nHeld-out 2 macro F1: ${pct(macroF1)}`)
    expect(macroF1).toBeGreaterThanOrEqual(0.5)
  })

  it('generalises to an unseen chat', () => {
    const scores = evaluate(heldOut)
    report(heldOut, scores)
    const macroF1 = scores.reduce((n, s) => n + s.f1, 0) / scores.length
    console.log(`\nHeld-out macro F1: ${pct(macroF1)}`)
    expect(macroF1).toBeGreaterThanOrEqual(0.6)
  })
})
