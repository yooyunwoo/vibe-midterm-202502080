(function () {
  'use strict';

  const Cafe = (window.Cafe = window.Cafe || {});

  const HASH_BY_VIEW = { customer: '#order', admin: '#admin' };
  const VIEW_BY_HASH = { '#order': 'customer', '#admin': 'admin' };
  const handlers = {};
  let current = null;

  // handlers: { enter(), leave() }
  function register(name, viewHandlers) {
    handlers[name] = viewHandlers;
  }

  function show(name) {
    if (!handlers[name]) name = 'customer';
    if (current && current !== name && handlers[current].leave) handlers[current].leave();
    current = name;

    document.querySelectorAll('[data-view-section]').forEach(function (section) {
      section.hidden = section.dataset.viewSection !== name;
    });
    document.querySelectorAll('.view-tab').forEach(function (tab) {
      const selected = tab.dataset.view === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    document.getElementById('cart-button').hidden = name !== 'customer';
    document.title = (name === 'admin' ? '카페 온기 - 관리자' : '카페 온기 - 주문');

    Cafe.storage.setActiveView(name);
    if (handlers[name].enter) handlers[name].enter();
  }

  // 해시를 바꾸면 hashchange가 show()를 호출한다. 이미 같은 해시면 직접 호출한다.
  function go(name) {
    if (location.hash !== HASH_BY_VIEW[name]) location.hash = HASH_BY_VIEW[name];
    else show(name);
  }

  function initialView() {
    const fromHash = VIEW_BY_HASH[location.hash];
    if (fromHash) return fromHash;
    const stored = Cafe.storage.getActiveView();
    // 인증이 없으면 관리자 탭 대신 고객 탭으로 복원한다.
    if (stored === 'admin' && !Cafe.storage.isAdminAuthed()) return 'customer';
    return stored === 'admin' ? 'admin' : 'customer';
  }

  function start() {
    Cafe.storage.init();

    const tabs = Array.prototype.slice.call(document.querySelectorAll('.view-tab'));
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { go(tab.dataset.view); });
      tab.addEventListener('keydown', function (event) {
        let target = null;
        if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length];
        if (!target) return;
        event.preventDefault();
        target.focus();
        go(target.dataset.view);
      });
    });
    window.addEventListener('hashchange', function () {
      show(VIEW_BY_HASH[location.hash] || 'customer');
    });

    const view = initialView();
    history.replaceState(null, '', HASH_BY_VIEW[view]);
    show(view);
  }

  Cafe.router = { register: register, go: go };
  // defer 스크립트가 모두 실행되어 뷰가 등록된 뒤에 시작한다.
  document.addEventListener('DOMContentLoaded', start);
})();
