(function () {
  'use strict';

  const Cafe = (window.Cafe = window.Cafe || {});

  const SCHEMA_VERSION = 4;
  const KEYS = {
    menu: 'cafe_menu',
    cart: 'cafe_cart',
    orders: 'cafe_orders',
    orderSeq: 'cafe_order_seq',
    activeView: 'cafe_active_view',
    schemaVersion: 'cafe_schema_version'
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
      Number.isInteger(item.price) && item.price >= 0 && Number.isInteger(item.stock) && item.stock >= 0;
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

  // v2: 메뉴가 5개 음료로 줄고 옵션이 샷/시럽으로 바뀌었다. 품절 상태는 id 기준으로 유지하고,
  // 옵션 형식이 달라진 장바구니는 비운다. 기존 주문 기록은 그대로 둔다.
  function migrateV1toV2() {
    const soldOutById = {};
    getMenu().forEach(function (item) { soldOutById[item.id] = item.soldOut === true; });
    saveMenu(Cafe.MENU_SEED.map(function (item) {
      return Object.assign({}, item, { soldOut: item.id in soldOutById ? soldOutById[item.id] : item.soldOut });
    }));
    saveCart([]);
  }

  // v3: 메뉴에 재고(stock)가 생겼다. 기존 메뉴는 품절이면 0, 아니면 시드 재고로 채운다.
  // stock이 없는 기존 데이터는 getMenu()의 검증에서 걸러지므로 원본을 직접 읽는다.
  function migrateV2toV3() {
    const old = read(localStorage, KEYS.menu, []);
    if (!Array.isArray(old)) return;
    const seedById = {};
    Cafe.MENU_SEED.forEach(function (item) { seedById[item.id] = item; });
    saveMenu(old.filter(isObject).map(function (item) {
      const seed = seedById[item.id];
      const stock = item.soldOut === true ? 0 : (seed ? seed.stock : 10);
      return Object.assign({}, item, { stock: stock });
    }));
  }

  // v4: 크루아상이 두바이 쫀득 쿠키로 바뀌었다. 저장된 메뉴의 이름·설명·이미지를 시드 기준으로 맞추고
  // (재고·품절은 유지) 장바구니에 담긴 이름도 갱신한다. 지난 주문 기록은 그대로 둔다.
  function migrateV3toV4() {
    const seedById = {};
    Cafe.MENU_SEED.forEach(function (item) { seedById[item.id] = item; });
    const renamed = {};
    saveMenu(getMenu().map(function (item) {
      const seed = seedById[item.id];
      if (!seed) return item;
      renamed[item.id] = seed.name;
      return Object.assign({}, item, { name: seed.name, description: seed.description, image: seed.image });
    }));
    saveCart(getCart().map(function (item) {
      return renamed[item.menuId] ? Object.assign({}, item, { name: renamed[item.menuId] }) : item;
    }));
  }

  function init() {
    const version = read(localStorage, KEYS.schemaVersion, null);
    if (version !== SCHEMA_VERSION) {
      if (version === 1) migrateV1toV2();
      if (version === 1 || version === 2) migrateV2toV3();
      if (version !== null && version <= 3) migrateV3toV4();
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
    onExternalChange: onExternalChange
  };
})();
