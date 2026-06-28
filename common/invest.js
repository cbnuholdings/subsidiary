/* =========================================================================
   자회사 설립 통합관리 — 투자산식 모듈 (invest.js)  [v4 검증 산식 이식]
   - 텀시트 2배 인정 방식: 주당발행가=액면×2, 신주=기존주식×지분율/(1-지분율) 올림
   - 교원=보통주(common) / 학생·일반·외부=우선주 CPS(청산1배·전환1:1·무상환)
   - EXIT 표준장치 Drag-along·ROFR·Tag-along + 바이백(7년+3회연장=최대10년)
   - 회귀 검증: ㈜비앤비(보통주) / ㈜이듬(우선주)
   ========================================================================= */
(function (global) {
  'use strict';

  // 창업유형 → 주식종류 (교원만 보통주, 그 외 전부 CPS)
  function stockTypeOf(founderType) {
    return founderType === 'professor' ? 'common' : 'cps';
  }
  var STOCK_LABEL = { common: '보통주', cps: '우선주(CPS)' };
  var FOUNDER_LABEL = {
    professor: '교원 창업', student: '학생 창업',
    general: '일반 개인 창업', external: '외부 기업'
  };

  // CPS 표준 조건 (확정: 청산우선권 1배·전환비율 1:1·무상환·우선배당 연1%)
  function cpsTerms() {
    return { liqPref: 1, convRatio: 1, redeemable: false, divPref: 0.01,
             desc: '청산우선권 1배 · 전환비율 1:1 · 무상환 · 우선배당 연 1%' };
  }

  // EXIT 표준 장치 기본값 (투자단계 개별 가감)
  function defaultExitTerms() {
    return {
      dragAlong: true,   // 동반매도청구권
      rofr: true,        // 우선매수권
      tagAlong: true,    // 공동매도권
      buyback: {         // 바이백(풋옵션)
        enabled: true, minYears: 7, extensions: 3, maxYears: 10,
        buyer: 'founder', // 'founder'(창업자/이해관계인) | 'company'(회사)
        desc: '최소 7년 + 협의 3회 연장(최대 10년), 미회수 시 약정가로 매수'
      }
    };
  }

  /* 핵심 산식
     입력: capital(자본금), par(액면가), equityPct(지분율 0~1), founderType
     - existingShares = round(capital/par)
     - issuePrice     = par × 2
     - newShares      = ceil(existingShares × equityPct/(1-equityPct))
     - investment     = newShares × issuePrice
     - preMoneyBook   = capital            (장부 자본금)
     - preMoneyValue  = capital × 2        (2배 밸류 = existingShares×issuePrice)
     - postMoney      = (existing+new) × issuePrice
     - actualPct      = new/(existing+new) (올림으로 10% 소폭 상회)            */
  function compute(input) {
    var capital = Number(input.capital) || 0;
    var par = Number(input.par) || 0;
    var equityPct = Number(input.equityPct);
    if (!(equityPct > 0 && equityPct < 1)) equityPct = 0.10; // 기본 10%
    var founderType = input.founderType || 'external';

    var existingShares = par > 0 ? Math.round(capital / par) : 0;
    var issuePrice = par * 2;
    // 부동소수점 오차 보정: 정수 경계(예: 정확히 500.0)가 501로 올림되지 않도록 epsilon 차감
    var rawNew = existingShares * (equityPct / (1 - equityPct));
    var newShares = Math.ceil(rawNew - 1e-9);
    var investment = newShares * issuePrice;
    var preMoneyBook = capital;
    var preMoneyValue = capital * 2;
    var postMoney = (existingShares + newShares) * issuePrice;
    var actualPct = (existingShares + newShares) > 0
      ? newShares / (existingShares + newShares) : 0;
    var stockType = stockTypeOf(founderType);

    return {
      input: { capital: capital, par: par, equityPct: equityPct, founderType: founderType },
      founderLabel: FOUNDER_LABEL[founderType] || founderType,
      stockType: stockType,
      stockLabel: STOCK_LABEL[stockType],
      cps: stockType === 'cps' ? cpsTerms() : null,
      existingShares: existingShares,
      issuePrice: issuePrice,
      newShares: newShares,
      investment: investment,
      preMoneyBook: preMoneyBook,
      preMoneyValue: preMoneyValue,
      postMoney: postMoney,
      actualPct: actualPct,
      exit: defaultExitTerms()
    };
  }

  // EXIT 시나리오용 회수배수(MOIC) 간이 계산
  function moic(investment, exitProceeds) {
    return investment > 0 ? exitProceeds / investment : 0;
  }

  var INVEST = {
    compute: compute, stockTypeOf: stockTypeOf, cpsTerms: cpsTerms,
    defaultExitTerms: defaultExitTerms, moic: moic,
    STOCK_LABEL: STOCK_LABEL, FOUNDER_LABEL: FOUNDER_LABEL
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = INVEST;
  global.INVEST = INVEST;
})(typeof window !== 'undefined' ? window : this);
