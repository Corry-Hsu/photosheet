const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../core.js');
const S = require('../admin-monthly-stats.js');

test('Taiwan month boundaries, January rollover and ROC labels', () => {
  assert.deepEqual(S.months('2027-01-01'), ['2027-01', '2026-12']);
  assert.deepEqual(S.months(PSCore.today(new Date('2026-10-31T16:00:00Z'))), ['2026-11', '2026-10']);
  assert.equal(S.label('2026-10'), '民國115年10月');
});

test('one task is one case, parcels accumulate per case across types and statuses', () => {
  const tasks = [
    { id:'a', serial:'same', type:'雜草垃圾', resultDate:'2026-10-01', parcels:[1,2], completed:true },
    { id:'b', serial:'same', type:'雜草垃圾', resultDate:'2026-10-31', parcels:[1], assignmentClosed:true },
    { type:'砍樹', resultDate:'2026-10-12', parcels:[1,2,3], reopenedForDispatch:true },
    { type:'圍籬', resultDate:'2026-10-13', parcels:[1] },
    { type:'圍籬', resultDate:'2026-11-01', parcels:[1,2] },
    ...['', '2026-10-32', '2026-1-1', '2025-10-01'].map(resultDate =>
      ({ type:'圍籬', resultDate, parcels:[1] })),
  ];
  const original = JSON.stringify(tasks);
  assert.deepEqual(S.summarize(tasks,'2026-10'), [
    {type:'雜草垃圾',cases:2,parcels:3},
    {type:'砍樹',cases:1,parcels:3},
    {type:'圍籬',cases:1,parcels:1},
    {type:'合計',cases:4,parcels:7},
  ]);
  assert.equal(JSON.stringify(tasks), original);
  assert.deepEqual(S.summarize([], '2026-10').map(r=>[r.cases,r.parcels]), [[0,0],[0,0],[0,0],[0,0]]);
  assert.equal(S.summarize([{type:'砍樹',resultDate:'2028-02-29',parcels:[1]}], '2028-02')[1].cases,1);
});
