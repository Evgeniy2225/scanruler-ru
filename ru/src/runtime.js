/* ScanRuler RU — русификатор интерфейса ScanRuler (https://github.com/CNCKitchen/scanruler).
 * Работает поверх готовой сборки: следит за DOM и заменяет английские
 * тексты на русские по словарю. Исходники ScanRuler не меняются.
 * Alt+Shift+L — переключить язык (RU ⇄ EN).
 * SPDX-License-Identifier: AGPL-3.0-only */
(function () {
  'use strict'
  if (window.__scanrulerRuLoaded) return
  window.__scanrulerRuLoaded = true

  var LS = 'scanruler.lang'
  var lang = 'ru'
  try { lang = localStorage.getItem(LS) || 'ru' } catch (e) {}

  function toggle() {
    try { localStorage.setItem(LS, lang === 'ru' ? 'en' : 'ru') } catch (e) {}
    location.reload()
  }
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey && (e.code === 'KeyL')) { e.preventDefault(); toggle() }
  }, true)
  var api = window.scanrulerRu = { lang: lang, toggle: toggle, missing: function () { return Array.from(missing) } }
  var missing = new Set()
  if (lang !== 'ru') { document.documentElement.lang = 'en'; return }

  var DICT = window.__SCANRULER_RU_DICT || {}
  var exact = new Map()
  var tplByWord = new Map()   // first word of the literal head → [tpl]
  var tplLoose = []           // templates that start with a placeholder
  var norm = function (s) { return s.replace(/\s+/g, ' ').trim() }
  var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

  Object.keys(DICT).forEach(function (k) {
    var v = DICT[k]
    if (!v) return
    var key = norm(k)
    if (!/\{\d+\}/.test(key)) { exact.set(key, v); return }
    // a template needs real words of its own, or it would match anything
    if (key.replace(/\{\d+\}/g, '').replace(/[^A-Za-z]/g, '').length < 2) return
    var parts = key.split(/\{(\d+)\}/)  // lit, idx, lit, idx, lit
    // A count — "{0} points" → "Точек: {0}", "{0} element{1}" — takes a number
    // only, or "Redone: save element" would read as a count of elements.
    var numeric = {}
    var lead = /^\{(\d+)\}/.exec(key)
    if (lead && v.indexOf(': {' + lead[1] + '}') >= 0) numeric[lead[1]] = true
    key.replace(/\{(\d+)\} [a-z]+\{\d+\}/g, function (_, n) { numeric[n] = true })
    var re = '^', order = [], longest = ''
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 0) { re += esc(parts[i]); if (parts[i].length > longest.length) longest = parts[i] }
      else { re += numeric[parts[i]] ? '([\\d−+-][\\d.,  ]*)' : '([\\s\\S]*?)'; order.push(+parts[i]) }
    }
    var t = { re: new RegExp(re + '$'), order: order, out: v, need: longest, generic: /^(and|of|on|at|by|in|the)$/.test(norm(key.replace(/\{\d+\}/g, ''))), lits: parts.filter(function (_, i) { return i % 2 === 0 }).join('').length }
    var head = parts[0]
    if (head.length >= 2) {
      var w = head.split(' ')[0] || head
      if (!tplByWord.has(w)) tplByWord.set(w, [])
      tplByWord.get(w).push(t)
    } else tplLoose.push(t)
  })
  var sortT = function (a, b) { return b.lits - a.lits }
  tplByWord.forEach(function (l) { l.sort(sortT) }); tplLoose.sort(sortT)
  api.size = exact.size

  function applyTpl(list, s) {
    for (var i = 0; i < list.length; i++) {
      var t = list[i]
      if (t.need && s.indexOf(t.need) < 0) continue
      var m = t.re.exec(s)
      if (!m) continue
      var vals = {}, incomplete = false
      for (var j = 0; j < t.order.length; j++) {
        var g = m[j + 1]
        var translated = g && g !== s ? trCore(g, true) : null
        // A bare preposition must not turn an unknown sentence into mixed RU/EN.
        if (t.generic && /[A-Za-z]{2}/.test(g) && translated == null) incomplete = true
        vals[t.order[j]] = translated || g
      }
      if (incomplete) continue
      return t.out.replace(/\{(\d+)\}/g, function (_, n) { return vals[n] != null ? vals[n] : '' })
    }
    return null
  }
  var cache = new Map()
  function trCore(s, inner) {
    if (!s || !/[A-Za-z]{2}/.test(s)) return null
    var cacheKey = (inner ? 'inner:' : 'outer:') + s
    if (cache.has(cacheKey)) return cache.get(cacheKey)
    var r = exact.get(s)
    if (r == null) {
      var w = s.split(' ')[0]
      var l = tplByWord.get(w)
      // a head literal can end mid-word: "Fit {0}" is keyed "Fit", "Ø{0}" by "Ø{0}"
      if (l) r = applyTpl(l, s)
      if (r == null) {
        for (var k = Math.min(w.length, 12); r == null && k >= 2; k--) {
          var l2 = tplByWord.get(w.slice(0, k)); if (l2 && l2 !== l) r = applyTpl(l2, s)
        }
      }
      if (r == null) r = applyTpl(tplLoose, s)
      // "3D Measure: save element" — a label made of labels
      if (r == null && inner && s.indexOf(': ') > 0) {
        var bits = s.split(': '), any = false
        for (var b = 0; b < bits.length; b++) { var tb = exact.get(bits[b]); if (tb != null) { bits[b] = tb; any = true } }
        if (any) r = bits.join(': ')
      }
      // "Text." / "Text:" when only "Text" is known
      if (r == null) {
        var p = /^(.*?)([.:…,;!?]+)$/.exec(s)
        if (p && exact.has(p[1])) r = exact.get(p[1]) + p[2]
      }
      // Capitalised variant of a known lowercase fragment and the reverse
      if (r == null) {
        var lc = s.charAt(0).toLowerCase() + s.slice(1), uc = s.charAt(0).toUpperCase() + s.slice(1)
        if (lc !== s && exact.has(lc)) { r = exact.get(lc); r = r.charAt(0).toUpperCase() + r.slice(1) }
        else if (uc !== s && exact.has(uc)) { r = exact.get(uc); r = r.charAt(0).toLowerCase() + r.slice(1) }
      }
    }
    if (r == null && !inner && s.length < 300) missing.add(s)
    if (cache.size > 20000) cache.clear()
    cache.set(cacheKey, r)
    return r
  }
  function tr(raw) {
    if (!raw || !/[A-Za-z]{2}/.test(raw)) return null
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw)
    var core = norm(m[2])
    var r = trCore(core, false)
    return r == null ? null : m[1] + r + m[3]
  }
  api.tr = tr

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, KBD: 1 }
  function skipEl(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.nodeName] || e.isContentEditable || (e.hasAttribute && e.hasAttribute('data-ru-skip'))) return true
    }
    return false
  }

  // What we wrote, so a later React update can be told from our own write.
  var textState = new WeakMap() // TextNode → {src, out}
  var attrState = new WeakMap() // Element → {attr: {src, out}}
  var ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'data-tip', 'data-tooltip']
  var writing = false

  function srcOf(n) {
    var st = textState.get(n), cur = n.nodeValue
    return st && cur === st.out ? st.src : cur
  }
  function setText(n, src, out) {
    textState.set(n, { src: src, out: out })
    if (n.nodeValue !== out) n.nodeValue = out
  }
  function trText(el, s) {
    // "From" selects how a scale is defined here; elsewhere it is a range's start.
    if (norm(s) === 'From' && el.closest && el.closest('[data-test="scale-box"]')) {
      return s.replace('From', 'Способ задания')
    }
    return tr(s)
  }
  function doElementText(el) {
    if (!el || el.nodeType !== 1 || skipEl(el)) return
    var kids = el.childNodes, texts = [], onlyText = true
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i]
      if (k.nodeType === 3) texts.push(k)
      else if (k.nodeType === 1) onlyText = false
    }
    if (!texts.length) return
    writing = true
    try {
      if (onlyText && texts.length > 1) {
        var srcs = texts.map(srcOf), joined = srcs.join('')
        var whole = trText(el, joined)
        if (whole != null) {
          setText(texts[0], srcs[0], whole)
          for (var j = 1; j < texts.length; j++) setText(texts[j], srcs[j], '')
          return
        }
        texts.forEach(function (t, j) { var o = trText(el, srcs[j]); setText(t, srcs[j], o == null ? srcs[j] : o) })
        return
      }
      texts.forEach(function (t) {
        var s = srcOf(t), o = trText(el, s)
        if (o != null) setText(t, s, o)
        else if (textState.has(t) && t.nodeValue !== s) setText(t, s, s)
      })
    } finally { writing = false }
  }
  function doAttrs(el) {
    if (!el.getAttribute || skipEl(el)) return
    var st = attrState.get(el)
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], cur = el.getAttribute(a)
      if (cur == null) continue
      var rec = st && st[a]
      var src = rec && cur === rec.out ? rec.src : cur
      var out = tr(src)
      if (out == null || out === cur) continue
      if (!st) { st = {}; attrState.set(el, st) }
      st[a] = { src: src, out: out }
      writing = true
      try { el.setAttribute(a, out) } finally { writing = false }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doElementText(root.parentNode); return }
    if (root.nodeType !== 1) return
    doElementText(root); doAttrs(root)
    var all = root.getElementsByTagName('*')
    for (var i = 0; i < all.length; i++) { doElementText(all[i]); doAttrs(all[i]) }
  }

  var pending = new Set(), scheduled = false
  function flush() {
    scheduled = false
    var list = Array.from(pending); pending.clear()
    for (var i = 0; i < list.length; i++) if (list[i].isConnected) walk(list[i])
  }
  function queue(n) {
    if (!n) return
    pending.add(n)
    if (!scheduled) { scheduled = true; Promise.resolve().then(flush) }
  }
  var mo = new MutationObserver(function (muts) {
    if (writing) return
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i]
      if (m.type === 'characterData') {
        var st = textState.get(m.target)
        if (st && m.target.nodeValue === st.out) continue
        queue(m.target.parentNode)
      } else if (m.type === 'attributes') {
        var as = attrState.get(m.target), rec = as && as[m.attributeName]
        if (rec && m.target.getAttribute(m.attributeName) === rec.out) continue
        queue(m.target)
      } else {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var a = m.addedNodes[j]
          queue(a.nodeType === 3 ? a.parentNode : a)
        }
        if (m.removedNodes.length) queue(m.target)
      }
    }
  })
  function start() {
    document.documentElement.lang = 'ru'
    walk(document.documentElement)
    mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  }
  // The title lives in <head>, which exists already when this runs.
  if (document.body) start()
  else document.addEventListener('DOMContentLoaded', start)
  if (!document.body) { var t = document.querySelector('title'); if (t) { var r = tr(t.textContent); if (r) t.textContent = r } }
})()
