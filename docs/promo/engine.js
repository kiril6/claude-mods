// Shared by the promo pages: a timeline that draws the exact frame for any moment `t` (ms), so a
// capture script can step through it frame by frame. Everything moves from `t`; nothing runs on
// its own clock.
const $ = id => document.getElementById(id)
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, k) => a + (b - a) * k
const io = k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
const out = k => 1 - Math.pow(1 - k, 3)
const back = k => { const c = 1.70158, d = k - 1; return 1 + (c + 1) * d * d * d + c * d * d }
const prog = (t, a, ms) => clamp((t - a) / ms)

// A slot showing the latest clip whose time has come, its SVG clock set to the clip's age.
function track(el, clips) {
  let shown
  return t => {
    let clip
    for (const c of clips) if (c.at <= t) clip = c
    if (!clip) { if (shown) { el.innerHTML = ''; shown = undefined } return }
    if (clip !== shown) { el.innerHTML = clip.svg; shown = clip; el.querySelectorAll('svg').forEach(s => s.pauseAnimations && s.pauseAnimations()) }
    const svg = el.firstElementChild
    if (svg && svg.setCurrentTime) svg.setCurrentTime(Math.max(0, t - clip.at) / 1000)
  }
}

// How long the scenery has been moving by `t`, over the intervals it moves in.
const movedBy = (t, intervals) => intervals.reduce((sum, [a, b]) => sum + clamp(t - a, 0, b - a), 0)

// The pet in its world, as the plugin draws it: a rounded window, the scene behind (cross-fading
// when it changes, scrolling only while Claude works, carrying on where it left off), the pet in
// front standing at the bottom.
function habitat(el, scenes, moving, pets) {
  el.classList.add('hab')
  const names = [...new Set(scenes.map(s => s.scene))]
  const layers = {}
  for (const name of names) {
    const d = document.createElement('div')
    d.className = 'scn'
    d.innerHTML = A.scenes[name]
    el.appendChild(d)
    layers[name] = d
  }
  const slot = document.createElement('div')
  slot.className = 'petin'
  el.appendChild(slot)
  const pet = track(slot, pets)
  return t => {
    let i = 0
    scenes.forEach((s, n) => { if (s.at <= t) i = n })
    const now = scenes[i], before = i > 0 ? scenes[i - 1] : undefined
    const k = before ? io(prog(t, now.at, 450)) : 1
    const moved = movedBy(t, moving)
    for (const name of names) {
      const d = layers[name]
      d.style.zIndex = name === now.scene ? 2 : 1
      d.style.opacity = name === now.scene ? (before && before.scene !== name ? k : 1) : before && name === before.scene ? 1 : 0
      const svg = d.firstElementChild
      svg.pauseAnimations()
      svg.setCurrentTime(moved / 1000)
    }
    pet(t)
  }
}

// Scenes fade and zoom between each other: in from slightly blurred, out by growing and blurring.
const FADE = 760
function layer(t, [id, a, b]) {
  const el = $(id)
  const k = a === 0 ? 1 : io(prog(t, a - FADE / 2, FADE))
  const o = io(prog(t, b - FADE / 2, FADE))
  el.style.opacity = Math.min(k, 1 - o)
  el.style.display = k <= 0 || o >= 1 ? 'none' : ''
  el.style.filter = o > 0 ? `blur(${o * 12}px)` : k < 1 ? `blur(${(1 - k) * 8}px)` : ''
  return { k, o, el }
}

// A camera over an element: keyframes [time, scale, centre x, centre y], eased between.
function camera(keys, t) {
  let i = 0
  while (i < keys.length - 1 && keys[i + 1][0] <= t) i++
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)]
  const k = b === a || t <= a[0] ? 0 : io(clamp((t - a[0]) / (b[0] - a[0])))
  return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)]
}

// Caption pills: rise in, lift away.
function captions(el, caps) {
  el.innerHTML = caps.map(c => `<div class="cap">${c[2]}</div>`).join('')
  const pills = [...el.children]
  return t => caps.forEach(([a, b], n) => {
    const k = out(prog(t, a, 500)), o = io(prog(t, b - 350, 350))
    pills[n].style.opacity = k * (1 - o)
    pills[n].style.transform = `translate(-50%, ${(1 - k) * 26 - o * 16}px) scale(${.96 + .04 * k})`
  })
}

function drift(t) {
  $('b1').style.transform = `translate(${-120 + Math.sin(t / 2600) * 90}px, ${-170 + Math.cos(t / 3100) * 60}px)`
  $('b2').style.transform = `translate(${760 + Math.cos(t / 2900) * 90}px, ${250 + Math.sin(t / 2300) * 70}px)`
  $('b3').style.transform = `translate(${380 + Math.sin(t / 3700) * 140}px, ${420 + Math.cos(t / 3300) * 40}px)`
}

function run(seek, end) {
  window.seek = seek
  window.DURATION = end
  if (location.hash !== '#still') {
    const t0 = performance.now()
    const loop = () => { seek((performance.now() - t0) % end); requestAnimationFrame(loop) }
    loop()
  }
}
