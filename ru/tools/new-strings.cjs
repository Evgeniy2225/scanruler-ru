// Для сопровождающих: находит в исходниках ScanRuler английские строки
// интерфейса, которых ещё нет в словаре ru/i18n, и пишет их в
// ru/i18n/_new-strings.txt — после обновления ScanRuler переведите их и
// добавьте в любой ru/i18n/*.json.
// Запуск из папки ScanRuler: node ru/tools/new-strings.cjs
// SPDX-License-Identifier: AGPL-3.0-only
const fs = require('fs'), path = require('path')
const root = path.resolve(__dirname, '..', '..')
const ts = require(path.join(root, 'node_modules', 'typescript'))
const dictDir = path.join(root, 'ru', 'i18n')
const have = new Set()
for (const f of fs.readdirSync(dictDir).filter((f) => f.endsWith('.json')))
  for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(dictDir, f), 'utf8')))) have.add(k)
const DIRS = ['src/ui', 'src/app', 'src/viewer', 'src/state', 'src/App.tsx', 'plugins/mesh-tools/ui', 'plugins/mesh-tools/app', 'plugins/reverse/ui', 'plugins/reverse/state', 'src/core/dimensions.ts', 'src/core/tolerances.ts', 'src/core/elements', 'src/core/flat/construct.ts', 'src/core/flat/dimensions.ts', 'src/core/flat/summary.ts', 'plugins/reverse/core/thread.ts', 'plugins/reverse/core/wasmSupport.ts', 'plugins/reverse/viewer/networkLayer.ts', 'plugins/mesh-tools/core', 'plugins/reverse/app', 'src/core/hints.ts', 'src/core/field/colormap.ts', 'src/core/parsers', 'src/core/project', 'plugins/reverse/core/meshResolution.ts']
const files = []
const walk = (p) => {
  if (!fs.existsSync(p)) return
  if (fs.statSync(p).isDirectory()) { for (const e of fs.readdirSync(p)) if (!/node_modules|tests?$/.test(e)) walk(path.join(p, e)) }
  else if (/\.(tsx|ts)$/.test(p) && !/\.test\.|\.d\.ts$|Commands?\.ts$/.test(p)) files.push(p)
}
DIRS.forEach((d) => walk(path.join(root, d)))
const ATTRS = /^(title|placeholder|aria-label|alt|label|detail|hint|tip|text|heading|note|caption|info|help|summary|message|legend|empty|description)$|Label|Text|Title|Hint|Tip$/
const prose = (s) => (/[a-z]/.test(s) && /\s/.test(s.trim())) || /^[A-Z][A-Za-z]+(…)?$/.test(s.trim())
const dec = (s) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&rsquo;/g, '’').replace(/&nbsp;/g, ' ')
const found = new Map()
const add = (s, f) => {
  s = dec(s.replace(/\s+/g, ' ').trim())
  if (!/[A-Za-z]{2}/.test(s) || have.has(s) || /rgba?\(|px \{|#include|uniform |gl_/.test(s)) return
  if (!found.has(s)) found.set(s, path.relative(root, f))
}
for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const visit = (n) => {
    if (ts.isJsxText(n)) add(n.text, f)
    else if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer)) { if (ATTRS.test(n.name.getText())) add(n.initializer.text, f) }
    else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.parent && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent) && !ts.isJsxAttribute(n.parent) && !ts.isLiteralTypeNode(n.parent) && !(ts.isBinaryExpression(n.parent)) && !ts.isCaseClause(n.parent) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) { if (prose(n.text)) add(n.text, f) }
    else if (ts.isTemplateExpression(n)) {
      let s = n.head.text, i = 0
      for (const sp of n.templateSpans) s += '{' + i++ + '}' + sp.literal.text
      if (prose(s.replace(/\{\d\}/g, '0'))) add(s, f)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}
const outFile = path.join(dictDir, '_new-strings.txt')
fs.writeFileSync(outFile, [...found].map(([s, f]) => `${s}\t# ${f}`).join('\n') + '\n')
console.log(`Новых строк без перевода: ${found.size} → ${outFile}`)
