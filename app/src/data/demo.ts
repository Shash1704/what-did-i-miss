// Realistic, messy college-fest organizing group chat, rendered as a WhatsApp (Android) export.
// Timestamps are generated relative to "now" so deadlines always look live during the demo.

const ME = 'Shashwat'

// [minutes after start, author, text]
const SCRIPT: [number, string, string][] = [
  [0, 'Ananya', 'Good morning core team ☀️ 9 days to TechFest!'],
  [2, 'Rohan', 'gm gm'],
  [3, 'Shashwat', "Morning! I'll be in labs till 4, will catch up after"],
  [5, 'Priya', 'all the best for the lab internals 😅'],
  [9, 'Karthik', 'anyone have the sponsor tracker link?'],
  [10, 'Ananya', 'pinned it in the group description'],
  [11, 'Karthik', 'got it thx'],
  // ---- Shashwat goes offline here ----
  [38, 'Meera', 'guys canteen has paneer puffs today 🔥'],
  [39, 'Arjun', 'save me one'],
  [40, 'Rohan', 'lol no promises'],
  [52, 'Sneha', 'Did anyone call the decoration vendor?'],
  [55, 'Arjun', 'not yet, will do after class'],
  [61, 'Ananya', "@Shashwat Nandini's marketing team called again, can you send them the final sponsor deck by 5pm today? They need it before their internal review. Urgent!!"],
  [63, 'Priya', '😬'],
  [64, 'Karthik', 'lol they called me too'],
  [70, 'Rohan', 'Update: hackathon venue is moved to Main Auditorium instead of Seminar Hall. Final, HOD approved it this morning.'],
  [71, 'Meera', 'ohh nice more space'],
  [72, 'Arjun', 'finally 🙌'],
  [73, 'Sneha', 'what about the projector there, it was broken last month'],
  [75, 'Rohan', 'AV team says it is fixed'],
  [81, 'Priya', 'okay so we discussed with faculty, decided registration fee is ₹200 per team, not ₹150. Please update the form'],
  [82, 'Karthik', 'who is managing the form?'],
  [83, 'Priya', 'Sneha I think'],
  [84, 'Sneha', 'yes mine, will update tonight'],
  [90, 'Arjun', 'anyone free for a quick call?'],
  [91, 'Meera', 'in class'],
  [92, 'Rohan', 'same'],
  [93, 'Arjun', 'nvm figured it out'],
  [104, 'Meera', 'Reminder: budget sheet is due Friday 6pm to the HOD. Everyone please fill your rows in the shared sheet'],
  [106, 'Karthik', 'done with mine ✅'],
  [107, 'Ananya', 'mine too'],
  [112, 'Arjun', 'does anyone know if the lab is open on saturday'],
  [114, 'Sneha', 'it is till 1pm'],
  [120, 'Karthik', 'Shashwat bro the GitHub org invite for the hackathon repo expires tomorrow, accept it asap otherwise I have to resend and it is a pain'],
  [121, 'Rohan', '😂'],
  [125, 'Priya', 'did we finalise the poster design?'],
  [127, 'Meera', 'I like the blue one'],
  [128, 'Arjun', 'blue >>> orange'],
  [129, 'Sneha', 'blue for sure'],
  [131, 'Ananya', "ok let's go with the blue poster design then. Locked. Priya can you send it to print by Thursday?"],
  [132, 'Priya', 'yep on it'],
  [140, 'Rohan', 'memes channel is dead today'],
  [141, 'Arjun', '<Media omitted>'],
  [142, 'Meera', 'LMAO'],
  [143, 'Karthik', '💀💀'],
  [144, 'Sneha', 'arjun stop 😭'],
  [150, 'Rohan', 'Who is handling the judges lunch? Need a name by tonight so I can tell the caterer'],
  [152, 'Meera', 'not me I have the volunteers'],
  [153, 'Karthik', 'Arjun?'],
  [155, 'Arjun', 'ok fine I will take it'],
  [160, 'Sneha', '@everyone mandatory core meeting tomorrow 10am in the ISE lab. Attendance will be taken by faculty coordinator'],
  [161, 'Ananya', '👍'],
  [161, 'Priya', '👍'],
  [162, 'Karthik', 'noted'],
  [170, 'Arjun', 'btw the DJ wants 50% advance'],
  [172, 'Rohan', 'how much is that'],
  [173, 'Arjun', '15k'],
  [174, 'Rohan', 'Karthik can you pay the DJ advance from the fest account by Thursday? Keep the receipt'],
  [176, 'Karthik', 'sure, will do'],
  [182, 'Meera', 'anyone going home this weekend?'],
  [184, 'Sneha', 'nope fest work'],
  [185, 'Arjun', 'rip weekends'],
  [190, 'Ananya', 'Shashwat are you okay presenting the opening keynote slides on day 1? Principal will be there so we need someone confident'],
  [192, 'Priya', 'he will be great'],
  [193, 'Rohan', '+1'],
  [200, 'Meera', 'random but the wifi in block C is so bad'],
  [201, 'Karthik', 'always has been'],
  [202, 'Arjun', '🌍👨‍🚀🔫👨‍🚀'],
  [210, 'Sneha', 'Registration form is updated to ₹200 ✅'],
  [211, 'Priya', 'thanks!'],
  [218, 'Rohan', 'Important: the college needs the final list of external participants by tomorrow 3pm for gate passes. Shashwat you have the Google form responses, please export and send to Rohan'],
  [220, 'Meera', 'oof that is tight'],
  [224, 'Arjun', 'also we need 20 more volunteers for day 2, someone post on the main group'],
  [226, 'Meera', 'I will post'],
  [230, 'Karthik', 'is the treasure hunt still happening?'],
  [232, 'Ananya', 'no we dropped it, not enough time. Decided to replace it with a quiz'],
  [233, 'Karthik', 'ahh ok'],
  [240, 'Priya', 'going for chai anyone?'],
  [241, 'Arjun', 'coming'],
  [242, 'Rohan', 'me too'],
  [243, 'Sneha', 'save a seat'],
]

const pad = (n: number) => String(n).padStart(2, '0')
function fmt(d: Date) {
  let h = d.getHours()
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${h}:${pad(d.getMinutes())} ${ampm}`
}

export function buildDemoChat(): string {
  const end = new Date()
  end.setSeconds(0, 0)
  const total = SCRIPT[SCRIPT.length - 1][0]
  const start = new Date(end.getTime() - (total + 4) * 60000)
  return [
    `${fmt(start)} - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.`,
    ...SCRIPT.map(([m, a, t]) => `${fmt(new Date(start.getTime() + m * 60000))} - ${a}: ${t}`),
  ].join('\n')
}

export const DEMO_ME = ME
export const DEMO_LAST_READ = 6 // index (after parsing) of the last message the user read
export const DEMO_NAME = 'TechFest ’26 Core Team'
