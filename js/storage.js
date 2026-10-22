(function () {
  'use strict';

  const Cafe = (window.Cafe = window.Cafe || {});

  const SCHEMA_VERSION = 1;
  const KEYS = {
    menu: 'cafe_menu',
    cart: 'cafe_cart',
    orders: 'cafe_orders',
    orderSeq: 'cafe_order_seq',
    activeView: 'cafe_active_view',
    schemaVersion: 'cafe_schema_version',
    adminAuth: 'cafe_admin_auth'
  };

  // 저장소 접근이 막혀 있어도(시크릿 모드 등) 앱이 죽지 않도록 모든 접근을 감싼다.
  function read(store, key, fallback) {
    try {
      const raw = store.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(store, key, value) {
    try {
      store.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isValidMenu(item) {
    return isObject(item) && typeof item.id === 'string' && typeof item.name === 'string' &&
      Number.isInteger(item.price) && item.price >= 0;
  }

  function isValidCartItem(item) {
    return isObject(item) && typeof item.menuId === 'string' && typeof item.name === 'string' &&
      Number.isInteger(item.unitPrice) && Number.isInteger(item.quantity) && item.quantity > 0;
  }

  function isValidOrder(order) {
    return isObject(order) && Number.isInteger(order.id) && Array.isArray(order.items) &&
      Number.isInteger(order.totalPrice) && Cafe.STATUS[order.status] !== undefined;
  }

  // 배열이 아니거나 손상된 항목이 섞여 있으면 걸러내고, 전체가 손상됐으면 빈 배열로 복구한다.
  function loadList(key, isValid) {
    const value = read(localStorage, key, []);
    if (!Array.isArray(value)) {
      write(localStorage, key, []);
      return [];
    }
    const valid = value.filter(isValid);
    if (valid.length !== value.length) write(localStorage, key, valid);
    return valid;
  }

  function init() {
    const version = read(localStorage, KEYS.schemaVersion, null);
    if (version !== SCHEMA_VERSION) {
      // 현재는 v1만 있으므로 마이그레이션 없이 버전만 기록한다.
      write(localStorage, KEYS.schemaVersion, SCHEMA_VERSION);
    }
    if (getMenu().length === 0) {
      saveMenu(Cafe.MENU_SEED.map(function (item) { return Object.assign({}, item); }));
    }
  }

  function getMenu() { return loadList(KEYS.menu, isValidMenu); }
  function saveMenu(menu) { return write(localStorage, KEYS.menu, menu); }

  function getCart() { return loadList(KEYS.cart, isValidCartItem); }
  function saveCart(cart) { return write(localStorage, KEYS.cart, cart); }

  function getOrders() { return loadList(KEYS.orders, isValidOrder); }
  function saveOrders(orders) { return write(localStorage, KEYS.orders, orders); }

  // 시퀀스 값이 손상돼도 기존 주문번호와 겹치지 않도록 최댓값을 함께 고려한다.
  function nextOrderId() {
    const seq = Number(read(localStorage, KEYS.orderSeq, 0));
    const maxExisting = getOrders().reduce(function (max, order) { return Math.max(max, order.id); }, 0);
    const next = Math.max(Number.isInteger(seq) ? seq : 0, maxExisting) + 1;
    write(localStorage, KEYS.orderSeq, next);
    return next;
  }

  function getActiveView() { return read(localStorage, KEYS.activeView, null); }
  function setActiveView(view) { return write(localStorage, KEYS.activeView, view); }

  function isAdminAuthed() { return read(sessionStorage, KEYS.adminAuth, false) === true; }
  function setAdminAuthed(authed) {
    if (authed) return write(sessionStorage, KEYS.adminAuth, true);
    try { sessionStorage.removeItem(KEYS.adminAuth); } catch (e) { /* 무시 */ }
    return true;
  }

  // 다른 창에서 바뀐 데이터를 감지한다. 콜백에는 변경된 키 이름이 전달된다.
  function onExternalChange(callback) {
    window.addEventListener('storage', function (event) {
      if (event.key === null || Object.values(KEYS).indexOf(event.key) !== -1) callback(event.key);
    });
  }

  Cafe.storage = {
    KEYS: KEYS,
    init: init,
    getMenu: getMenu,
    saveMenu: saveMenu,
    getCart: getCart,
    saveCart: saveCart,
    getOrders: getOrders,
    saveOrders: saveOrders,
    nextOrderId: nextOrderId,
    getActiveView: getActiveView,
    setActiveView: setActiveView,
    isAdminAuthed: isAdminAuthed,
    setAdminAuthed: setAdminAuthed,
    onExternalChange: onExternalChange
  };
})();
