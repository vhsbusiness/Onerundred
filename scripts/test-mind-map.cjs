// Pure invariants: no database, credentials, browser or network required.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, "../src/lib", name + ".ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", "module", code)(module.exports, p => load(p.slice(2)), module);
  modules.set(name, module.exports);
  return module.exports;
}
const { arrangeMindMap } = load("mind-auto");
const { textBlockSize } = load("mind-size");
const { mindBranchIds } = load("mind-tree");
const { positionBranch } = load("mind-layout");
const n = (id, parentId, x, y, extra = {}) => ({ id, parentId, x, y, title: id, fontSize: 14, shape: "plain", color: "blue", detached: false, locked: false, autoLayout: false, imageData: "", imageWidth: 240, imageHeight: 160, ...extra });
const apply = nodes => { const moves = new Map(arrangeMindMap(nodes).map(n => [n.id, n])); return nodes.map(n => ({ ...n, ...moves.get(n.id) })); };
test("Auto separates subtrees, aligns levels and is idempotent", () => {
  const initial = [n("root", null, 0, 0, { autoLayout: true })];
  for (let a = 0; a < 4; a++) {
    initial.push(n("b" + a, "root", 400 + a * 10, a * 30, { textWidth: 200 + a * 40 }));
    for (let j = 0; j <= a; j++) initial.push(n("c" + a + j, "b" + a, 450, j * 10, { title: "Filho\ncom duas linhas" }));
  }
  const nodes = apply(initial);
  assert.deepEqual(arrangeMindMap(nodes), []);
  assert.equal(new Set(nodes.filter(n => n.parentId === "root").map(n => n.x)).size, 1);
  for (const a of nodes) for (const b of nodes) {
    if (a.id === b.id) continue;
    const A = textBlockSize(a), B = textBlockSize(b);
    assert(Math.abs(a.x - b.x) >= (A.width + B.width) / 2 || Math.abs(a.y - b.y) >= (A.height + B.height) / 2, `Overlap: ${a.id}/${b.id}`);
  }
});
test("Auto preserves pinned descendants, other roots and direction", () => {
  const nodes = [n("root", null, 0, 0, { autoLayout: true }), n("left", "root", -240, 0), n("right-of-left", "left", 0, 80), n("sibling", "root", 240, 0), n("free", null, 240, 180, { detached: true }), n("fixed", "sibling", 480, 0, { locked: true }), n("fixed-child", "fixed", 600, -200)];
  const next = apply(nodes), byId = new Map(next.map(n => [n.id, n]));
  for (const id of ["root", "free", "fixed", "fixed-child"]) assert.deepEqual(byId.get(id), nodes.find(n => n.id === id));
  assert(byId.get("left").x < 0);
  assert(byId.get("right-of-left").x > byId.get("left").x);
  assert.deepEqual(arrangeMindMap(next), []);
});
test("Subtree selection includes descendants exactly once", () => {
  const nodes = [n("r", null, 0, 0), n("a", "r", 0, 0), n("b", "a", 0, 0), n("other", null, 0, 0)];
  assert.deepEqual([...mindBranchIds(nodes, ["a", "b"])].sort(), ["a", "b"]);
  assert.deepEqual([...mindBranchIds(nodes, ["r"])].sort(), ["a", "b", "r"]);
});
test("Resized text and new lines affect layout without changing font size", () => {
  const single = n("r", null, 0, 0), multiline = { ...single, title: "A\nB\nC" };
  assert(textBlockSize(multiline).height > textBlockSize(single).height);
  const large = { ...single, textWidth: 1000, textHeight: 160 };
  assert.deepEqual(textBlockSize(large), { width: 1000, height: 160 });
  const branch = positionBranch(large, [large], "right");
  assert(branch.x > large.x + 500 + 60);
  assert(positionBranch(single, [single]).x > single.x);
});

test("Resizing keeps links clear and translates descendants together", () => {
  const { spaceMindChildren } = load("mind-spacing");
  const nodes = [n("root", null, 0, 0, { textWidth: 800 }), n("a", "root", 240, 0), n("b", "a", 480, 30)];
  const next = spaceMindChildren(nodes, new Set(["root"]));
  assert(next[1].x > 400);
  assert.equal(next[2].x - next[1].x, 240);
  assert.equal(next[2].y, 30);
  assert.throws(() => spaceMindChildren(nodes.map(n => n.id === "b" ? { ...n, locked: true } : n), new Set(["root"])));
});

const { mindDropTarget } = load('mind-drop');
test('Drop reconnects one subtree, never itself, a descendant, its current parent or media', () => {
  const nodes = [n('r', null, 0, 0), n('a', 'r', 1, 0), n('b', 'a', 2, 0), n('target', null, 3, 0), n('image', null, 4, 0, { imageData: 'data:' })];
  const boxes = nodes.map((n, i) => ({ id: n.id, rect: { left: i * 100, right: i * 100 + 40, top: 0, bottom: 30 } }));
  assert.deepEqual(mindDropTarget(nodes, ['a'], boxes, { x: 320, y: 15 }), { id: 'a', parentId: 'target' });
  for (const x of [20, 120, 220, 420, 500]) assert.equal(mindDropTarget(nodes, ['a'], boxes, { x, y: 15 }), null);
  assert.deepEqual(mindDropTarget(nodes, ['a', 'b'], boxes, { x: 320, y: 15 }), { id: 'a', parentId: 'target' });
  assert.equal(mindDropTarget(nodes, ['a', 'target'], boxes, { x: 20, y: 15 }), null);
});
test('Text clipboard accepts only supported formatting, not structure or executable links', () => {
  const { safeMindTextStyle, writeMindText, MIND_TEXT_MIME } = load('mind-text-clipboard');
  assert.deepEqual(safeMindTextStyle({ bold: true, textColor: '#ff0011', highlight: '', fontSize: 18, link: 'https://example.test', parentId: 'injected', locked: true }),
    { bold: true, textColor: '#ff0011', highlight: '', fontSize: 18, link: 'https://example.test' });
  assert.deepEqual(safeMindTextStyle({ bold: 'true', textColor: 'url(evil)', fontSize: 999, link: 'javascript:alert(1)' }), {});
  const values = {}, clipboard = { setData: (type, data) => values[type] = data };
  writeMindText(clipboard, '<img src=x> & 🟢', { bold: true, textColor: '#123456', highlight: '', fontSize: 14, link: '' });
  assert.equal(values['text/plain'], '<img src=x> & 🟢');
  assert(!values['text/html'].includes('<img'));
  assert.equal(JSON.parse(values[MIND_TEXT_MIME]).style.bold, true);
});
