/* ══════════════════════════════════════════════════════════════════════════
   HealthMerge — aba "Corrida"
   ──────────────────────────────────────────────────────────────────────────
   Módulo autocontido: injeta o próprio botão de navegação, a própria seção
   e os próprios estilos. A única alteração necessária no index.html é uma
   linha, logo antes de </body>:

       <script src="plano-corrida.js" defer></script>

   Precisa rodar DEPOIS do script inline (por isso `defer` e a posição no
   fim do body). Não toca em nenhuma variável do script existente — o
   handler de navegação original já esconde `section[id^="tab-"]` e limpa o
   aria-selected de todo `nav button`, então as duas partes convivem sem
   acoplamento.

   Lê `plano_corrida_json` da aba Resumo, escrita pelo PlanoCorrida.gs.
   Fiel à premissa do projeto: aqui não se calcula aderência, só se desenha.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SHEET_ID = '1dpcyeWeC2H-ojPMsl5Mgbi5X5_8X1FGHmY51UxZvGTw';
  var Z2_MIN = 127, Z2_MAX = 146;

  var carregado = false;

  /* ── estilos próprios do módulo ──────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent = [
    ':root{--ch-plano:#8A4FBF}',
    '.pc-barra{height:6px;border-radius:99px;background:#E7EDF3;overflow:hidden;margin-top:7px}',
    '.pc-barra i{display:block;height:100%;border-radius:99px;background:var(--ch-plano)}',
    '.pc-st{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.06em;',
    '  text-transform:uppercase;padding:3px 7px;border-radius:5px;background:#EEF2F6;color:var(--ink-2)}',
    '.pc-st.ok{background:#EDF7F3;color:var(--ch-ativ)}',
    '.pc-st.abaixo{background:#FFF6E8;color:var(--ch-pa)}',
    '.pc-st.acima{background:#FDEFF2;color:var(--ch-fc)}',
    '.pc-st.curso{background:#F2EDFA;color:var(--ch-plano)}',
    '.pc-st.futura{background:#F2F5F8;color:var(--ink-3)}',
    '.pc-alerta{font-size:11.5px;color:var(--ch-fc);margin-top:4px}',
    '.pc-linha-futura td{opacity:.5}',
    '.pc-sess{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--ink-3)}'
  ].join('\n');
  document.head.appendChild(css);

  /* ── botão de navegação ──────────────────────────────────────────────── */
  var nav = document.querySelector('nav[role="tablist"]');
  var btn = document.createElement('button');
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-selected', 'false');
  btn.dataset.t = 'corrida';
  btn.textContent = 'Corrida';
  /* antes de "Medicamentos", junto das abas de treino */
  var alvoNav = nav.querySelector('button[data-t="meds"]');
  nav.insertBefore(btn, alvoNav || null);

  /* ── seção ───────────────────────────────────────────────────────────── */
  var sec = document.createElement('section');
  sec.id = 'tab-corrida';
  sec.hidden = true;
  sec.innerHTML = [
    '<div class="grid">',
    '  <div class="card" style="--c:var(--ch-plano)">',
    '    <div class="lab">Semana do plano</div>',
    '    <div class="val" id="pcSem">—<span class="u">/12</span></div>',
    '    <div class="sub" id="pcSemSub">—</div>',
    '  </div>',
    '  <div class="card" style="--c:var(--ch-plano)">',
    '    <div class="lab">Alvo da semana</div>',
    '    <div class="val" id="pcAlvo">—<span class="u">min</span></div>',
    '    <div class="sub" id="pcAlvoSub">—</div>',
    '  </div>',
    '  <div class="card" style="--c:var(--ch-ativ)">',
    '    <div class="lab">Realizado</div>',
    '    <div class="val" id="pcFeito">—<span class="u">min</span></div>',
    '    <div class="sub" id="pcFeitoSub">—</div>',
    '    <div class="pc-barra"><i id="pcBarra" style="width:0"></i></div>',
    '  </div>',
    '  <div class="card" style="--c:var(--ch-fc)">',
    '    <div class="lab">FC média · Z2</div>',
    '    <div class="val" id="pcFc">—<span class="u">bpm</span></div>',
    '    <div class="sub" id="pcFcSub">alvo ' + Z2_MIN + '–' + Z2_MAX + ' bpm</div>',
    '  </div>',
    '</div>',
    '<div class="note" id="pcNota" hidden></div>',
    '<div class="panel">',
    '  <h2>Plano de 12 semanas <span class="n" id="pcN"></span></h2>',
    '  <div id="pcBox"><div class="empty">carregando…</div></div>',
    '</div>'
  ].join('\n');

  var secMeds = document.getElementById('tab-meds');
  secMeds.parentNode.insertBefore(sec, secMeds);

  /* ── navegação ───────────────────────────────────────────────────────── */
  btn.addEventListener('click', function () {
    document.querySelectorAll('nav button').forEach(function (x) {
      x.setAttribute('aria-selected', x === btn ? 'true' : 'false');
    });
    document.querySelectorAll('section[id^="tab-"]').forEach(function (s) { s.hidden = true; });
    sec.hidden = false;
    carregarPlano();
  });

  /* ── dados ───────────────────────────────────────────────────────────── */
  async function carregarPlano() {
    if (carregado) return;
    // headers=1 força o gviz a tratar a linha 1 como cabeçalho. Sem isso,
    // o próprio endpoint do Google confunde onde termina o cabeçalho numa
    // aba Resumo com colunas de tipo muito misto (números e blobs JSON
    // longos) e devolve só as últimas linhas como dado — foi isso que
    // fazia o app inteiro aparecer "sem dados" mesmo com a planilha certa.
    var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID
            + '/gviz/tq?tqx=out:json&sheet=Resumo&headers=1';
    try {
      var txt = await (await fetch(url)).text();
      var m = txt.match(/setResponse\(([\s\S]*)\);?\s*$/);
      if (!m) throw new Error('resposta inesperada da planilha');
      var json = JSON.parse(m[1]);

      var bruto = '';
      for (var i = 0; i < json.table.rows.length; i++) {
        var c = json.table.rows[i].c || [];
        /* mesma armadilha do dashboard: coluna inferida como numérica devolve
           v=null para o JSON longo — o conteúdo real vem em .f */
        var k = c[0] ? (c[0].v != null ? c[0].v : c[0].f) : '';
        if (String(k) !== 'plano_corrida_json') continue;
        bruto = c[1] ? (c[1].v != null ? c[1].v : c[1].f) : '';
        break;
      }

      if (!bruto) {
        throw new Error('a chave plano_corrida_json ainda não existe na aba Resumo. '
                      + 'Rode atualizarPlanoCorrida() no Apps Script.');
      }

      desenhar(JSON.parse(bruto));
      carregado = true;
    } catch (e) {
      document.getElementById('pcBox').innerHTML =
        '<div class="empty"><b>Não foi possível carregar o plano</b>' + e.message + '</div>';
    }
  }

  function desenhar(semanas) {
    var atual = semanas.filter(function (s) { return s.status === 'em curso'; })[0];

    /* Plano encerrado ou ainda não iniciado: mostra a última semana com
       registro, em vez de deixar os cartões vazios. */
    var ref = atual || semanas.filter(function (s) {
      return s.status !== 'futura';
    }).slice(-1)[0] || semanas[0];

    txt('pcSem', ref.semana, '/12');
    sub('pcSemSub', 'bloco ' + ref.bloco + ' · ' + ref.inicio + '–' + ref.fim);

    txt('pcAlvo', ref.alvo_min, 'min');
    sub('pcAlvoSub', ref.sessoes_alvo + ' sessões · ' + (ref.metodo || '—'));

    txt('pcFeito', ref.feito_min, 'min');
    sub('pcFeitoSub', ref.feito_n + (ref.feito_n === 1 ? ' sessão' : ' sessões')
                    + (ref.feito_km ? ' · ' + ref.feito_km.toFixed(1) + ' km' : '')
                    + ' · ' + ref.pct + '% do alvo');
    document.getElementById('pcBarra').style.width = Math.min(ref.pct, 100) + '%';

    txt('pcFc', ref.fc_media || '—', ref.fc_media ? 'bpm' : '');
    var fcSub = 'alvo ' + Z2_MIN + '–' + Z2_MAX + ' bpm';
    if (ref.fc_media > Z2_MAX) {
      fcSub = '<b style="color:var(--ch-fc)">acima de Z2</b> · alvo ' + Z2_MIN + '–' + Z2_MAX;
    } else if (ref.fc_media) {
      fcSub = 'dentro de Z2 · alvo ' + Z2_MIN + '–' + Z2_MAX;
    }
    document.getElementById('pcFcSub').innerHTML = fcSub;

    /* nota: só aparece quando há algo a dizer */
    var alertas = semanas.filter(function (s) { return s.alerta; }).slice(-3);
    var nota = document.getElementById('pcNota');
    if (alertas.length) {
      nota.innerHTML = alertas.map(function (s) {
        return '<b>Semana ' + s.semana + ':</b> ' + s.alerta;
      }).join('<br>');
      nota.hidden = false;
    } else {
      nota.hidden = true;
    }

    var linhas = semanas.map(function (s) {
      var cls = { 'ok': 'ok', 'abaixo': 'abaixo', 'acima': 'acima',
                  'em curso': 'curso', 'futura': 'futura' }[s.status] || '';
      var sessoes = [s.a_min, s.b_min, s.c_min]
        .filter(function (v) { return v > 0; })
        .map(function (v) { return v + '′'; })
        .join(' · ');

      return '<tr' + (s.status === 'futura' ? ' class="pc-linha-futura"' : '') + '>'
        + '<td class="num">' + s.semana + '<span class="pc-sess"> · ' + s.inicio + '</span></td>'
        + '<td class="num">' + s.alvo_min + ' min<div class="pc-sess">' + sessoes + '</div></td>'
        + '<td class="num">' + (s.status === 'futura' ? '—' : s.feito_min + ' min')
        + (s.feito_n ? '<div class="pc-sess">' + s.feito_n + '× · '
                     + s.feito_km.toFixed(1) + ' km</div>' : '') + '</td>'
        + '<td class="num">' + (s.fc_media || '—') + '</td>'
        + '<td><span class="pc-st ' + cls + '">' + s.status + '</span>'
        + (s.alerta ? '<div class="pc-alerta">' + s.alerta + '</div>' : '') + '</td>'
        + '</tr>';
    }).join('');

    document.getElementById('pcBox').innerHTML =
      '<table><thead><tr><th>Sem</th><th>Alvo</th><th>Feito</th>'
      + '<th>FC</th><th>Situação</th></tr></thead><tbody>' + linhas + '</tbody></table>';

    var feitas = semanas.filter(function (s) { return s.status !== 'futura'; }).length;
    document.getElementById('pcN').textContent = feitas + ' de 12';
  }

  function txt(id, v, u) {
    document.getElementById(id).innerHTML = v + (u ? '<span class="u">' + u + '</span>' : '');
  }
  function sub(id, v) { document.getElementById(id).textContent = v; }
})();
