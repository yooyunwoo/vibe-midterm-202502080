(function () {
  'use strict';

  const Cafe = (window.Cafe = window.Cafe || {});
  const el = Cafe.ui.el;
  const formatPrice = Cafe.ui.formatPrice;
  const toast = Cafe.ui.toast;
  const storage = Cafe.storage;

  // 데모용 비밀번호. 클라이언트 코드라 보안 수단이 아니라 화면 접근을 구분하는 용도다.
  const ADMIN_PIN = '1234';
  const NEXT_STATUS = { received: 'preparing', preparing: 'done' };
  const NEXT_LABEL = { received: '준비 시작', preparing: '완료 처리' };
  const CANCELABLE = ['received', 'preparing'];
  const FILTERS = [{ id: 'all', label: '전체' }].concat(
    Object.keys(Cafe.STATUS).map(function (id) { return { id: id, label: Cafe.STATUS[id] }; })
  );

  const state = { filter: 'all', query: '' };
  const refs = {};

  function byId(id) { return document.getElementById(id); }

  function isToday(iso) {
    const date = new Date(iso);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  }

  function sortedOrders() {
    return storage.getOrders().sort(function (a, b) { return b.id - a.id; });
  }

  /* ---------- 렌더링 ---------- */

  function summaryCard(label, value, wide) {
    return el('div', { class: 'card summary-card' + (wide ? ' summary-wide' : '') }, [
      el('span', { class: 'muted', text: label }),
      el('strong', { class: 'summary-value', text: value })
    ]);
  }

  function renderSummary(orders) {
    const today = orders.filter(function (o) { return isToday(o.createdAt); });
    const count = function (status) { return today.filter(function (o) { return o.status === status; }).length; };
    const sales = today.reduce(function (sum, o) { return o.status === 'canceled' ? sum : sum + o.totalPrice; }, 0);
    refs.summary.replaceChildren(
      summaryCard('오늘 주문', today.length + '건'),
      summaryCard('접수', count('received') + '건'),
      summaryCard('준비중', count('preparing') + '건'),
      summaryCard('완료', count('done') + '건'),
      summaryCard('오늘 매출', formatPrice(sales), true)
    );
  }

  function renderFilters() {
    refs.filters.replaceChildren();
    FILTERS.forEach(function (filter) {
      refs.filters.append(el('button', {
        class: 'pill',
        type: 'button',
        text: filter.label,
        'aria-pressed': String(state.filter === filter.id),
        data: { filter: filter.id }
      }));
    });
  }

  function matchesQuery(order) {
    const query = state.query.trim().toLowerCase();
    if (!query) return true;
    return String(order.id) === query.replace('#', '') || String(order.customerName || '').toLowerCase().indexOf(query) !== -1;
  }

  function orderCard(order) {
    const actions = el('div', { class: 'order-actions' });
    if (NEXT_STATUS[order.status]) {
      actions.append(el('button', { class: 'btn', type: 'button', text: NEXT_LABEL[order.status], data: { action: 'advance', id: String(order.id) } }));
    }
    if (CANCELABLE.indexOf(order.status) !== -1) {
      actions.append(el('button', { class: 'btn btn-danger', type: 'button', text: '취소', data: { action: 'cancel', id: String(order.id) } }));
    }

    const lines = el('ul', { class: 'order-lines' });
    order.items.forEach(function (item) {
      const options = Cafe.ui.describeOptions(item.options);
      lines.append(el('li', {}, [
        el('span', { text: item.name + (options ? ' (' + options + ')' : '') + ' × ' + item.quantity }),
        el('span', { text: formatPrice(item.unitPrice * item.quantity) })
      ]));
    });

    return el('article', { class: 'card order-card' }, [
      el('div', { class: 'dialog-row' }, [el('strong', { class: 'order-id', text: '#' + order.id }), Cafe.ui.statusBadge(order.status)]),
      el('p', { class: 'muted', text: Cafe.ui.formatTime(order.createdAt) + ' · ' + (order.customerName || '-') }),
      lines,
      order.note ? el('p', { class: 'order-note', text: '요청: ' + order.note }) : null,
      el('div', { class: 'dialog-row' }, [el('span', { text: '합계' }), el('strong', { text: formatPrice(order.totalPrice) })]),
      actions.children.length ? actions : null
    ]);
  }

  function renderOrders(orders) {
    refs.orders.replaceChildren();
    const visible = orders.filter(function (o) {
      return (state.filter === 'all' || o.status === state.filter) && matchesQuery(o);
    });
    if (visible.length === 0) {
      refs.orders.append(el('p', { class: 'empty card', text: orders.length === 0 ? '아직 들어온 주문이 없어요.' : '조건에 맞는 주문이 없어요.' }));
      return;
    }
    visible.forEach(function (order) { refs.orders.append(orderCard(order)); });
  }

  function renderPopular(orders) {
    const totals = {};
    orders.forEach(function (order) {
      if (order.status === 'canceled') return;
      order.items.forEach(function (item) { totals[item.name] = (totals[item.name] || 0) + item.quantity; });
    });
    const ranked = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; }).slice(0, 5);
    refs.popular.replaceChildren();
    if (ranked.length === 0) {
      refs.popular.append(el('li', { class: 'muted', text: '집계할 주문이 없어요.' }));
      return;
    }
    ranked.forEach(function (name) {
      refs.popular.append(el('li', {}, [el('span', { text: name }), el('strong', { text: totals[name] + '개' })]));
    });
  }

  function renderMenuStock() {
    refs.menu.replaceChildren();
    storage.getMenu().forEach(function (menu) {
      refs.menu.append(el('li', {}, [
        el('span', { class: menu.soldOut ? 'is-soldout-name' : '', text: menu.name }),
        el('button', {
          class: 'btn btn-small ' + (menu.soldOut ? '' : 'btn-secondary'),
          type: 'button',
          text: menu.soldOut ? '판매 재개' : '품절 처리',
          'aria-label': menu.name + (menu.soldOut ? ' 판매 재개' : ' 품절 처리'),
          data: { action: 'stock', id: menu.id }
        })
      ]));
    });
  }

  function renderDashboard() {
    const orders = sortedOrders();
    renderSummary(orders);
    renderFilters();
    renderOrders(orders);
    renderPopular(orders);
    renderMenuStock();
  }

  // 인증 전에는 주문 데이터를 DOM에 올리지 않는다.
  function clearDashboard() {
    ['summary', 'filters', 'orders', 'popular', 'menu'].forEach(function (name) { refs[name].replaceChildren(); });
  }

  function showLogin() {
    clearDashboard();
    refs.dashboard.hidden = true;
    refs.login.hidden = false;
    refs.pinInput.value = '';
    refs.pinError.hidden = true;
    refs.pinInput.setAttribute('aria-invalid', 'false');
  }

  function showDashboard() {
    refs.login.hidden = true;
    refs.dashboard.hidden = false;
    renderDashboard();
  }

  /* ---------- 동작 ---------- */

  function updateStatus(id, nextStatus) {
    const orders = storage.getOrders();
    const order = orders.find(function (o) { return o.id === id; });
    if (!order) return;
    const allowed = NEXT_STATUS[order.status] === nextStatus || (nextStatus === 'canceled' && CANCELABLE.indexOf(order.status) !== -1);
    if (!allowed) {
      toast('변경할 수 없는 상태예요.');
      renderDashboard();
      return;
    }
    order.status = nextStatus;
    if (!storage.saveOrders(orders)) toast('주문 상태를 저장하지 못했어요.');
    renderDashboard();
  }

  function toggleSoldOut(menuId) {
    const menu = storage.getMenu();
    const item = menu.find(function (m) { return m.id === menuId; });
    if (!item) return;
    item.soldOut = !item.soldOut;
    if (!storage.saveMenu(menu)) toast('메뉴를 저장하지 못했어요.');
    renderMenuStock();
  }

  function onLogin(event) {
    event.preventDefault();
    if (refs.pinInput.value !== ADMIN_PIN) {
      refs.pinError.hidden = false;
      refs.pinInput.setAttribute('aria-invalid', 'true');
      refs.pinInput.focus();
      return;
    }
    storage.setAdminAuthed(true);
    showDashboard();
  }

  function onLogout() {
    storage.setAdminAuthed(false);
    showLogin();
    refs.pinInput.focus();
  }

  function bindEvents() {
    refs.login.addEventListener('submit', onLogin);
    refs.logout.addEventListener('click', onLogout);
    refs.filters.addEventListener('click', function (event) {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      state.filter = button.dataset.filter;
      renderFilters();
      renderOrders(sortedOrders());
    });
    refs.search.addEventListener('input', function () {
      state.query = refs.search.value;
      renderOrders(sortedOrders());
    });
    refs.orders.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const id = Number(button.dataset.id);
      if (button.dataset.action === 'advance') {
        const order = storage.getOrders().find(function (o) { return o.id === id; });
        if (order && NEXT_STATUS[order.status]) updateStatus(id, NEXT_STATUS[order.status]);
      }
      if (button.dataset.action === 'cancel' && window.confirm('주문 #' + id + '을(를) 취소할까요?')) updateStatus(id, 'canceled');
    });
    refs.menu.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action="stock"]');
      if (button) toggleSoldOut(button.dataset.id);
    });
    storage.onExternalChange(function () {
      if (!refs.view.hidden && storage.isAdminAuthed()) renderDashboard();
    });
  }

  function init() {
    ['view-admin:view', 'admin-login:login', 'admin-pin:pinInput', 'admin-pin-error:pinError', 'admin-dashboard:dashboard',
      'admin-logout:logout', 'admin-summary:summary', 'admin-filters:filters', 'admin-search:search', 'admin-orders:orders',
      'admin-popular:popular', 'admin-menu:menu'
    ].forEach(function (pair) {
      const parts = pair.split(':');
      refs[parts[1]] = byId(parts[0]);
    });
    bindEvents();
  }

  Cafe.admin = {
    enter: function () {
      if (storage.isAdminAuthed()) showDashboard();
      else {
        showLogin();
        refs.pinInput.focus();
      }
    },
    leave: clearDashboard
  };
  Cafe.router.register('admin', Cafe.admin);
  init();
})();
