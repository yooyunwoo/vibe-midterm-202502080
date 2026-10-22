(function () {
  'use strict';

  const Cafe = (window.Cafe = window.Cafe || {});

  // props: class, text, data({k: v}), 그 외는 속성으로 설정. children은 노드/문자열 배열.
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        const value = props[key];
        if (value === undefined || value === null || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'data') Object.keys(value).forEach(function (d) { node.dataset[d] = value[d]; });
        else node.setAttribute(key, value === true ? '' : value);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.append(child);
    });
    return node;
  }

  function formatPrice(amount) {
    return amount.toLocaleString('ko-KR') + '원';
  }

  function formatTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // 색만으로 구분하지 않도록 텍스트 라벨을 함께 표시한다.
  function statusBadge(status) {
    return el('span', { class: 'badge badge-' + status, text: Cafe.STATUS[status] || status });
  }

  let toastTimer = null;
  function toast(message) {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, 2600);
  }

  Cafe.ui = { el: el, formatPrice: formatPrice, formatTime: formatTime, statusBadge: statusBadge, toast: toast };
})();
