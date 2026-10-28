/* 시작: 저장된 내용 불러오기 → 화면 조립 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const U = App.U;

  function buildPanels() {
    App.UI.resetRefreshers();
    App.Meta.build(U.$('#tab-meta'));
    App.Status.build(U.$('#tab-status'));
    App.Actions.build(U.$('#tab-actions'));
    App.Preview.build(U.$('#tab-preview'));
    App.UI.refreshAll();
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      const restored = App.State.load();
      App.UI.buildTopbar(); App.UI.buildTabs(); buildPanels();
      App.on('rebuild', () => { buildPanels(); App.UI.showTab(App.State.tab); });
      let tab = 'meta';
      try { tab = sessionStorage.getItem('daio-tab') || 'meta'; } catch (_) { /* 무시 */ }
      App.UI.showTab(App.DATA.TABS.some((t) => t.id === tab) ? tab : 'meta');
      App.State.status(restored ? '이전 작업을 불러왔습니다' : '새 보고서');
      window.addEventListener('beforeunload', () => App.State.saveNow());
      /* 이전 버전에서 저장한 큰 이미지는 한도에 맞게 줄여 둔다 */
      if (restored) U.fitImagesTotal(App.S.images).then((saved) => { if (saved > 0) { App.emit('images'); App.State.changed('img'); } }, () => {});
    } catch (e) {
      console.error(e);
      document.body.prepend(U.h('p', { class: 'fatal', role: 'alert', text: '프로그램을 시작하지 못했습니다: ' + e.message }));
    }
  });
})();
