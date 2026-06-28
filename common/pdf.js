/* =========================================================================
   자회사 설립 통합관리 — 보고서/의결서 PDF (pdf.js)  전역: SUBPDF
   - buildReportHTML(kind, ctx) : 순수 HTML 빌더(섹션=.pdf-page), node 테스트 가능
   - renderToPDF(container, filename) : html2canvas+jsPDF 직접제어(섹션마다 새 페이지)
     ★ html2pdf 미사용(page-break 무효 회피), 캡처폭 794 고정, 한글=캔버스 렌더(폰트 임베드 불필요)
   ========================================================================= */
(function (global) {
  'use strict';
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];}); }
  function won(n){ return (Math.round(Number(n)||0)).toLocaleString('ko-KR')+'원'; }
  var VOTE={for:'찬성',conditional:'조건부',against:'반대',abstain:'기권'};

  var HEAD = '<div class="pdf-head"><div class="org">충북대학교기술지주㈜</div>';
  var STYLE =
    '<style>'+
    '.pdf-page{width:794px;box-sizing:border-box;padding:48px 54px;background:#fff;color:#222;'+
    'font-family:"Malgun Gothic","맑은 고딕",sans-serif;font-size:13px;line-height:1.7;}'+
    '.pdf-head{border-bottom:3px solid #b01c50;padding-bottom:10px;margin-bottom:18px;}'+
    '.pdf-head .org{color:#b01c50;font-weight:800;font-size:14px;}'+
    '.pdf-head .ttl{font-size:22px;font-weight:800;margin-top:6px;}'+
    '.pdf-head .meta{font-size:11px;color:#888;margin-top:4px;}'+
    '.pdf h3{color:#8a163f;font-size:14px;border-left:4px solid #b01c50;padding-left:8px;margin:18px 0 8px;}'+
    '.pdf table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px;}'+
    '.pdf th,.pdf td{border:1px solid #e2d3d8;padding:6px 8px;}'+
    '.pdf th{background:#fbf1f4;color:#8a163f;text-align:left;}'+
    '.verdict{font-size:24px;font-weight:800;padding:10px 0;}'+
    '.v-ok{color:#1f8a4c;}.v-cond{color:#c47f0a;}.v-bad{color:#c0392b;}.v-non{color:#777;}'+
    '.pill{display:inline-block;font-size:11px;padding:2px 9px;border-radius:12px;background:#f3e3e9;color:#8a163f;margin:2px 4px 0 0;}'+
    '</style>';

  function decisionHTML(ctx){
    var co=ctx.company||{}, ic=ctx.ic||{}, t=(ic.tally)||{}, loi=ctx.loi||{};
    var cls = !t.quorumMet?'v-non':(t.result==='가결'?'v-ok':(t.result==='조건부가결'?'v-cond':'v-bad'));
    var rows=(ic.members||[]).filter(function(m){return m.assigned;}).map(function(m){
      return '<tr><td>'+esc(m.id)+'</td><td>'+esc(m.name||'')+'</td><td>'+(m.recused?'제척':(m.present?'출석':'불참'))+
        '</td><td>'+(m.recused?'-':(VOTE[m.vote]||''))+'</td><td>'+(m.recused?'-':(m.score||0))+'</td></tr>'; }).join('');
    return '<section class="pdf-page pdf">'+HEAD+
      '<div class="ttl">투자심의위원회 의결서</div>'+
      '<div class="meta">의결일 '+esc(ctx.dateStr||'')+' · 문서 cid '+esc(co.cid||'')+'</div></div>'+
      '<h3>1. 심의 대상</h3><table>'+
      '<tr><th>기업명</th><td>'+esc(co.name||'')+'</td><th>대표자</th><td>'+esc(ctx.ceo||'')+'</td></tr>'+
      '<tr><th>대상기술</th><td colspan="3">'+esc((loi.techName)||'')+(loi.researcher?(' (연구자 '+esc(loi.researcher)+')'):'')+'</td></tr></table>'+
      '<h3>2. 의결 결과</h3><div class="verdict '+cls+'">'+esc(t.result||'-')+'</div>'+
      '<table><tr><th>재적</th><td>'+(t.registered||0)+'명(제척 '+(t.recused||0)+')</td><th>출석</th><td>'+(t.present||0)+'명(정족수 '+(t.quorumNeed||0)+')</td></tr>'+
      '<tr><th>찬성/조건부</th><td>'+(t.forC||0)+' / '+(t.conditionalC||0)+'</td><th>반대/기권</th><td>'+(t.againstC||0)+' / '+(t.abstainC||0)+'</td></tr>'+
      '<tr><th>가결 기준선</th><td>'+(t.threshold||0)+'표</td><th>평균 점수</th><td>'+(Number(t.avgScore)||0).toFixed(1)+'점</td></tr></table>'+
      '<h3>3. 출석부 및 표결</h3><table><tr><th>슬롯</th><th>위원</th><th>출결</th><th>의결</th><th>점수</th></tr>'+(rows||'<tr><td colspan="5">기록 없음</td></tr>')+'</table>'+
      '<p style="margin-top:24px;font-size:11px;color:#888">본 의결서는 자회사 설립 통합관리 시스템에서 자동 생성되었습니다.</p>'+
      '</section>';
  }

  function reviewHTML(ctx){
    var co=ctx.company||{}, ap=ctx.applicant||{}, inv=ctx.invest||{}, ic=ctx.ic||{};
    var x=inv.exit||{}, dev=[]; if(x.dragAlong)dev.push('동반매도청구권'); if(x.rofr)dev.push('우선매수권'); if(x.tagAlong)dev.push('공동매도권');
    if(x.buyback&&x.buyback.enabled)dev.push('바이백('+x.buyback.minYears+'~'+x.buyback.maxYears+'년)');
    var scn=ic.scenarios||{}; var SK={ipo:'IPO',ma:'M&A',buy:'바이백'};
    var srows=Object.keys(SK).map(function(k){ var s=scn[k]||{}; return '<tr><td>'+SK[k]+'</td><td>'+won(s.amount||0)+'</td><td>'+(s.year||'-')+'년</td><td>'+(Number(s.moic)||0).toFixed(2)+'배</td></tr>'; }).join('');
    // page1: 개요+투자
    var p1='<section class="pdf-page pdf">'+HEAD+'<div class="ttl">자회사 설립 투자심의 자료</div>'+
      '<div class="meta">작성일 '+esc(ctx.dateStr||'')+' · cid '+esc(co.cid||'')+'</div></div>'+
      '<h3>1. 기업 개요</h3><table>'+
      '<tr><th>기업명</th><td>'+esc(co.name||'')+'</td><th>대표자</th><td>'+esc(ap.ceo||ctx.ceo||'')+'</td></tr>'+
      '<tr><th>창업유형</th><td>'+esc((inv.stockType==='common')?'교원(보통주)':'학생·일반·외부(우선주 CPS)')+'</td><th>적격성</th><td>'+esc(ap.eligibility||'-')+'</td></tr>'+
      '<tr><th>대상기술</th><td colspan="3">'+esc((ctx.loi&&ctx.loi.techName)||ap.techName||'')+'</td></tr></table>'+
      '<h3>2. 자회사 설립 투자(텀시트)</h3><table>'+
      '<tr><th>주식 종류</th><td>'+esc(inv.stockType==='cps'?'우선주(CPS)':'보통주')+'</td><th>투자전 밸류(2배)</th><td>'+won(inv.preMoneyValue)+'</td></tr>'+
      '<tr><th>투자금</th><td>'+won(inv.investment)+'</td><th>지분율</th><td>'+(((inv.actualPct||0)*100).toFixed(2))+'%</td></tr>'+
      (inv.cps?('<tr><th>우선주 조건</th><td colspan="3">'+esc(inv.cps.desc)+'</td></tr>'):'')+
      '<tr><th>EXIT 장치</th><td colspan="3">'+dev.map(function(d){return '<span class="pill">'+esc(d)+'</span>';}).join('')+'</td></tr></table></section>';
    // page2: 성장전략+EXIT 시나리오
    var p2='<section class="pdf-page pdf">'+HEAD+'<div class="ttl">성장전략 · EXIT 시나리오</div><div class="meta">cid '+esc(co.cid||'')+'</div></div>'+
      '<h3>3. 설립계획·성장전략</h3><div style="white-space:pre-wrap;border:1px solid #e2d3d8;padding:12px;border-radius:6px;min-height:80px">'+esc(ic.plan||'(작성 예정)')+'</div>'+
      '<h3>4. EXIT 3시나리오 (회수배수 MOIC)</h3><table><tr><th>시나리오</th><th>예상 회수금액</th><th>시점</th><th>MOIC</th></tr>'+srows+'</table></section>';
    return p1+p2;
  }

  function buildReportHTML(kind, ctx){
    var body = kind==='decision' ? decisionHTML(ctx) : reviewHTML(ctx);
    return STYLE + body;
  }

  // 브라우저 전용: 섹션마다 새 페이지 PDF
  function renderToPDF(container, filename){
    var g=global;
    if(!g.html2canvas || !(g.jspdf && g.jspdf.jsPDF)){ if(g.alert)g.alert('PDF 라이브러리가 로드되지 않았습니다.'); return Promise.resolve(false); }
    var jsPDF=g.jspdf.jsPDF;
    var pdf=new jsPDF('p','mm','a4');
    var pages=container.querySelectorAll('.pdf-page');
    var A4W=210;
    var chain=Promise.resolve();
    Array.prototype.forEach.call(pages, function(pg, i){
      chain=chain.then(function(){
        return g.html2canvas(pg, {scale:2, width:794, windowWidth:794, backgroundColor:'#ffffff'}).then(function(canvas){
          var img=canvas.toDataURL('image/png');
          var ph=canvas.height*A4W/canvas.width;
          if(i>0) pdf.addPage();
          pdf.addImage(img,'PNG',0,0,A4W,Math.min(ph,297));
        });
      });
    });
    return chain.then(function(){ pdf.save(filename); return true; });
  }

  var SUBPDF={ buildReportHTML:buildReportHTML, renderToPDF:renderToPDF };
  if(typeof module!=='undefined'&&module.exports) module.exports=SUBPDF;
  global.SUBPDF=SUBPDF;
})(typeof window!=='undefined'?window:this);
