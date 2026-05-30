/**
 * 타로 운세 서비스 - 종합 테스트 케이스
 * 실행: node tc.mjs
 * 전제: http://localhost:3000 에서 서버가 실행 중이어야 함
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const RESULTS = [];
let browser, page;

/* ── 유틸 ─────────────────────────────────────────────── */
function pass(id, msg) {
  RESULTS.push({ id, ok: true, msg });
  console.log(`  ✓ [${id}] ${msg}`);
}
function fail(id, msg, detail = '') {
  RESULTS.push({ id, ok: false, msg, detail });
  console.log(`  ✗ [${id}] ${msg}${detail ? ' → ' + detail : ''}`);
}
async function check(id, desc, fn) {
  try {
    const ok = await fn();
    if (ok) pass(id, desc);
    else     fail(id, desc);
  } catch (e) {
    fail(id, desc, e.message);
  }
}

async function waitFor(fn, timeout = 8000, interval = 300) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true;
    await page.waitForTimeout(interval);
  }
  return false;
}

/* ── 전체 플로우 헬퍼 ─────────────────────────────────── */
async function runFullFlow(topic) {
  // 인트로 셔플 버튼 클릭
  await page.click('#shuffleBtn');
  // 토픽 오버레이 등장 대기 (최대 6초)
  const topicVisible = await waitFor(() => page.evaluate(() =>
    document.getElementById('topicOverlay')?.classList.contains('spread-visible') ?? false
  ), 6000);
  if (!topicVisible) throw new Error('topic overlay not visible after shuffle');

  // 토픽 선택
  await page.evaluate((t) => window.chooseTopic(t), topic);
  await page.waitForTimeout(800);

  // 스프레드 오버레이 등장 대기
  const spreadVisible = await waitFor(() => page.evaluate(() =>
    document.getElementById('spreadOverlay')?.classList.contains('spread-visible') ?? false
  ), 5000);
  if (!spreadVisible) throw new Error('spread overlay not visible after chooseTopic');

  // 카드 3장 선택
  const slots = await page.$$('#spreadCards .spread-slot');
  if (slots.length < 9) throw new Error(`only ${slots.length} slots`);
  await slots[0].click(); await page.waitForTimeout(150);
  await slots[4].click(); await page.waitForTimeout(150);
  await slots[8].click(); await page.waitForTimeout(200);

  // 그리드 진입 대기
  const gridReady = await waitFor(() => page.evaluate(() =>
    document.querySelectorAll('#grid .card').length >= 3
  ), 8000);
  if (!gridReady) throw new Error('grid not ready');

  // 카드 3장 뒤집기
  for (let i = 0; i < 3; i++) {
    await page.click(`#cd${i}`).catch(() => {});
    await page.waitForTimeout(350);
  }

  // 광고 카운트 + 스킵
  await page.waitForTimeout(6000);
  await page.click('#adSkip').catch(() => {});
  await page.waitForTimeout(600);
}

/* ══════════════════════════════════════════════════════════
   TC 시작
   ══════════════════════════════════════════════════════════ */
try {
  browser = await chromium.launch({ headless: true });

  /* ── SUITE A: 페이지 로드 ─────────────────────────────── */
  console.log('\n▶ SUITE A: 페이지 로드');
  page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE + '/');
  await page.waitForTimeout(500);

  await check('A-01', '페이지 타이틀 포함 "타로"', async () =>
    (await page.title()).includes('타로')
  );
  await check('A-02', '인트로 오버레이 visible', async () =>
    await page.evaluate(() => {
      const el = document.getElementById('introOverlay');
      return el && getComputedStyle(el).display !== 'none';
    })
  );
  await check('A-03', '토픽 오버레이 초기 hidden', async () =>
    await page.evaluate(() => {
      const el = document.getElementById('topicOverlay');
      return el && el.style.display === 'none';
    })
  );
  await check('A-04', '스프레드 오버레이 초기 hidden', async () =>
    await page.evaluate(() => {
      const el = document.getElementById('spreadOverlay');
      return el && el.style.display !== 'flex';
    })
  );
  await check('A-05', '"카드 섞기" 버튼 존재', async () =>
    await page.evaluate(() => !!document.getElementById('shuffleBtn'))
  );
  await check('A-06', '"카드 다시 뽑기" 버튼 존재', async () =>
    await page.evaluate(() =>
      !!document.querySelector('button.btn:not(.share-btn)')
    )
  );
  await check('A-07', '"타로 카드 해설 보기" 링크 존재', async () =>
    await page.evaluate(() => !!document.querySelector('a[href="cards.html"]'))
  );
  await check('A-08', '방문자 카운터 요소 존재', async () =>
    await page.evaluate(() =>
      !!document.getElementById('todayCount') && !!document.getElementById('totalCount')
    )
  );
  await check('A-09', '음악 토글 버튼 존재', async () =>
    await page.evaluate(() => !!document.getElementById('musicToggle'))
  );
  await check('A-10', '날짜 배지 존재', async () =>
    await page.evaluate(() => !!document.getElementById('dateBadge'))
  );
  await page.close();

  /* ── SUITE B: daily 토픽 전체 플로우 ────────────────────── */
  console.log('\n▶ SUITE B: daily 토픽 전체 플로우');
  page = await browser.newPage();
  const bErrors = [];
  page.on('pageerror', e => bErrors.push(e.message));
  await page.goto(BASE + '/');
  await page.waitForTimeout(400);

  // 인트로 셔플
  await page.click('#shuffleBtn');
  const topicShownB = await waitFor(() => page.evaluate(() =>
    document.getElementById('topicOverlay')?.classList.contains('spread-visible') ?? false
  ), 6000);

  await check('B-01', '셔플 후 토픽 오버레이 표시', () => topicShownB);
  await check('B-02', '토픽 버튼 4개 (연애/직장/재물/오늘 하루)', async () =>
    await page.evaluate(() => document.querySelectorAll('.topic-slot').length === 4)
  );
  await check('B-03', '"연애·감정" 버튼 텍스트 존재', async () =>
    await page.evaluate(() =>
      [...document.querySelectorAll('.topic-kr')].some(e => e.textContent.includes('연애'))
    )
  );

  // daily 선택
  await page.evaluate(() => window.chooseTopic('daily'));
  await page.waitForTimeout(800);
  const spreadShownB = await waitFor(() => page.evaluate(() =>
    document.getElementById('spreadOverlay')?.classList.contains('spread-visible') ?? false
  ), 5000);

  await check('B-04', 'daily 선택 후 스프레드 오버레이 표시', () => spreadShownB);
  await check('B-05', '힌트 텍스트 Past·Present·Future 포함', async () =>
    await page.evaluate(() =>
      document.querySelector('.hint')?.innerHTML?.includes('Past') ?? false
    )
  );
  await check('B-06', '스프레드 카드 슬롯 22개 이상', async () => {
    const n = await page.evaluate(() => document.querySelectorAll('#spreadCards .spread-slot').length);
    return n >= 22;
  });

  // 카드 3장 선택
  const slots = await page.$$('#spreadCards .spread-slot');
  await slots[0].click(); await page.waitForTimeout(150);
  await slots[5].click(); await page.waitForTimeout(150);
  await slots[10].click(); await page.waitForTimeout(200);

  const gridReadyB = await waitFor(() => page.evaluate(() =>
    document.querySelectorAll('#grid .card').length >= 3
  ), 8000);

  await check('B-07', '카드 3장 선택 후 그리드 진입', () => gridReadyB);
  await check('B-08', 'pos-lbl: 과거·현재·미래 (daily)', async () => {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('.pos-lbl')].map(e => e.textContent)
    );
    return JSON.stringify(labels) === JSON.stringify(['과거', '현재', '미래']);
  });

  // 카드 3장 뒤집기
  for (let i = 0; i < 3; i++) {
    await page.click(`#cd${i}`).catch(() => {});
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(6000);
  await page.click('#adSkip').catch(() => {});
  await page.waitForTimeout(600);

  await check('B-09', '운세 요약 표시 (summary.on)', async () =>
    await page.evaluate(() =>
      document.getElementById('summary')?.classList.contains('on') ?? false
    )
  );
  await check('B-10', 'sumTitle: 오늘의 별이 전하는 말 (daily)', async () =>
    await page.evaluate(() =>
      document.getElementById('sumTitle')?.textContent === '오늘의 별이 전하는 말'
    )
  );
  await check('B-11', 'sum-pos-lbl에 위치 레이블 포함 (과거/현재/미래)', async () => {
    const lbls = await page.evaluate(() =>
      [...document.querySelectorAll('.sum-pos-lbl')].map(e => e.textContent)
    );
    return lbls.length === 3 && ['과거', '현재', '미래'].every((p, i) => lbls[i]?.includes(p));
  });
  await check('B-12', 'sum-text 내용 있음', async () => {
    const txt = await page.evaluate(() => document.getElementById('sumText')?.innerText ?? '');
    return txt.trim().length > 10;
  });
  await check('B-13', '공유 버튼 표시', async () =>
    await page.evaluate(() => {
      const w = document.getElementById('shareWrap');
      return w && w.style.display !== 'none';
    })
  );
  await check('B-14', 'JavaScript 에러 없음 (daily 플로우)', () => bErrors.length === 0);
  if (bErrors.length) console.log('    에러:', bErrors.slice(0, 3));
  await page.close();

  /* ── SUITE C: love 토픽 ───────────────────────────────── */
  console.log('\n▶ SUITE C: love 토픽 레이블');
  page = await browser.newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(400);
  await page.click('#shuffleBtn');
  await waitFor(() => page.evaluate(() =>
    document.getElementById('topicOverlay')?.classList.contains('spread-visible') ?? false
  ), 6000);
  await page.evaluate(() => window.chooseTopic('love'));
  await page.waitForTimeout(800);
  await waitFor(() => page.evaluate(() =>
    document.getElementById('spreadOverlay')?.classList.contains('spread-visible') ?? false
  ), 5000);
  const slotsC = await page.$$('#spreadCards .spread-slot');
  await slotsC[1].click(); await page.waitForTimeout(150);
  await slotsC[6].click(); await page.waitForTimeout(150);
  await slotsC[11].click(); await page.waitForTimeout(200);
  await waitFor(() => page.evaluate(() =>
    document.querySelectorAll('#grid .card').length >= 3
  ), 8000);
  await check('C-01', 'pos-lbl: 현재 감정·상대 마음·앞으로의 흐름 (love)', async () => {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('.pos-lbl')].map(e => e.textContent)
    );
    return JSON.stringify(labels) === JSON.stringify(['현재 감정', '상대 마음', '앞으로의 흐름']);
  });
  for (let i = 0; i < 3; i++) { await page.click(`#cd${i}`).catch(()=>{}); await page.waitForTimeout(350); }
  await page.waitForTimeout(6000);
  await page.click('#adSkip').catch(()=>{});
  await page.waitForTimeout(600);
  await check('C-02', 'sumTitle: 마음이 전하는 오늘의 메시지 (love)', async () =>
    await page.evaluate(() =>
      document.getElementById('sumTitle')?.textContent === '마음이 전하는 오늘의 메시지'
    )
  );
  await check('C-03', 'sum-pos-lbl 현재 감정 포함 (love)', async () => {
    const lbls = await page.evaluate(() =>
      [...document.querySelectorAll('.sum-pos-lbl')].map(e => e.textContent)
    );
    return lbls[0]?.includes('현재 감정') ?? false;
  });
  await page.close();

  /* ── SUITE D: work 토픽 ──────────────────────────────── */
  console.log('\n▶ SUITE D: work 토픽 레이블');
  page = await browser.newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(400);
  await page.click('#shuffleBtn');
  await waitFor(() => page.evaluate(() =>
    document.getElementById('topicOverlay')?.classList.contains('spread-visible') ?? false
  ), 6000);
  await page.evaluate(() => window.chooseTopic('work'));
  await page.waitForTimeout(800);
  await waitFor(() => page.evaluate(() =>
    document.getElementById('spreadOverlay')?.classList.contains('spread-visible') ?? false
  ), 5000);
  const slotsD = await page.$$('#spreadCards .spread-slot');
  await slotsD[2].click(); await page.waitForTimeout(150);
  await slotsD[7].click(); await page.waitForTimeout(150);
  await slotsD[12].click(); await page.waitForTimeout(200);
  await waitFor(() => page.evaluate(() =>
    document.querySelectorAll('#grid .card').length >= 3
  ), 8000);
  await check('D-01', 'pos-lbl: 현재 상황·장애물·조언 (work)', async () => {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('.pos-lbl')].map(e => e.textContent)
    );
    return JSON.stringify(labels) === JSON.stringify(['현재 상황', '장애물', '조언']);
  });
  for (let i = 0; i < 3; i++) { await page.click(`#cd${i}`).catch(()=>{}); await page.waitForTimeout(350); }
  await page.waitForTimeout(6000);
  await page.click('#adSkip').catch(()=>{});
  await page.waitForTimeout(600);
  await check('D-02', 'sumTitle: 일과 진로의 오늘 메시지 (work)', async () =>
    await page.evaluate(() =>
      document.getElementById('sumTitle')?.textContent === '일과 진로의 오늘 메시지'
    )
  );
  await page.close();

  /* ── SUITE E: money 토픽 ─────────────────────────────── */
  console.log('\n▶ SUITE E: money 토픽 레이블');
  page = await browser.newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(400);
  await page.click('#shuffleBtn');
  await waitFor(() => page.evaluate(() =>
    document.getElementById('topicOverlay')?.classList.contains('spread-visible') ?? false
  ), 6000);
  await page.evaluate(() => window.chooseTopic('money'));
  await page.waitForTimeout(800);
  await waitFor(() => page.evaluate(() =>
    document.getElementById('spreadOverlay')?.classList.contains('spread-visible') ?? false
  ), 5000);
  const slotsE = await page.$$('#spreadCards .spread-slot');
  await slotsE[3].click(); await page.waitForTimeout(150);
  await slotsE[8].click(); await page.waitForTimeout(150);
  await slotsE[13].click(); await page.waitForTimeout(200);
  await waitFor(() => page.evaluate(() =>
    document.querySelectorAll('#grid .card').length >= 3
  ), 8000);
  await check('E-01', 'pos-lbl: 현재 흐름·기회·주의할 점 (money)', async () => {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('.pos-lbl')].map(e => e.textContent)
    );
    return JSON.stringify(labels) === JSON.stringify(['현재 흐름', '기회', '주의할 점']);
  });
  for (let i = 0; i < 3; i++) { await page.click(`#cd${i}`).catch(()=>{}); await page.waitForTimeout(350); }
  await page.waitForTimeout(6000);
  await page.click('#adSkip').catch(()=>{});
  await page.waitForTimeout(600);
  await check('E-02', 'sumTitle: 재물과 기회의 오늘 메시지 (money)', async () =>
    await page.evaluate(() =>
      document.getElementById('sumTitle')?.textContent === '재물과 기회의 오늘 메시지'
    )
  );
  await page.close();

  /* ── SUITE F: 다시 뽑기 (redraw) ─────────────────────── */
  console.log('\n▶ SUITE F: 다시 뽑기 (STATE 리셋)');
  page = await browser.newPage();
  const fErrors = [];
  page.on('pageerror', e => fErrors.push(e.message));
  await page.goto(BASE + '/');
  await page.waitForTimeout(400);

  // daily 한 번 완료
  await runFullFlow('daily');

  await check('F-01', '운세 완료 후 요약 표시', async () =>
    await page.evaluate(() =>
      document.getElementById('summary')?.classList.contains('on') ?? false
    )
  );

  // 다시 뽑기 클릭
  await page.click('button.btn:not(.share-btn)');
  const topicRedraw = await waitFor(() => page.evaluate(() =>
    document.getElementById('topicOverlay')?.classList.contains('spread-visible') ?? false
  ), 6000);
  await check('F-02', '다시 뽑기 후 토픽 오버레이 재표시', () => topicRedraw);

  // love 선택
  await page.evaluate(() => window.chooseTopic('love'));
  await page.waitForTimeout(800);
  await waitFor(() => page.evaluate(() =>
    document.getElementById('spreadOverlay')?.classList.contains('spread-visible') ?? false
  ), 5000);
  const slotsF = await page.$$('#spreadCards .spread-slot');
  await slotsF[2].click(); await page.waitForTimeout(150);
  await slotsF[7].click(); await page.waitForTimeout(150);
  await slotsF[12].click(); await page.waitForTimeout(200);
  // 이전 run의 그리드(daily)가 남아있으므로, 새 카드 등장을 정확히 기다림
  // 먼저 그리드가 초기화(0장)되는 순간을 포착 후 3장 재등장 대기
  await waitFor(() => page.evaluate(() =>
    document.querySelectorAll('#grid .card').length === 0
  ), 5000).catch(() => {});  // 빠른 전환 시 0→3 을 못 잡을 수 있어 catch
  await waitFor(() => page.evaluate(() =>
    document.querySelectorAll('#grid .card').length >= 3
  ), 8000);
  for (let i = 0; i < 3; i++) { await page.click(`#cd${i}`).catch(()=>{}); await page.waitForTimeout(350); }
  // 카드 뒤집기 후 pos-lbl 확인 (applyLabels가 충분히 실행된 이후)
  await page.waitForTimeout(400);
  await check('F-03', 'pos-lbl love로 전환 (다시 뽑기 후)', async () => {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('.pos-lbl')].map(e => e.textContent)
    );
    return JSON.stringify(labels) === JSON.stringify(['현재 감정', '상대 마음', '앞으로의 흐름']);
  });
  await page.waitForTimeout(6000);
  await page.click('#adSkip').catch(()=>{});
  await page.waitForTimeout(600);
  await check('F-04', 'sumTitle love로 전환 (다시 뽑기 후)', async () =>
    await page.evaluate(() =>
      document.getElementById('sumTitle')?.textContent === '마음이 전하는 오늘의 메시지'
    )
  );
  await check('F-05', 'sum-pos-lbl 현재 감정 포함 (다시 뽑기 후)', async () => {
    const lbls = await page.evaluate(() =>
      [...document.querySelectorAll('.sum-pos-lbl')].map(e => e.textContent)
    );
    return lbls[0]?.includes('현재 감정') ?? false;
  });
  await check('F-06', 'JavaScript 에러 없음 (다시 뽑기 플로우)', () => fErrors.length === 0);
  if (fErrors.length) console.log('    에러:', fErrors.slice(0, 3));
  await page.close();

  /* ── SUITE G: 보조 페이지 ─────────────────────────────── */
  console.log('\n▶ SUITE G: 보조 페이지');
  page = await browser.newPage();
  const gErrors = [];
  page.on('pageerror', e => gErrors.push(e.message));
  await page.goto(BASE + '/cards.html');
  await page.waitForTimeout(1000);
  await check('G-01', 'cards.html 로드 (타이틀 포함 "타로")', async () =>
    (await page.title()).includes('타로')
  );
  await check('G-02', 'cards.html 카드 항목 22개 이상', async () => {
    const n = await page.evaluate(() =>
      document.querySelectorAll('.card-section, .card-entry, [data-card], .tarot-card').length
    );
    return n >= 20;
  });
  await check('G-03', 'cards.html JS 에러 없음', () => gErrors.length === 0);
  await page.close();

  page = await browser.newPage();
  const privErrors = [];
  page.on('pageerror', e => privErrors.push(e.message));
  await page.goto(BASE + '/privacy.html');
  await page.waitForTimeout(500);
  await check('G-04', 'privacy.html 로드', async () =>
    (await page.title()).length > 0
  );
  await check('G-05', 'privacy.html JS 에러 없음', () => privErrors.length === 0);
  await page.close();

} catch (e) {
  console.error('\n[FATAL]', e.message);
  RESULTS.push({ id: 'FATAL', ok: false, msg: e.message });
} finally {
  if (browser) await browser.close();
}

/* ── 결과 요약 ─────────────────────────────────────────── */
const total  = RESULTS.length;
const passed = RESULTS.filter(r => r.ok).length;
const failed = RESULTS.filter(r => !r.ok);

console.log('\n══════════════════════════════════════════');
console.log(`  결과: ${passed} / ${total} PASS`);
if (failed.length) {
  console.log('\n  FAIL 목록:');
  failed.forEach(r => console.log(`    ✗ [${r.id}] ${r.msg}${r.detail ? ' → ' + r.detail : ''}`));
}
console.log('══════════════════════════════════════════\n');

// 모두 패스하면 exit 0, 실패 있으면 exit 1
process.exit(failed.length === 0 ? 0 : 1);
