(function () {
  'use strict';

  const Cafe = (window.Cafe = window.Cafe || {});
  const el = Cafe.ui.el;
  const formatPrice = Cafe.ui.formatPrice;
  const toast = Cafe.ui.toast;
  const storage = Cafe.storage;

  const MAX_QUANTITY = 99;
  const LOW_STOCK = 5;
  const state = { menu: [], cart: [], category: 'all', lookupId: null };
  const refs = {};

  function byId(id) { return document.getElementById(id); }

  function hasOptions(menu) { return menu.category !== 'dessert'; }

  const describeOptions = Cafe.ui.describeOptions;

  // 선택한 옵션의 추가금 합계
  function optionsExtra(options) {
    return Cafe.OPTIONS.reduce(function (sum, opt) { return options[opt.id] ? sum + opt.extra : sum; }, 0);
  }

  function cartKey(item) {
    return [item.menuId].concat(Cafe.OPTIONS.map(function (opt) { return item.options[opt.id] ? opt.id : ''; })).join('|');
  }

  function cartTotal(items) {
    return items.reduce(function (sum, item) { return sum + item.unitPrice * item.quantity; }, 0);
  }

  function cartQuantity(menuId) {
    return state.cart.filter(function (i) { return i.menuId === menuId; })
      .reduce(function (sum, i) { return sum + i.quantity; }, 0);
  }

  // 장바구니에 이미 담긴 수량을 뺀, 더 담을 수 있는 수량
  function availableStock(menu) {
    return Math.max(0, menu.stock - cartQuantity(menu.id));
  }

  function findMenu(menuId) {
    return state.menu.find(function (m) { return m.id === menuId; });
  }

  function persistCart() {
    if (!storage.saveCart(state.cart)) toast('장바구니를 저장하지 못했어요. 브라우저 저장소를 확인해주세요.');
  }

  /* ---------- 메뉴 목록 ---------- */

  function renderCategories() {
    refs.categories.replaceChildren();
    Cafe.CATEGORIES.forEach(function (category) {
      refs.categories.append(el('button', {
        class: 'pill',
        type: 'button',
        text: category.label,
        'aria-pressed': String(state.category === category.id),
        data: { category: category.id }
      }));
    });
  }

  function renderMenu() {
    refs.grid.replaceChildren();
    const items = state.menu.filter(function (m) { return state.category === 'all' || m.category === state.category; });
    if (items.length === 0) {
      refs.grid.append(el('p', { class: 'empty', text: '표시할 메뉴가 없어요.' }));
      return;
    }
    items.forEach(function (menu) {
      refs.grid.append(el('article', { class: 'card menu-card' + (menu.soldOut ? ' is-soldout' : '') }, [
        el('div', { class: 'menu-emoji', 'aria-hidden': 'true', text: menu.image || '☕' }),
        el('h3', { class: 'menu-name', text: menu.name }),
        el('p', { class: 'menu-desc', text: menu.description || '' }),
        !menu.soldOut && menu.stock <= LOW_STOCK ? el('p', { class: 'stock-note', text: menu.stock + '개 남음' }) : null,
        el('div', { class: 'menu-foot' }, [
          el('strong', { class: 'menu-price', text: formatPrice(menu.price) }),
          menu.soldOut
            ? el('span', { class: 'badge badge-soldout', text: '품절' })
            : el('button', { class: 'btn btn-small', type: 'button', text: '담기', 'aria-label': menu.name + ' 담기', data: { menuId: menu.id } })
        ])
      ]));
    });
  }

  /* ---------- 메뉴 상세 모달 ---------- */

  function optionGroup(selection, onChange) {
    const row = el('div', { class: 'choice-row' });
    Cafe.OPTIONS.forEach(function (opt) {
      const input = el('input', { type: 'checkbox', name: opt.id, value: opt.id });
      input.addEventListener('change', function () {
        selection[opt.id] = input.checked;
        onChange();
      });
      row.append(el('label', { class: 'choice' }, [input, el('span', { text: opt.label + ' (+' + formatPrice(opt.extra) + ')' })]));
    });
    return el('fieldset', { class: 'choice-group' }, [el('legend', { text: '옵션' }), row]);
  }

  function openMenuDialog(menu) {
    const maxQuantity = Math.min(MAX_QUANTITY, availableStock(menu));
    if (maxQuantity < 1) {
      toast('담을 수 있는 재고가 없어요. 장바구니에 이미 재고만큼 담겨 있어요.');
      return;
    }
    const selection = { shot: false, syrup: false, quantity: 1 };
    const withOptions = hasOptions(menu);
    const total = el('strong', { class: 'dialog-total' });
    const quantity = el('span', { class: 'stepper-value', text: '1', 'aria-live': 'polite' });
    const minus = el('button', { class: 'btn btn-secondary btn-round', type: 'button', text: '−', 'aria-label': '수량 줄이기' });
    const plus = el('button', { class: 'btn btn-secondary btn-round', type: 'button', text: '+', 'aria-label': '수량 늘리기' });
    const cancel = el('button', { class: 'btn btn-secondary', type: 'button', text: '취소' });
    const add = el('button', { class: 'btn', type: 'button', text: '담기' });

    function unitPrice() { return menu.price + (withOptions ? optionsExtra(selection) : 0); }
    function update() {
      quantity.textContent = String(selection.quantity);
      minus.disabled = selection.quantity <= 1;
      plus.disabled = selection.quantity >= maxQuantity;
      total.textContent = formatPrice(unitPrice() * selection.quantity);
    }

    minus.addEventListener('click', function () { selection.quantity -= 1; update(); });
    plus.addEventListener('click', function () { selection.quantity += 1; update(); });
    cancel.addEventListener('click', function () { refs.menuDialog.close(); });
    add.addEventListener('click', function () {
      const options = withOptions ? { shot: selection.shot, syrup: selection.syrup } : {};
      if (addToCart(menu.id, options, selection.quantity)) refs.menuDialog.close();
    });

    const children = [
      el('div', { class: 'dialog-head' }, [
        el('div', { class: 'menu-emoji menu-emoji-small', 'aria-hidden': 'true', text: menu.image || '☕' }),
        el('div', {}, [
          el('h2', { class: 'section-title', id: 'menu-dialog-title', text: menu.name }),
          el('p', { class: 'menu-desc', text: menu.description || '' }),
          el('p', { class: 'muted', text: '남은 수량 ' + menu.stock + '개' })
        ])
      ])
    ];
    if (withOptions) children.push(optionGroup(selection, update));
    children.push(
      el('div', { class: 'dialog-row' }, [el('span', { text: '수량' }), el('div', { class: 'stepper' }, [minus, quantity, plus])]),
      el('div', { class: 'dialog-row' }, [el('span', { text: '금액' }), total]),
      el('div', { class: 'dialog-actions' }, [cancel, add])
    );

    refs.menuBody.replaceChildren.apply(refs.menuBody, children);
    update();
    refs.menuDialog.showModal();
  }

  /* ---------- 장바구니 ---------- */

  function addToCart(menuId, options, quantity) {
    // 다이얼로그를 열어둔 사이 품절될 수 있으므로 저장소의 최신 메뉴로 다시 확인한다.
    state.menu = storage.getMenu();
    const menu = findMenu(menuId);
    if (!menu || menu.soldOut) {
      toast('품절된 메뉴예요.');
      renderMenu();
      return false;
    }
    if (cartQuantity(menu.id) + quantity > menu.stock) {
      toast(menu.name + ' 재고가 부족해요. (남은 수량 ' + menu.stock + '개)');
      return false;
    }
    const unitPrice = menu.price + optionsExtra(options);
    const newItem = { menuId: menu.id, name: menu.name, options: options, unitPrice: unitPrice, quantity: quantity };
    const existing = state.cart.find(function (item) { return cartKey(item) === cartKey(newItem); });
    if (existing) existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + quantity);
    else state.cart.push(newItem);
    persistCart();
    renderCart();
    toast(menu.name + '을(를) 담았어요.');
    return true;
  }

  function changeQuantity(key, delta) {
    const item = state.cart.find(function (i) { return cartKey(i) === key; });
    if (!item) return;
    const menu = findMenu(item.menuId);
    const limit = Math.min(MAX_QUANTITY, item.quantity + (menu ? availableStock(menu) : 0));
    item.quantity = Math.min(limit, Math.max(1, item.quantity + delta));
    persistCart();
    renderCart();
  }

  function removeFromCart(key) {
    state.cart = state.cart.filter(function (i) { return cartKey(i) !== key; });
    persistCart();
    renderCart();
  }

  function clearCart() {
    state.cart = [];
    persistCart();
    renderCart();
  }

  function renderCart() {
    const count = state.cart.reduce(function (sum, item) { return sum + item.quantity; }, 0);
    refs.cartCount.textContent = String(count);
    refs.cartCount.hidden = count === 0;
    refs.cartButton.setAttribute('aria-label', '장바구니 열기 (' + count + '개)');

    refs.cartItems.replaceChildren();
    if (state.cart.length === 0) {
      refs.cartItems.append(el('li', { class: 'empty', text: '장바구니가 비어 있어요.' }));
    }
    state.cart.forEach(function (item) {
      const key = cartKey(item);
      const menu = findMenu(item.menuId);
      const soldOut = !menu || menu.soldOut;
      const optionText = describeOptions(item.options);
      refs.cartItems.append(el('li', { class: 'cart-item' + (soldOut ? ' is-soldout' : '') }, [
        el('div', { class: 'cart-item-info' }, [
          el('strong', { text: item.name }),
          optionText ? el('span', { class: 'muted', text: optionText }) : null,
          soldOut ? el('span', { class: 'badge badge-soldout', text: '품절' }) : null,
          el('span', { class: 'muted', text: formatPrice(item.unitPrice) })
        ]),
        el('div', { class: 'stepper' }, [
          el('button', { class: 'btn btn-secondary btn-round', type: 'button', text: '−', 'aria-label': item.name + ' 수량 줄이기', disabled: item.quantity <= 1, data: { action: 'dec', key: key } }),
          el('span', { class: 'stepper-value', text: String(item.quantity) }),
          el('button', { class: 'btn btn-secondary btn-round', type: 'button', text: '+', 'aria-label': item.name + ' 수량 늘리기', disabled: item.quantity >= MAX_QUANTITY || !menu || availableStock(menu) < 1, data: { action: 'inc', key: key } })
        ]),
        el('strong', { class: 'cart-item-sum', text: formatPrice(item.unitPrice * item.quantity) }),
        el('button', { class: 'btn btn-danger btn-small', type: 'button', text: '삭제', 'aria-label': item.name + ' 삭제', data: { action: 'remove', key: key } })
      ]));
    });
    refs.cartTotal.textContent = formatPrice(cartTotal(state.cart));
    refs.cartClear.disabled = state.cart.length === 0;
    refs.orderSubmit.disabled = state.cart.length === 0;
  }

  function isCartOpen() { return !refs.cartPanel.hidden; }

  function openCart() {
    refs.cartPanel.hidden = false;
    refs.backdrop.hidden = false;
    refs.cartButton.setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');
    refs.cartClose.focus();
  }

  function closeCart(restoreFocus) {
    refs.cartPanel.hidden = true;
    refs.backdrop.hidden = true;
    refs.cartButton.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
    if (restoreFocus) refs.cartButton.focus();
  }

  /* ---------- 주문 ---------- */

  function setNameError(visible) {
    refs.nameError.hidden = !visible;
    refs.nameInput.setAttribute('aria-invalid', String(visible));
  }

  function submitOrder(event) {
    event.preventDefault();
    if (state.cart.length === 0) return;

    const name = refs.nameInput.value.trim();
    if (!name) {
      setNameError(true);
      refs.nameInput.focus();
      return;
    }
    setNameError(false);

    state.menu = storage.getMenu();
    const unavailable = state.cart.filter(function (item) {
      const menu = findMenu(item.menuId);
      return !menu || menu.soldOut;
    });
    if (unavailable.length > 0) {
      renderCart();
      toast('품절된 메뉴가 있어요: ' + unavailable.map(function (i) { return i.name; }).join(', '));
      return;
    }

    const shortage = state.cart.map(function (item) { return findMenu(item.menuId); })
      .filter(function (menu, index, menus) { return menus.indexOf(menu) === index && cartQuantity(menu.id) > menu.stock; });
    if (shortage.length > 0) {
      renderCart();
      toast('재고가 부족해요: ' + shortage.map(function (m) { return m.name + ' (남은 ' + m.stock + '개)'; }).join(', '));
      return;
    }

    const order = {
      id: storage.nextOrderId(),
      createdAt: new Date().toISOString(),
      customerName: name,
      note: refs.noteInput.value.trim(),
      items: state.cart.map(function (item) { return Object.assign({}, item, { options: Object.assign({}, item.options) }); }),
      totalPrice: cartTotal(state.cart),
      status: 'received'
    };
    // 재고를 먼저 차감하고, 주문 저장에 실패하면 차감을 되돌린다.
    const originalMenu = storage.getMenu();
    const deducted = originalMenu.map(function (menu) {
      const sold = cartQuantity(menu.id);
      if (sold === 0) return menu;
      const stock = menu.stock - sold;
      return Object.assign({}, menu, { stock: stock, soldOut: menu.soldOut || stock === 0 });
    });
    const orders = storage.getOrders();
    orders.push(order);
    if (!storage.saveMenu(deducted) || !storage.saveOrders(orders)) {
      storage.saveMenu(originalMenu);
      toast('주문을 저장하지 못했어요. 브라우저 저장소를 확인해주세요.');
      return;
    }
    state.menu = deducted;
    renderMenu();

    state.cart = [];
    persistCart();
    renderCart();
    refs.orderForm.reset();
    closeCart(false);
    state.lookupId = order.id;
    refs.lookupInput.value = String(order.id);
    renderLookup();
    showComplete(order);
  }

  function orderItemList(order) {
    const list = el('ul', { class: 'order-lines' });
    order.items.forEach(function (item) {
      const optionText = describeOptions(item.options || {});
      list.append(el('li', {}, [
        el('span', { text: item.name + (optionText ? ' (' + optionText + ')' : '') + ' × ' + item.quantity }),
        el('span', { text: formatPrice(item.unitPrice * item.quantity) })
      ]));
    });
    return list;
  }

  function showComplete(order) {
    const close = el('button', { class: 'btn btn-block', type: 'button', text: '확인' });
    close.addEventListener('click', function () { refs.completeDialog.close(); });
    refs.completeBody.replaceChildren(
      el('h2', { class: 'section-title', id: 'complete-title', text: '주문이 접수되었어요' }),
      el('p', { class: 'order-number', text: '주문번호 ' + order.id }),
      el('div', { class: 'dialog-row' }, [el('span', { text: '상태' }), Cafe.ui.statusBadge(order.status)]),
      orderItemList(order),
      el('div', { class: 'dialog-row' }, [el('span', { text: '합계' }), el('strong', { text: formatPrice(order.totalPrice) })]),
      close
    );
    refs.completeDialog.showModal();
  }

  /* ---------- 주문 조회 ---------- */

  function renderLookup() {
    refs.lookupResult.replaceChildren();
    if (state.lookupId === null) return;
    const order = storage.getOrders().find(function (o) { return o.id === state.lookupId; });
    if (!order) {
      refs.lookupResult.append(el('p', { class: 'empty', text: '해당 주문번호를 찾을 수 없어요.' }));
      return;
    }
    refs.lookupResult.append(el('div', { class: 'lookup-card' }, [
      el('div', { class: 'dialog-row' }, [el('strong', { text: '주문번호 ' + order.id }), Cafe.ui.statusBadge(order.status)]),
      el('p', { class: 'muted', text: Cafe.ui.formatTime(order.createdAt) + ' · ' + order.customerName }),
      orderItemList(order),
      el('div', { class: 'dialog-row' }, [el('span', { text: '합계' }), el('strong', { text: formatPrice(order.totalPrice) })])
    ]));
  }

  /* ---------- 초기화 ---------- */

  function reload() {
    state.menu = storage.getMenu();
    state.cart = storage.getCart();
    renderMenu();
    renderCart();
    renderLookup();
  }

  function bindEvents() {
    refs.categories.addEventListener('click', function (event) {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      state.category = button.dataset.category;
      renderCategories();
      renderMenu();
    });
    refs.grid.addEventListener('click', function (event) {
      const button = event.target.closest('[data-menu-id]');
      const menu = button && findMenu(button.dataset.menuId);
      if (menu) openMenuDialog(menu);
    });
    refs.cartItems.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const key = button.dataset.key;
      if (button.dataset.action === 'inc') changeQuantity(key, 1);
      if (button.dataset.action === 'dec') changeQuantity(key, -1);
      if (button.dataset.action === 'remove') removeFromCart(key);
    });
    refs.cartClear.addEventListener('click', clearCart);
    refs.cartButton.addEventListener('click', function () { if (isCartOpen()) closeCart(true); else openCart(); });
    refs.cartClose.addEventListener('click', function () { closeCart(true); });
    refs.backdrop.addEventListener('click', function () { closeCart(true); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isCartOpen()) closeCart(true);
    });
    refs.orderForm.addEventListener('submit', submitOrder);
    refs.nameInput.addEventListener('input', function () { if (refs.nameInput.value.trim()) setNameError(false); });
    refs.lookupForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const id = Number(refs.lookupInput.value);
      state.lookupId = Number.isInteger(id) && id > 0 ? id : null;
      renderLookup();
    });
    [refs.menuDialog, refs.completeDialog].forEach(function (dialog) {
      // 백드롭을 누르면 닫는다. 내용 영역 클릭은 target이 dialog가 아니다.
      dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    });
    storage.onExternalChange(function () { if (refs.view && !refs.view.hidden) reload(); });
  }

  function init() {
    ['category-tabs:categories', 'menu-grid:grid', 'cart-button:cartButton', 'cart-count:cartCount', 'cart-panel:cartPanel',
      'cart-backdrop:backdrop', 'cart-close:cartClose', 'cart-clear:cartClear', 'cart-items:cartItems', 'cart-total:cartTotal',
      'order-form:orderForm', 'customer-name:nameInput', 'name-error:nameError', 'order-note:noteInput', 'order-submit:orderSubmit',
      'menu-dialog:menuDialog', 'menu-dialog-body:menuBody', 'complete-dialog:completeDialog', 'complete-body:completeBody',
      'lookup-form:lookupForm', 'lookup-input:lookupInput', 'lookup-result:lookupResult', 'view-customer:view'
    ].forEach(function (pair) {
      const parts = pair.split(':');
      refs[parts[1]] = byId(parts[0]);
    });
    bindEvents();
    renderCategories();
  }

  Cafe.customer = {
    enter: function () { reload(); },
    leave: function () { if (isCartOpen()) closeCart(false); }
  };
  Cafe.router.register('customer', Cafe.customer);
  init();
})();
