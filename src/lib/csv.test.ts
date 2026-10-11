import assert from "node:assert/strict"
import test from "node:test"
import { parseCsv, planDirectoryImport, toCsv } from "./csv.ts"

test("parseCsv keeps commas inside quotes", () => {
  const rows = parseCsv('household_name,address\r\n"Whitaker","42 Maple Lane, Harmony"\r\n')
  assert.deepEqual(rows, [
    ["household_name", "address"],
    ["Whitaker", "42 Maple Lane, Harmony"],
  ])
})

test("parseCsv unescapes doubled quotes", () => {
  const rows = parseCsv('"She said ""hello"""\n')
  assert.deepEqual(rows, [['She said "hello"']])
})

test("toCsv round-trips a quoted field", () => {
  const rows = parseCsv(toCsv([["name", "note"], ["Ada", 'Hello, "friend"']]))
  assert.deepEqual(rows[1], ["Ada", 'Hello, "friend"'])
})

test("planDirectoryImport accepts a child row and rejects a bad birthday", () => {
  const good = planDirectoryImport(
    [
      "household_name,first_name,last_name,is_child,birthdate",
      "Example,Ben,Example,yes,2019-05-01",
    ].join("\n"),
  )
  assert.equal(good.errors.length, 0)
  assert.equal(good.people[0]?.isChild, true)
  assert.equal(good.people[0]?.birthdate, "2019-05-01")

  const bad = planDirectoryImport(
    ["household_name,first_name,last_name,birthdate", "Example,Ada,Example,May 1"].join("\n"),
  )
  assert.equal(bad.people.length, 0)
  assert.match(bad.errors[0] ?? "", /birthday/i)
})
