(function () {
  'use strict';

  const Cafe = (window.Cafe = window.Cafe || {});
  const el = Cafe.ui.el;
  const formatPrice = Cafe.ui.formatPrice;
  const toast = Cafe.ui.toast;
  const storage = Cafe.storage;

  const NEXT_STATUS = { received: 'preparing', preparing: 'done' };
  const NEXT_LABEL = { received: '제조 시작', preparing: '제조 완료' };
  const CANCELABLE = ['received', 'preparing'];
  const MAX_STOCK = 999;
  const LOW_STOCK = 5;
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
    const ranked = Cafe.ui.popularRanking(orders).slice(0, Cafe.POPULAR_COUNT);
    refs.popular.replaceChildren();
    if (ranked.length === 0) {
      refs.popular.append(el('li', { class: 'muted', text: '집계할 주문이 없어요.' }));
      return;
    }
    ranked.forEach(function (entry) {
      refs.popular.append(el('li', {}, [el('span', { text: entry.name }), el('strong', { text: entry.quantity + '개' })]));
    });
  }

  function renderMenuStock() {
    refs.menu.replaceChildren();
    storage.getMenu().forEach(function (menu) {
      // 재고가 0이면 재고를 먼저 채워야 판매를 재개할 수 있다.
      const noStock = menu.stock === 0;
      refs.menu.append(el('li', {}, [
        el('div', { class: 'stock-name' }, [
          el('span', { class: menu.soldOut ? 'is-soldout-name' : '', text: menu.name }),
          menu.soldOut ? el('span', { class: 'badge badge-soldout', text: '품절' })
            : menu.stock <= LOW_STOCK ? el('span', { class: 'badge badge-received', text: '재고 부족' }) : null
        ]),
        el('input', {
          class: 'input stock-input',
          type: 'number',
          min: '0',
          max: String(MAX_STOCK),
          value: String(menu.stock),
          inputmode: 'numeric',
          'aria-label': menu.name + ' 재고 수량',
          data: { action: 'set-stock', id: menu.id }
        }),
        el('button', {
          class: 'btn btn-small ' + (menu.soldOut ? '' : 'btn-secondary'),
          type: 'button',
          text: menu.soldOut ? '판매 재개' : '품절 처리',
          'aria-label': menu.name + (menu.soldOut ? ' 판매 재개' : ' 품절 처리'),
          disabled: menu.soldOut && noStock,
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
    else if (nextStatus === 'canceled') restoreStock(order);
    renderDashboard();
  }

  // 취소된 주문의 수량만큼 재고를 되돌린다. 재고가 0이어서 품절이던 메뉴만 다시 판매 상태로 돌린다.
  function restoreStock(order) {
    const menu = storage.getMenu();
    order.items.forEach(function (item) {
      const target = menu.find(function (m) { return m.id === item.menuId; });
      if (!target) return;
      if (target.stock === 0) target.soldOut = false;
      target.stock = Math.min(MAX_STOCK, target.stock + item.quantity);
    });
    if (!storage.saveMenu(menu)) toast('재고를 되돌리지 못했어요.');
  }

  function setStock(menuId, value) {
    const menu = storage.getMenu();
    const item = menu.find(function (m) { return m.id === menuId; });
    if (!item) return;
    const stock = Number(value);
    if (value === '' || !Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
      toast('재고는 0~' + MAX_STOCK + ' 사이의 정수로 입력해주세요.');
      renderMenuStock();
      return;
    }
    item.stock = stock;
    item.soldOut = stock === 0;
    if (!storage.saveMenu(menu)) toast('재고를 저장하지 못했어요.');
    renderMenuStock();
  }

  function toggleSoldOut(menuId) {
    const menu = storage.getMenu();
    const item = menu.find(function (m) { return m.id === menuId; });
    if (!item) return;
    if (item.soldOut && item.stock === 0) return;
    item.soldOut = !item.soldOut;
    if (!storage.saveMenu(menu)) toast('메뉴를 저장하지 못했어요.');
    renderMenuStock();
  }

  function bindEvents() {
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
    refs.menu.addEventListener('change', function (event) {
      const input = event.target.closest('[data-action="set-stock"]');
      if (input) setStock(input.dataset.id, input.value.trim());
    });
    storage.onExternalChange(function () {
      if (!refs.view.hidden) renderDashboard();
    });
  }

  function init() {
    ['view-admin:view', 'admin-summary:summary', 'admin-filters:filters', 'admin-search:search', 'admin-orders:orders',
      'admin-popular:popular', 'admin-menu:menu'
    ].forEach(function (pair) {
      const parts = pair.split(':');
      refs[parts[1]] = byId(parts[0]);
    });
    bindEvents();
  }

  Cafe.admin = { enter: renderDashboard };
  Cafe.router.register('admin', Cafe.admin);
  init();
})();
