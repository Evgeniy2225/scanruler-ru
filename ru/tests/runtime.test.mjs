import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
const root = new URL('../', import.meta.url)
const dict = {}
for (const f of readdirSync(new URL('i18n/', root)).sort()) {
  if (f.endsWith('.json')) Object.assign(dict, JSON.parse(readFileSync(new URL('i18n/' + f, root), 'utf8')))
}
const runtime = readFileSync(new URL('src/runtime.js', root), 'utf8')
function load(lang = 'ru', extra = {}) {
  const context = {
    window: { __SCANRULER_RU_DICT: { ...dict, ...extra } },
    document: { documentElement: { lang: 'ru' }, addEventListener() {}, querySelector() {} },
    localStorage: { getItem: () => lang }, MutationObserver: class {},
  }
  runInNewContext(runtime, context)
  return context
}
test('short literal templates and nested translations', () => {
  const { tr } = load().window.scanrulerRu
  assert.equal(tr('2 of 5'), '2 из 5')
  assert.equal(tr('at 10 mm'), 'в 10 мм')
  assert.equal(tr('on Plane 1'), 'на Плоскость 1')
})
test('point counters accept numbers, not arbitrary phrases', () => {
  const { tr } = load().window.scanrulerRu
  for (const n of [1, 2, 5, 21, 125]) assert.equal(tr(`${n} points`), `Точек: ${n}`)
  assert.equal(tr('save points'), null)
  assert.equal(tr('rolled back'), 'отменено')
})
test('inner translations cannot contaminate the outer cache or missing list', () => {
  const api = load('ru', {'Status {0}': 'Статус {0}', 'Alpha': 'Альфа', 'Beta': 'Бета'}).window.scanrulerRu
  assert.equal(api.tr('Status Alpha: Beta'), 'Статус Альфа: Бета')
  assert.equal(api.tr('Alpha: Beta'), null)
  api.tr('Status UntranslatedXYZ')
  api.tr('UntranslatedXYZ')
  assert.ok(api.missing().includes('UntranslatedXYZ'))
})
test('English mode resets the language embedded by apply.mjs', () => {
  const context = load('en')
  assert.equal(context.document.documentElement.lang, 'en')
  assert.equal(context.window.scanrulerRu.lang, 'en')
})

test('generic prepositions do not partially translate unknown English prose', () => {
  const { tr } = load().window.scanrulerRu
  assert.equal(tr('An unknown sentence on an unknown topic'), null)
  assert.equal(tr('Untranslated first and untranslated second'), null)
  assert.equal(tr('An unknown sentence of an unknown kind'), null)
  assert.equal(tr('Units of bracket.stl'), 'Единицы измерения файла «bracket.stl»')
  assert.equal(tr('Pick a shape to fit on the part — then click that feature on the scan'), 'Выберите геометрический элемент, затем щёлкните соответствующую область скана')
})
test('technical labels, progress and parameter units', () => {
  const { tr } = load().window.scanrulerRu
  for (const [source, expected] of Object.entries({
    'Sweep': 'Построение по траектории', 'Count': 'Подсчёт',
    'Angularity': 'Отклонение наклона', 'Gaussian best-fit': 'Метод наименьших квадратов',
    'How the elements are drawn': 'Отображение: элементы',
    'Reading STL… 100%': 'Чтение STL… 100%', 'X (mm)': 'X (мм)',
    'Flatness 2': 'Плоскостность 2', '✓ Point': '✓ Точка',
  })) assert.equal(tr(source), expected, source)
})
test('all translations use only placeholders present in their source', () => {
  for (const [source, translated] of Object.entries(dict)) {
    assert.equal(typeof translated, 'string', source)
    assert.ok(translated.trim(), source)
    const allowed = new Set([...source.matchAll(/\{\d+\}/g)].map(m => m[0]))
    for (const match of translated.matchAll(/\{\d+\}/g)) assert.ok(allowed.has(match[0]), source)
    assert.ok(!translated.includes('\uFFFD'), source)
  }
})
