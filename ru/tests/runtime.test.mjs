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


test('ScanRuler 0.10.1 labels, casing, units and minimum-zone details', () => {
  const { tr } = load().window.scanrulerRu
  for (const [source, expected] of Object.entries({
    'No reference loaded': 'Эталон не загружен',
    'No image loaded': 'Изображение не загружено',
    'True length (mm)': 'Реальная длина (мм)',
    'Max gap (mm)': 'Макс. зазор (мм)',
    'WORKING 25%': 'ВЫПОЛНЯЕТСЯ 25%',
    'Three-plane intersection': 'Пересечение трёх плоскостей',
    'Tangent to a cylinder': 'Касательная к цилиндру',
    'Densify': 'Уплотнить сетку',
    'Wrap': 'Замкнутая оболочка',
    'Minimum zone · 1,250 points · 0.050 mm peak to peak about the best fit': 'Минимальная зона · точек: 1,250 · полный размах относительно наилучшего приближения: 0.050 мм',
    'Wrapped — 2 shells, 120 triangles,': 'Оболочка построена — оболочек: 2, треугольников: 120,',
  })) assert.equal(tr(source), expected, source)
  // A sentence begins with a capital; a noun used inside it keeps its own case.
  assert.equal(tr('reference'), 'эталон')
})


test('ScanRuler 0.10.2 project errors preserve filenames and diagnostic paths', () => {
  const { tr } = load().window.scanrulerRu
  assert.equal(tr('The project cannot hold a file named "деталь.jpé".'), 'В проект нельзя сохранить файл с именем «деталь.jpé».')
  assert.equal(tr('Malformed project: flat.sheets.section-1.datum.originPx.'), 'Повреждённый проект: flat.sheets.section-1.datum.originPx.')
  assert.equal(tr('Malformed project: duplicate or invalid archive member.'), 'Повреждённый проект: повторяющийся или неверный элемент архива.')
})


test('ScanRuler 0.11.1 project warnings translate the complete message', () => {
  const { tr } = load().window.scanrulerRu
  const one = tr('Project opened — part.scanruler. The surface of Cylinder 1 could not be found again — its saved fit stands (No points).')
  assert.match(one, /^Проект открыт — part.scanruler\. Не удалось повторно найти поверхность/)
  assert.doesNotMatch(one, /its saved fit|could not be found/)
  const many = tr('Project opened — part.scanruler. The surfaces of Cylinder 1 and Plane 2 could not be found again — their saved fits stand (No points).')
  assert.match(many, /сохранённые результаты аппроксимации/)
  const newer = tr('This project was saved by a newer version of ScanRuler — please reload the app to open it. It has construction "plane:future-method", which this version does not know.')
  assert.match(newer, /Не поддерживается способ построения: «plane:future-method»/)
})


test('ScanRuler 0.11.1 agent help preserves the port and commands', () => {
  const { tr } = load().window.scanrulerRu
  const source = `Nothing answers on port 7317 on this computer yet. Is the AI app running, with ScanRuler's connector (scanruler-mcp) on that port? "npx -y scanruler-mcp@latest --pair" prints the port and the token. In Safari, or where the browser will not let this site reach this computer, open the page "scanruler-mcp --serve" gives instead.`
  const result = tr(source)
  assert.match(result, /^На порту 7317 этого компьютера пока нет ответа/)
  assert.ok(result.includes('npx -y scanruler-mcp@latest --pair'))
  assert.ok(result.includes('scanruler-mcp --serve'))
  assert.doesNotMatch(result, /Nothing answers|Is the AI app|prints the port/)
})
