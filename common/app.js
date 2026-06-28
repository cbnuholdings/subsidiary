/* =========================================================================
   자회사 설립 통합관리 — 공통 프레임워크 (app.js)  전역: SUB
   - 로컬↔서버 전환(config.json apiUrl 한 줄), 2층 cid, 5역할 부여형 인증
   - 레코드 저장(applicants/loi/invest/ic/portfolio), localStorage 우선
   - brand.js(BRAND.renderHeader)가 요구하는 API 표면 제공
   ========================================================================= */
var SUB = (function (global) {
  'use strict';

  var LS_KEY = 'SUB_DB_v6';
  var CFG = { apiUrl: '', org: '충북대학교기술지주㈜' };
  // 서버 동기화 컬렉션 정의 — kind: 'array'(cid 식별 배열) | 'map'(cid/id 키 맵) | 'single'(싱글턴)
  var COLLS = {
    companies:  { kind: 'array', key: 'cid' },
    leads:      { kind: 'array', key: 'leadId' },   // 발굴(미신청 잠재기업)
    applicants: { kind: 'map' },
    loi:        { kind: 'map' },
    invest:     { kind: 'map' },
    ic:         { kind: 'map' },
    portfolio:  { kind: 'map' },
    accounts:   { kind: 'map' },
    icConfig:   { kind: 'single' },
    benefits:   { kind: 'single' }
  };

  // ---- 결정적 해시(djb2, 비암호) : cid 식별·PW 데모 해시용 ----
  function hash(str) {
    var h = 5381, i = String(str).length;
    while (i) h = (h * 33) ^ String(str).charCodeAt(--i);
    return (h >>> 0).toString(36);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  /* ---- 2층 cid ----
     기창업(사업자번호 보유): cid = 'C' + 사업자번호(숫자만)
     예비창업(사업자번호 없음): cid = 'P' + hash(대표자명 + 생년월일)  // 개인정보 해시
     appId(연도별 신청 인스턴스): cid + '-' + year + '-' + seq          */
  function makeCID(p) {
    p = p || {};
    var biz = digits(p.bizno);
    if (biz.length >= 10) return 'C' + biz;
    var key = String(p.ceoName || '').replace(/\s/g, '') + '|' + digits(p.birth);
    return 'P' + hash(key);
  }
  function makeAppId(cid, year, seq) {
    return cid + '-' + year + '-' + ('000' + (seq || 1)).slice(-3);
  }

  // ---- 5역할 (tabs는 brand.js PAGES.tab과 매칭) ----
  var ROLES = {
    admin:     { label: '종합관리자', tabs: ['apply','loi','invest','ic','board','port','admin'] },
    staff:     { label: '지주 담당자/컨설턴트', tabs: ['apply','loi','invest','ic','board','port'] },
    ic:        { label: '심의위원', tabs: ['ic'] },
    tlo:       { label: '산학협력단', tabs: ['loi'] },
    applicant: { label: '신청기업', tabs: ['apply'] }
  };

  // ---- 기본 계정(부여형 아이디/PW, 데모) : 산학협력단 1 + 심의위원 7슬롯 + 담당자 + 관리자 ----
  function seedAccounts() {
    var acc = {};
    function add(id, pw, role, name) { acc[id] = { pw: hash(pw), role: role, name: name || '' }; }
    add('admin', 'admin1234', 'admin', '종합관리자');
    add('staff', 'staff1234', 'staff', '지주 담당자');
    add('tlo',   'tlo1234',   'tlo',   '산학협력단 기술이전팀'); // 공유 ID 1개
    for (var i = 1; i <= 7; i++) add('ic' + i, 'ic' + i + '1234', 'ic', ''); // 위원 7슬롯(관리자 매핑)
    return acc;
  }

  function freshDB() {
    return {
      v: 6,
      companies: [],                 // 기업 마스터 [{cid,name,ceo,type,bizno,year}]
      leads: [],                     // 발굴 잠재기업 [{leadId,cid?,name,ceo,tel,techName,source,memo,status}]
      applicants: {}, loi: {}, invest: {}, ic: {}, portfolio: {}, // cid 키
      accounts: seedAccounts(),
      icConfig: { quorumPct: 0.5, passPct: 0.5, members: {} }, // 정족수·가결·위원슬롯 매핑(변수)
      benefits: { growth: '', research: '' } // 혜택 콘텐츠(관리자 편집)
    };
  }
  // 서버에서 받은 DB를 정규화(누락 컬렉션 보강)
  function normalize(d) {
    d = d || {};
    Object.keys(COLLS).forEach(function (c) {
      var def = COLLS[c];
      if (def.kind === 'array') { if (!Array.isArray(d[c])) d[c] = []; }
      else if (def.kind === 'map') { if (!d[c] || typeof d[c] !== 'object') d[c] = {}; }
      else { if (!d[c] || typeof d[c] !== 'object') d[c] = (c === 'icConfig' ? { quorumPct: 0.5, passPct: 0.5, members: {} } : { growth: '', research: '' }); }
    });
    if (!d.accounts || !Object.keys(d.accounts).length) d.accounts = seedAccounts();
    d.v = 6; return d;
  }

  // ---- 저장소 ----
  function lsGet(k) { try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (global.localStorage) global.localStorage.setItem(k, v); } catch (e) {} }

  var DB = (function () {
    var raw = lsGet(LS_KEY);
    if (raw) { try { return JSON.parse(raw); } catch (e) {} }
    return freshDB();
  })();
  function save() { lsSet(LS_KEY, JSON.stringify(DB)); }
  // 내부 DB 내용만 in-place 교체(export된 SUB.DB 참조 유지) — 초기화해도 같은 객체
  function resetDB() {
    var f = freshDB();
    Object.keys(DB).forEach(function (k) { delete DB[k]; });
    Object.assign(DB, f);
    save(); return DB;
  }
  // 서버 DB로 내부 내용만 in-place 교체(export된 SUB.DB 참조 유지) — 폴링 중 화면 끊김 없이 갱신
  function assignDB(src) {
    var n = normalize(src);
    Object.keys(DB).forEach(function (k) { delete DB[k]; });
    Object.assign(DB, n);
    lsSet(LS_KEY, JSON.stringify(DB));   // 로컬 캐시만 갱신(브로드캐스트 없이)
    return DB;
  }

  // ---- URL 파라미터(cid·role) ----
  function qparam(name) {
    try {
      var m = (global.location && global.location.search || '').match(new RegExp('[?&]' + name + '=([^&]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) { return ''; }
  }
  var _session = { cid: '', role: '', id: '', name: '', scope: null };
  // ---- 세션 영속화(페이지 이동 간 인증 유지). sessionStorage 우선(탭 종료 시 만료). ----
  var SS_KEY = 'SUB_SESSION_v6';
  function _store() { try { return global.sessionStorage || global.localStorage || null; } catch (e) { return null; } }
  function saveSession() { var s = _store(); if (s) try { s.setItem(SS_KEY, JSON.stringify(_session)); } catch (e) {} }
  function loadSession() { var s = _store(); if (!s) return null; try { return JSON.parse(s.getItem(SS_KEY)); } catch (e) { return null; } }
  function clearSession() { var s = _store(); if (s) try { s.removeItem(SS_KEY); } catch (e) {} }

  function getCID() { return _session.cid || qparam('cid'); }
  function setCID(cid) { _session.cid = cid || ''; saveSession(); }
  function getRole() {
    if (_session.role) return _session.role;
    var s = loadSession(); if (s && s.role) { _session = s; return s.role; }
    // 라이브(서버)모드: ?role= 무시(위조 방지) → 반드시 로그인. 로컬/데모: 편의상 ?role= 또는 admin.
    if (serverOn()) return '';
    var r = qparam('role'); return ROLES[r] ? r : 'admin';
  }
  function setRole(r) { if (ROLES[r]) { _session.role = r; saveSession(); } }
  function logout() { _session = { cid: '', role: '', id: '', name: '', scope: null }; clearSession(); }
  function session() {
    if (!_session.role) { var s = loadSession(); if (s) _session = s; }
    return _session;
  }

  // ---- 인증 ----
  // 로컬/데모: DB.accounts 동기 검증(테스트·오프라인). 라이브: loginAsync(서버검증).
  function login(id, pw) {
    var a = DB.accounts[id];
    if (!a || a.pw !== hash(pw)) return { ok: false, msg: '아이디 또는 비밀번호가 올바르지 않습니다.' };
    if (a.disabled) return { ok: false, msg: '비활성화된 계정입니다.' };
    if (a.expireAt && nowISO() > a.expireAt) return { ok: false, msg: '만료된 계정입니다.' };
    _session.role = a.role; _session.id = id; _session.name = a.name || ''; _session.scope = a.scope || null; saveSession();
    return { ok: true, role: a.role, name: a.name, id: id, scope: a.scope || null };
  }
  // 서버검증 로그인(라이브). 서버 미설정 시 동기 login 결과를 Promise로 래핑.
  function loginAsync(id, pw) {
    if (!serverOn()) return Promise.resolve(login(id, pw));
    return post('login', { id: id, pw: hash(pw) }).then(function (res) {
      if (res && res.ok) {
        _session.role = res.role; _session.id = id; _session.name = res.name || ''; _session.scope = res.scope || null; saveSession();
        return { ok: true, role: res.role, name: res.name, id: id, scope: res.scope || null };
      }
      return { ok: false, msg: (res && res.msg) || '아이디 또는 비밀번호가 올바르지 않습니다.' };
    });
  }

  // ---- 기업 마스터/디렉터리 ----
  function directory() { return DB.companies.map(function (c) { return { name: c.name, ceo: c.ceo }; }); }
  function company() {
    var cid = getCID(); if (!cid) return null;
    for (var i = 0; i < DB.companies.length; i++) if (DB.companies[i].cid === cid) return DB.companies[i];
    return null;
  }
  function selectDirectoryCompany(name) {
    for (var i = 0; i < DB.companies.length; i++) {
      if (DB.companies[i].name === name) { setCID(DB.companies[i].cid); return DB.companies[i].cid; }
    }
    return '';
  }
  function upsertCompany(c) {
    // 중복가드: cid 기준 upsert (다년 시드 = 같은 cid에 누적). 서버모드면 자동 동기화.
    var merged = null;
    for (var i = 0; i < DB.companies.length; i++) {
      if (DB.companies[i].cid === c.cid) { merged = Object.assign(DB.companies[i], c); break; }
    }
    if (!merged) { merged = c; DB.companies.push(c); }
    save(); refresh(); if (serverOn()) serverSet('companies', merged.cid, merged);
    return merged;
  }
  function saveCompany() { /* 관리자 신규기업 버튼 자리(콘솔에서 구현) */ }

  // ---- 백업/복원 ----
  function exportJSON() {
    try {
      var blob = new global.Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
      var a = global.document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = '자회사설립_백업.json'; a.click();
    } catch (e) {}
  }
  function importJSON(file) {
    var fr = new global.FileReader();
    fr.onload = function () { try { DB = JSON.parse(fr.result); save(); global.location.reload(); } catch (e) { alert('복원 실패'); } };
    fr.readAsText(file);
  }

  /* ---- IC(투자심의위원회) 의결 집계 ----
     members: [{assigned, present, recused, vote:'for'|'conditional'|'against'|'abstain', score:0~100}]
     config:  { quorumPct, passPct }
     - 제척(recused)은 재적·출석에서 제외
     - 정족수: 출석 >= ceil(재적 × quorumPct)
     - 가결: 찬성(찬성+조건부) >= floor(출석 × passPct)+1  ("과반" 등 초과 기준)
     - 조건부찬성 포함 가결 시 '조건부가결'                                   */
  function tallyIC(members, config) {
    var cfg = config || DB.icConfig || { quorumPct: 0.5, passPct: 0.5 };
    var assigned = members.filter(function (m) { return m.assigned; });
    var recused = assigned.filter(function (m) { return m.recused; }).length;
    var registered = assigned.length - recused;
    var voters = assigned.filter(function (m) { return !m.recused && m.present; });
    var present = voters.length;
    function cnt(v) { return voters.filter(function (m) { return m.vote === v; }).length; }
    var forC = cnt('for'), conditionalC = cnt('conditional'), againstC = cnt('against'), abstainC = cnt('abstain');
    var approve = forC + conditionalC;
    var quorumNeed = Math.ceil(registered * cfg.quorumPct);
    var quorumMet = present > 0 && present >= quorumNeed;
    var threshold = Math.floor(present * cfg.passPct) + 1;
    var passed = quorumMet && approve >= threshold;
    var result = !quorumMet ? '의결 불성립(정족수 미달)'
      : (passed ? (conditionalC > 0 ? '조건부가결' : '가결') : '부결');
    var scores = voters.map(function (m) { return Number(m.score) || 0; });
    var avgScore = scores.length ? scores.reduce(function (a, b) { return a + b; }, 0) / scores.length : 0;
    return {
      registered: registered, recused: recused, present: present,
      forC: forC, conditionalC: conditionalC, againstC: againstC, abstainC: abstainC,
      approve: approve, quorumNeed: quorumNeed, quorumMet: quorumMet,
      threshold: threshold, passed: passed, result: result, avgScore: avgScore
    };
  }

  function serverOn() { return !!CFG.apiUrl; }
  // apiUrl이 새로 설정되면 서버 로드 + 폴링 시작(페이지의 명시적 config 로드 경로 대응)
  function setConfig(c) {
    if (!c) return;
    var was = CFG.apiUrl; CFG = Object.assign(CFG, c);
    if (!was && CFG.apiUrl) { try { serverLoad(); startPoll(); } catch (e) {} }
  }

  /* ---- 포트폴리오 자산평가 (확정: 취득원가 + 순자산가치 병기 + 손상검토) ----
     cost=취득원가(출자금), equity=자회사 자본총계, pct=지주 지분율
     - nav(순자산가치)=equity×pct  - 손상=nav<cost - 장부(보수)=손상 시 nav로 감액      */
  function evalAsset(cost, equity, pct) {
    cost = Number(cost) || 0; equity = Number(equity) || 0; pct = Number(pct) || 0;
    var nav = equity * pct;
    var impaired = (equity > 0) && (nav < cost);
    var carrying = impaired ? nav : cost;
    return { cost: cost, nav: nav, impaired: impaired, carrying: carrying, gap: nav - cost, pct: pct };
  }
  /* ---- 컨설팅 자동초안(설립계획·성장전략·EXIT 3시나리오) ----
     오프라인 규칙기반 초안 → 컨설턴트 보완. (서버/멀티에이전트 연결 시 대체 가능)   */
  function buildConsultDraft(ctx) {
    ctx = ctx || {};
    var co = ctx.company || {}, ap = ctx.applicant || {}, loi = ctx.loi || {}, inv = ctx.invest || {};
    var FL = { professor: '교원 창업', student: '학생 창업', general: '일반 개인 창업', external: '외부 기업' };
    var w = function (n) { return (Math.round(Number(n) || 0)).toLocaleString('ko-KR') + '원'; };
    var invAmt = inv.investment || 0;
    var pct = ((inv.actualPct || inv.equityPct || 0.1) * 100).toFixed(1);
    var stock = inv.stockType === 'common' ? '보통주' : '우선주(CPS)';
    var plan = [
      '【설립계획 요약】',
      '· 기업: ' + (co.name || '') + ' (대표 ' + (ap.ceo || '') + ', ' + (FL[ap.founderType] || '') + ')',
      '· 사업화 기술: ' + (loi.techName || ap.techName || '') + (loi.researcher ? (' / 연구자 ' + loi.researcher) : ''),
      '· 출자: 자본금×2 밸류 · 지분 ' + pct + '% · ' + stock + ' · 투자금 ' + w(invAmt),
      '',
      '【성장전략(초안)】',
      '· 1년차: 기술이전 완료·시제품/PoC·초기 매출 확보 (KPI: 매출·계약·고용)',
      '· 2~3년차: 제품 고도화·시장확대·후속투자(Pre-A/A) 유치 (KPI: 매출성장률·재구매)',
      '· 마일스톤: 기술이전 → 인증/인허가 → 레퍼런스 확보 → 후속라운드',
      '※ 컨설턴트가 기업 실데이터로 보완 요망. 외부 전문기업·멘토 자료는 첨부로 보강.'
    ].join('\n');
    var scenarios = {
      ipo: { amount: Math.round(invAmt * 10), year: 7 },   // 목표 MOIC 10x
      ma:  { amount: Math.round(invAmt * 5),  year: 5 },   // 5x
      buy: { amount: Math.round(invAmt * 2),  year: 10 }   // 바이백 2x
    };
    return { plan: plan, scenarios: scenarios };
  }

  // 해당 연도 미제출 분기 [1..4] - 제출분
  function missingQuarters(reports, year) {
    var done = {};
    (reports || []).forEach(function (r) { if (Number(r.year) === Number(year)) done[Number(r.quarter)] = true; });
    var miss = []; for (var q = 1; q <= 4; q++) if (!done[q]) miss.push(q);
    return miss;
  }

  // 사전 미팅 예약 시스템(기존)
  var MEETING_URL = 'https://cbnuholdings.github.io/meeting-booking/';

  /* ---- LAGMP(성장관리 플랫폼) 인계 — 같은 cid 공유 ----
     설립 완료 자회사를 동일 cid·기업명으로 LAGMP에 넘겨 비재무 성장지원(멘토링·IR·성장지수) 연계.
     발굴→설립→성장 라이프사이클을 끊김 없이 연결.                                    */
  var LAGMP_URL = 'https://cbnuholdings.github.io/growth-platform/dashboard.html';
  function handoffToLAGMP(cid) {
    var co = null; for (var i = 0; i < DB.companies.length; i++) if (DB.companies[i].cid === cid) co = DB.companies[i];
    if (!co) return { ok: false, error: 'no-company' };
    if (['설립', '관리', '심의가결'].indexOf(co.stage) < 0) return { ok: false, error: 'not-established' };
    upsertCompany({ cid: cid, lagmpHandoff: true, lagmpAt: nowISO() });
    save();
    var url = LAGMP_URL + '?cid=' + encodeURIComponent(cid) + '&name=' + encodeURIComponent(co.name || '');
    return { ok: true, url: url };
  }
  function requestMeeting(cid) {
    if (!cid) return { ok: false };
    upsertCompany({ cid: cid, meetingRequested: true, meetingAt: nowISO() });
    save();
    return { ok: true, url: MEETING_URL };
  }
  function nowISO() { return new Date().toISOString(); }

  /* ---- Express 패스트트랙 승인(담당자 확인 후) ----
     기술이전계약+투자동의+필수서류 완비 신청을 담당자가 확인 후 승인하면:
     LOI(계약체결·산학협력단 동의)·출자 텀시트를 신청 스냅샷으로 자동 prefill →
     LOI·출자협의 생략하고 단계=심의(IC)로 점프. ★IC 심의는 반드시 거침.            */
  function approveExpress(cid) {
    var ap = DB.applicants[cid];
    if (!ap) return { ok: false, error: 'no-applicant' };
    if (!ap.express) return { ok: false, error: 'not-express' };
    var now = nowISO(), iv = ap.invest || {};
    // LOI 자동(기술이전계약 체결분)
    DB.loi[cid] = {
      cid: cid, updatedAt: now, techName: ap.techName || '', researcher: '', field: ap.field || '',
      scope: '(Express) 기술이전계약 체결분 — 첨부 계약서 기준', status: '계약체결',
      tloTeam: '충북대학교 산학협력단 기술이전팀', tloConsent: true, tloAt: now,
      tloMemo: 'Express: 기술이전계약서 첨부·검토 완료', express: true
    };
    // 출자 텀시트 자동(신청 밸류 기준)
    var exit = (global.INVEST && global.INVEST.defaultExitTerms) ? global.INVEST.defaultExitTerms()
      : { dragAlong: true, rofr: true, tagAlong: true, buyback: { enabled: true, minYears: 7, extensions: 3, maxYears: 10, buyer: 'founder' } };
    var r = (global.INVEST && global.INVEST.compute) ? global.INVEST.compute(
      { capital: iv.capital, par: iv.par, equityPct: iv.equityPct, founderType: ap.founderType }) : null;
    DB.invest[cid] = r ? {
      cid: cid, savedAt: now, capital: r.input.capital, par: r.input.par, equityPct: r.input.equityPct,
      stockType: r.stockType, issuePrice: r.issuePrice, newShares: r.newShares, investment: r.investment,
      preMoneyValue: r.preMoneyValue, postMoney: r.postMoney, actualPct: r.actualPct, cps: r.cps, exit: exit, express: true
    } : { cid: cid, savedAt: now, capital: iv.capital, par: iv.par, equityPct: iv.equityPct,
          stockType: iv.stockType, investment: iv.investment, newShares: iv.newShares, postMoney: iv.postMoney, exit: exit, express: true };
    upsertCompany({ cid: cid, stage: '심의', express: true, expressApprovedAt: now });
    save(); refresh();
    if (serverOn()) { serverSet('loi', cid, DB.loi[cid]); serverSet('invest', cid, DB.invest[cid]); }
    return { ok: true, stage: '심의' };
  }

  /* =====================================================================
     서버 데이터 계층 (GAS) — LAGMP 2단계 어댑터 이식 (v6 전체공개·서버화)
     - apiUrl 빈값=로컬(localStorage 전용). URL=서버(구글시트 1차 + 노션 미러).
     - 쓰기: 로컬 즉시 반영(낙관적) → 서버 레코드별 set/del → 서버는 최신 내부DB 반환→동기화.
     - 읽기: serverLoad(GET ?action=load), 페이지 활성 시 25초 폴링(동시접속 반영).
     - CORS 회피: text/plain 전송(프리플라이트 미발생).
     - 응답 DB는 assignDB로 in-place 교체(export SUB.DB 참조 유지).               */
  function post(action, data) {
    if (!serverOn()) return Promise.resolve({ ok: true, local: true });
    if (typeof global.fetch !== 'function') return Promise.resolve({ ok: false, error: 'no-fetch' });
    return global.fetch(CFG.apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, data: data })
    }).then(function (r) { return r.json(); })
      .catch(function (e) { return { ok: false, error: String(e) }; });
  }
  // 서버 응답에 내부DB(db)가 동봉되면 로컬에 반영
  function applyServerDB(res) {
    if (res && res.db && typeof res.db === 'object') { assignDB(res.db); refresh(); }
    return res;
  }
  // 전체 내부DB 로드(인증 내부 사용자용). 토큰 동봉(Phase B 인가 스코프).
  function serverLoad() {
    if (!serverOn() || typeof global.fetch !== 'function') return Promise.resolve({ ok: true, local: true });
    var url = CFG.apiUrl + '?action=load' + (_session.id ? ('&uid=' + encodeURIComponent(_session.id)) : '');
    return global.fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.db) { assignDB(j.db); refresh(); } else if (j && j.companies) { assignDB(j); refresh(); } return j; })
      .catch(function (e) { return { ok: false, error: String(e) }; });
  }
  // 신청 접수(공개) — 서버는 최소응답(전체DB 미반환, 신청자 PII 보호)
  function submitApplication(rec) { return post('apply', rec); }
  // 레코드별 서버 반영
  function serverSet(coll, key, record) { return post('set', { coll: coll, key: key, record: record }).then(applyServerDB); }
  function serverDel(coll, key) { return post('del', { coll: coll, key: key }).then(applyServerDB); }
  // 하위호환: serverUpsert(coll, key, rec)
  function serverUpsert(coll, key, rec) { return serverSet(coll, key, rec); }

  /* ---- 커밋(로컬 즉시 + 서버 push) — 페이지는 이 API로 쓰면 자동 동기화 ---- */
  function localSet(coll, key, rec) {
    var def = COLLS[coll];
    if (!def) return;
    if (def.kind === 'array') {
      var k = def.key, arr = DB[coll] || (DB[coll] = []), i;
      for (i = 0; i < arr.length; i++) if (arr[i][k] === rec[k]) { arr[i] = Object.assign(arr[i], rec); return arr[i]; }
      arr.push(rec); return rec;
    } else if (def.kind === 'map') {
      (DB[coll] || (DB[coll] = {}))[key] = rec; return rec;
    } else { DB[coll] = rec; return rec; }
  }
  function localDel(coll, key) {
    var def = COLLS[coll]; if (!def) return;
    if (def.kind === 'array') { DB[coll] = (DB[coll] || []).filter(function (x) { return x[def.key] !== key; }); }
    else if (def.kind === 'map') { delete (DB[coll] || {})[key]; }
  }
  function commit(coll, key, rec) { localSet(coll, key, rec); save(); refresh(); if (serverOn()) serverSet(coll, key, rec); return rec; }
  function commitDel(coll, key) { localDel(coll, key); save(); refresh(); if (serverOn()) serverDel(coll, key); }
  function commitSingle(coll, value) { DB[coll] = value; save(); refresh(); if (serverOn()) serverSet(coll, '_', value); return value; }

  /* ---- 활성 시 폴링(동시접속 반영) + 페이지 간 동기화 ---- */
  var _pollTimer = null;
  function pollTick() {
    try { if (global.document && global.document.hidden) return; } catch (e) {}
    serverLoad();
  }
  function startPoll() {
    if (_pollTimer || typeof global.setInterval !== 'function') return;
    _pollTimer = global.setInterval(pollTick, 25000);
  }
  function refresh() { try { if (typeof global.refresh === 'function') global.refresh(); } catch (e) {} }
  // 같은 브라우저 탭 간 동기화
  var _bc = null;
  try { _bc = new global.BroadcastChannel('sub_v6'); _bc.onmessage = function () { reloadLocal(); refresh(); }; } catch (e) {}
  function reloadLocal() { var raw = lsGet(LS_KEY); if (raw) { try { assignDB(JSON.parse(raw)); } catch (e) {} } }
  try { if (global.addEventListener) global.addEventListener('storage', function (e) { if (e.key === LS_KEY) { reloadLocal(); refresh(); } }); } catch (e) {}

  // config.json 경로 — app.js 스크립트 위치 기준으로 산출(페이지가 하위폴더든 루트든 견고).
  function configURL() {
    try {
      var sc = global.document && (global.document.currentScript ||
        (function () { var ss = global.document.getElementsByTagName('script'); for (var i = ss.length - 1; i >= 0; i--) if (/app\.js(\?|$)/.test(ss[i].src)) return ss[i]; return null; })());
      if (sc && sc.src) return sc.src.replace(/[^/]*$/, '') + 'config.json';   // .../common/app.js → .../common/config.json
    } catch (e) {}
    return 'common/config.json';
  }
  // config.json 자동 로드 → 서버모드 자동 활성화
  function initServer() {
    if (typeof global.fetch !== 'function') return;
    if (CFG.apiUrl) { serverLoad(); startPoll(); return; }
    global.fetch(configURL(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (cfg) {
      if (cfg && cfg.apiUrl) { CFG.apiUrl = cfg.apiUrl; serverLoad(); startPoll(); refresh(); }
      if (cfg && cfg.org) CFG.org = cfg.org;
    }).catch(function () { /* file:// 차단/없음 → 로컬모드 유지 */ });
  }
  initServer();

  return {
    CFG: CFG, setConfig: setConfig, DB: DB, save: save, resetDB: resetDB, assignDB: assignDB, normalize: normalize,
    hash: hash, esc: esc, digits: digits,
    makeCID: makeCID, makeAppId: makeAppId,
    ROLES: ROLES, getCID: getCID, setCID: setCID, getRole: getRole, setRole: setRole,
    login: login, loginAsync: loginAsync, logout: logout, session: session,
    directory: directory, company: company, selectDirectoryCompany: selectDirectoryCompany,
    upsertCompany: upsertCompany, saveCompany: saveCompany,
    exportJSON: exportJSON, importJSON: importJSON, serverOn: serverOn,
    tallyIC: tallyIC, post: post, submitApplication: submitApplication,
    serverLoad: serverLoad, serverSet: serverSet, serverDel: serverDel, serverUpsert: serverUpsert,
    commit: commit, commitDel: commitDel, commitSingle: commitSingle, startPoll: startPoll,
    MEETING_URL: MEETING_URL, requestMeeting: requestMeeting, approveExpress: approveExpress,
    evalAsset: evalAsset, missingQuarters: missingQuarters, buildConsultDraft: buildConsultDraft,
    LAGMP_URL: LAGMP_URL, handoffToLAGMP: handoffToLAGMP
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

if (typeof module !== 'undefined' && module.exports) module.exports = SUB;
